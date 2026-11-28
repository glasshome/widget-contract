export type MessagePart =
  | string
  | { arg: string }
  | { pound: true }
  | { plural: string; branches: Readonly<Record<string, readonly MessagePart[]>> }
  | { select: string; branches: Readonly<Record<string, readonly MessagePart[]>> };

export type CompiledMessage = readonly MessagePart[];
export type CompiledCatalog = Readonly<Record<string, CompiledMessage>>;

export type BundledCatalog = { v: 1; messages: CompiledCatalog };

export function readBundled(value: unknown): CompiledCatalog | null {
  if (typeof value !== "object" || value === null) return null;
  const { v, messages } = value as { v?: unknown; messages?: unknown };
  if (v !== 1 || typeof messages !== "object" || messages === null || Array.isArray(messages)) {
    return null;
  }
  return messages as CompiledCatalog;
}

export interface FormatEnv {
  plural(n: number): string;
  number(n: number): string;
}

type Args<T> = Readonly<Record<string, T | string | number>>;

function pick(
  branches: Readonly<Record<string, readonly MessagePart[]>>,
  ...keys: string[]
): readonly MessagePart[] {
  for (const key of keys) {
    if (Object.hasOwn(branches, key)) return branches[key] ?? [];
  }
  return branches["other"] ?? [];
}

function render<T>(
  parts: readonly MessagePart[],
  args: Args<T>,
  env: FormatEnv,
  pound: number | undefined,
  out: (string | T)[],
): void {
  const push = (value: string | T) => {
    const last = out.length - 1;
    const prev = out[last];
    if (typeof value === "string" && typeof prev === "string") out[last] = prev + value;
    else out.push(value);
  };
  for (const part of parts) {
    if (typeof part === "string") {
      push(part);
    } else if ("arg" in part) {
      const value = Object.hasOwn(args, part.arg) ? args[part.arg] : undefined;
      if (value === undefined) push(`{${part.arg}}`);
      else push(typeof value === "number" ? env.number(value) : value);
    } else if ("pound" in part) {
      push(pound === undefined ? "#" : env.number(pound));
    } else if ("plural" in part) {
      const value = Object.hasOwn(args, part.plural) ? args[part.plural] : undefined;
      if (typeof value !== "number") {
        push(`{${part.plural}}`);
        continue;
      }
      const branch = pick(part.branches, `=${value}`, env.plural(value));
      render(branch, args, env, value, out);
    } else {
      const value = Object.hasOwn(args, part.select) ? args[part.select] : undefined;
      render(pick(part.branches, String(value)), args, env, pound, out);
    }
  }
}

export function formatParts<T>(
  message: CompiledMessage,
  args: Args<T>,
  env: FormatEnv,
): (string | T)[] {
  const out: (string | T)[] = [];
  render(message, args, env, undefined, out);
  return out;
}

export function formatMessage(
  message: CompiledMessage,
  args: Readonly<Record<string, string | number>>,
  env: FormatEnv,
): string {
  return formatParts<string>(message, args, env).join("");
}
