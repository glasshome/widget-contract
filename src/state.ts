import { z } from "zod";

export const WIDGET_STATE_LIMITS = {
  keyChars: 64,
  valueBytes: 8192,
  maxDepth: 8,
  keys: 32,
  instanceBytes: 65536,
  memberBytes: 131072,
  sendsPerMinute: 30,
  memberWritesPerMinute: 240,
  coalesceMs: 500,
} as const;

const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export type WidgetStateVerdict = "ok" | "key" | "value" | "keys" | "instance" | "off";

const encoder = new TextEncoder();
const utf8Bytes = (text: string) => encoder.encode(text).length;

function depthWithin(value: unknown, budget: number): boolean {
  if (value === null || typeof value !== "object") return true;
  if (budget === 0) return false;
  const children = Array.isArray(value) ? value : Object.values(value);
  return children.every((child) => depthWithin(child, budget - 1));
}

function isWidgetStateValue(json: string): boolean {
  if (utf8Bytes(json) > WIDGET_STATE_LIMITS.valueBytes) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return false;
  }
  return depthWithin(parsed, WIDGET_STATE_LIMITS.maxDepth);
}

export const WidgetStateKeySchema = z.string().regex(KEY);

export const WidgetStateValueSchema = z
  .string()
  .refine(isWidgetStateValue, "JSON text within the widget state value limits");

export function widgetStateBytes(entries: Readonly<Record<string, string>>): number {
  let total = 0;
  for (const [key, value] of Object.entries(entries)) total += utf8Bytes(key) + utf8Bytes(value);
  return total;
}

export function checkWidgetStateWrite(
  current: Readonly<Record<string, string>>,
  key: string,
  json: string | null,
): WidgetStateVerdict {
  if (!KEY.test(key)) return "key";
  if (json === null) return "ok";
  if (!isWidgetStateValue(json)) return "value";
  const replacing = Object.hasOwn(current, key);
  if (!replacing && Object.keys(current).length >= WIDGET_STATE_LIMITS.keys) return "keys";
  const next = { ...current, [key]: json };
  if (widgetStateBytes(next) > WIDGET_STATE_LIMITS.instanceBytes) return "instance";
  return "ok";
}

export interface MemoryWidgetState {
  snapshot(): Record<string, string>;
  write(key: string, json: string | null): WidgetStateVerdict;
}

export function createMemoryWidgetState(seed: Record<string, string> = {}): MemoryWidgetState {
  const entries: Record<string, string> = { ...seed };
  return {
    snapshot: () => ({ ...entries }),
    write(key, json) {
      const verdict = checkWidgetStateWrite(entries, key, json);
      if (verdict !== "ok") return verdict;
      if (json === null) delete entries[key];
      else entries[key] = json;
      return verdict;
    },
  };
}
