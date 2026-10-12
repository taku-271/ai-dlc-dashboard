import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ArgError, DEFAULT_PORT, parseArgs, PortInUseError, startServer, type DashboardServer } from "../src/server.ts";
import type { DashboardPayload } from "../src/types.ts";
import { copyFixture } from "./helpers/fixture.ts";

describe("parseArgs", () => {
  test("defaults to cwd and port 4173", () => {
    expect(parseArgs([], "/repo")).toEqual({ root: "/repo", port: DEFAULT_PORT });
    expect(DEFAULT_PORT).toBe(4173);
  });
  test("--root and --port, both spellings", () => {
    expect(parseArgs(["--root", "sub", "--port", "5000"], "/repo")).toEqual({ root: "/repo/sub", port: 5000 });
    expect(parseArgs(["--root=/abs", "--port=0"], "/repo")).toEqual({ root: "/abs", port: 0 });
  });
  test("invalid input throws ArgError", () => {
    expect(() => parseArgs(["--port", "abc"])).toThrow(ArgError);
    expect(() => parseArgs(["--port"])).toThrow(ArgError);
    expect(() => parseArgs(["--bogus"])).toThrow(ArgError);
  });
});

describe("server", () => {
  let server: DashboardServer;
  let cleanup: () => void;

  beforeAll(() => {
    const f = copyFixture();
    cleanup = f.cleanup;
    server = startServer({ root: f.root, port: 0 });
  });
  afterAll(() => {
    server.stop();
    cleanup();
  });

  test("binds 127.0.0.1 only", () => {
    expect(server.url).toStartWith("http://127.0.0.1:");
  });

  test("/api/intents returns summary, attention and intents", async () => {
    const res = await fetch(`${server.url}/api/intents`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DashboardPayload;
    expect(body.intents).toHaveLength(9);
    expect(body.attention.map((v) => v.slug)).toEqual([
      "fx-idle",
      "fx-failed",
      "fx-questions",
      "fx-approval-inception",
      "fx-approval-construction",
    ]);
    expect(body.summary.blocked).toBe(3);
    expect(body.updateMode).toBe("watch");
  });

  test("serves the static UI and nothing outside the whitelist", async () => {
    const html = await fetch(`${server.url}/`);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain('data-testid="attention-list"');
    expect((await fetch(`${server.url}/app.js`)).headers.get("content-type")).toContain("javascript");
    expect((await fetch(`${server.url}/../src/server.ts`)).status).toBe(404);
    expect((await fetch(`${server.url}/package.json`)).status).toBe(404);
  });

  test("rejects foreign Host headers and non-GET methods", async () => {
    expect((await fetch(`${server.url}/api/intents`, { headers: { Host: "evil.example" } })).status).toBe(403);
    expect((await fetch(`${server.url}/api/intents`, { method: "POST" })).status).toBe(405);
  });

  test("/events opens an SSE stream with a hello event", async () => {
    const ac = new AbortController();
    const res = await fetch(`${server.url}/events`, { signal: ac.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toContain("event: hello");
    ac.abort();
  });

  test("a busy port is reported instead of picking another (FR-040)", () => {
    expect(() => startServer({ root: "/nonexistent", port: server.port })).toThrow(PortInUseError);
  });
});
