import { join } from "node:path";

import { BoardBuilder } from "./board";

const PUBLIC_DIR = join(import.meta.dir, "..", "public");
// 配信するのはこの 3 ファイルだけ（パスをそのままファイルシステムに渡さない）。
const STATIC: Record<string, { file: string; type: string }> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
};

const builder = new BoardBuilder();
const port = Number(process.env.PORT ?? 4319);

const server = Bun.serve({
  // セッションの中身を返すので、外部からは繋がせない。
  hostname: "127.0.0.1",
  port,
  fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/board") {
      try {
        return Response.json(builder.build(), { headers: { "cache-control": "no-store" } });
      } catch (error) {
        console.error("[server] ボードの生成に失敗しました", error);
        return Response.json({ error: "ボードの生成に失敗しました" }, { status: 500 });
      }
    }

    const asset = STATIC[pathname];
    if (asset) {
      return new Response(Bun.file(join(PUBLIC_DIR, asset.file)), {
        headers: { "content-type": asset.type, "cache-control": "no-store" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`AI-DLC Dashboard: http://${server.hostname}:${server.port}`);
