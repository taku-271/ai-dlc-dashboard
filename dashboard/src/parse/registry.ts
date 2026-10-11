import type { IntentRegistryEntry } from "../types.ts";

export type RegistryResult =
  | { ok: true; entries: IntentRegistryEntry[] }
  | { ok: false; reason: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** Parses `intents.json`. Broken input yields `{ ok: false }` instead of throwing. */
export function parseRegistry(text: string, space: string): RegistryResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `intents.json が JSON として読めない (${(e as Error).message})` };
  }
  if (!Array.isArray(data)) {
    return { ok: false, reason: "intents.json の最上位が配列ではない" };
  }
  const entries: IntentRegistryEntry[] = data.map((raw) => {
    const o = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      space,
      uuid: str(o.uuid),
      slug: str(o.slug),
      dirName: str(o.dirName),
      scope: str(o.scope),
      status: str(o.status),
    };
  });
  return { ok: true, entries };
}
