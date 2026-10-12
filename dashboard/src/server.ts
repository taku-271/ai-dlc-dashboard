// Local read-only dashboard server. Binds 127.0.0.1 only (NFR-002).
// Usage: bun dashboard/src/server.ts [--root <path>] [--port <number>]
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildPayload } from "./model/view.ts";
import { LocalFsSource } from "./source/local-fs.ts";
import type { IntentSource, WatchHandle } from "./source/source.ts";

export const HOST = "127.0.0.1";
export const DEFAULT_PORT = 4173;
const PUBLIC_DIR = join(import.meta.dir, "..", "public");

const STATIC_FILES: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.css": { file: "app.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
};

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'",
};

export interface CliArgs {
  root: string;
  port: number;
}

export class ArgError extends Error {}

export function parseArgs(argv: string[], cwd: string = process.cwd()): CliArgs {
  let root = cwd;
  let port = DEFAULT_PORT;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const [flag, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    const value = () => {
      const v = inline ?? argv[++i];
      if (v === undefined || v === "") throw new ArgError(`${flag} に値がありません`);
      return v;
    };
    if (flag === "--root") root = resolve(cwd, value());
    else if (flag === "--port") {
      const raw = value();
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 65535) throw new ArgError(`--port の値が不正です: ${raw}`);
      port = n;
    } else if (flag === "--help" || flag === "-h") {
      throw new ArgError("使い方: bun dashboard/src/server.ts [--root <パス>] [--port <番号>]");
    } else throw new ArgError(`不明な引数です: ${a}`);
  }
  return { root, port };
}

export class PortInUseError extends Error {
  constructor(readonly port: number) {
    super(`ポート ${port} は使用中です。--port で別の番号を指定してください。`);
  }
}

export interface DashboardServer {
  url: string;
  port: number;
  stop(): void;
}

/** Starts the HTTP server. Throws PortInUseError instead of picking another port (FR-040). */
export function startServer(opts: { root: string; port: number; source?: IntentSource }): DashboardServer {
  const source = opts.source ?? new LocalFsSource(opts.root);
  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const enc = new TextEncoder();

  const broadcast = (chunk: string) => {
    for (const c of clients) {
      try {
        c.enqueue(enc.encode(chunk));
      } catch {
        clients.delete(c);
      }
    }
  };

  const handle: WatchHandle = source.watch(() => broadcast(`event: change\ndata: {}\n\n`));
  const keepAlive = setInterval(() => broadcast(`: keep-alive\n\n`), 15000);

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: HOST,
      port: opts.port,
      idleTimeout: 0, // SSE connections stay open
      async fetch(req) {
        const url = new URL(req.url);
        // Reject DNS-rebinding style requests: only loopback host names are served.
        const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
        if (host !== HOST && host !== "localhost") return new Response("Forbidden", { status: 403 });
        if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });

        if (url.pathname === "/api/intents") {
          try {
            const now = new Date();
            const views = await source.listIntents(now);
            return Response.json(buildPayload(views, handle.mode, now), { headers: SECURITY_HEADERS });
          } catch (e) {
            console.error("[dashboard] /api/intents の生成に失敗しました:", e);
            return Response.json({ error: `読み込みに失敗しました: ${(e as Error).message}` }, { status: 500, headers: SECURITY_HEADERS });
          }
        }

        if (url.pathname === "/events") {
          let ctrl: ReadableStreamDefaultController<Uint8Array>;
          const stream = new ReadableStream<Uint8Array>({
            start(c) {
              ctrl = c;
              clients.add(c);
              c.enqueue(enc.encode(`retry: 2000\nevent: hello\ndata: ${JSON.stringify({ mode: handle.mode })}\n\n`));
            },
            cancel() {
              clients.delete(ctrl);
            },
          });
          req.signal.addEventListener("abort", () => clients.delete(ctrl));
          return new Response(stream, {
            headers: { ...SECURITY_HEADERS, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" },
          });
        }

        const asset = STATIC_FILES[url.pathname];
        if (asset) {
          try {
            const body = await readFile(join(PUBLIC_DIR, asset.file));
            return new Response(body, { headers: { ...SECURITY_HEADERS, "Content-Type": asset.type } });
          } catch (e) {
            console.error(`[dashboard] 静的ファイル ${asset.file} を読めません:`, e);
            return new Response("Internal Server Error", { status: 500 });
          }
        }
        return new Response("Not Found", { status: 404, headers: SECURITY_HEADERS });
      },
    });
  } catch (e) {
    handle.close();
    clearInterval(keepAlive);
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "EADDRINUSE" || /in use|EADDRINUSE/i.test(String((e as Error)?.message))) throw new PortInUseError(opts.port);
    throw e;
  }

  const port = server.port ?? opts.port;
  return {
    url: `http://${HOST}:${port}`,
    port,
    stop() {
      handle.close();
      clearInterval(keepAlive);
      for (const c of clients) {
        try {
          c.close();
        } catch {
          // already closed
        }
      }
      clients.clear();
      server.stop(true);
    },
  };
}

if (import.meta.main) {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
  try {
    const s = startServer(args);
    console.log(`AI-DLC ダッシュボード（読み取り専用）: ${s.url}`);
    console.log(`読み込み対象: ${join(args.root, "aidlc")}`);
    const shutdown = () => {
      s.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (e) {
    console.error(e instanceof PortInUseError ? e.message : `起動に失敗しました: ${(e as Error).message}`);
    process.exit(1);
  }
}
