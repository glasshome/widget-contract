import { compileMessage, parseCatalog } from "./i18n";
import type { CompiledCatalog, MessagePart } from "./i18n-format";

const ACCENTS: Readonly<Record<string, string>> = {
  a: "á",
  e: "é",
  i: "í",
  o: "ó",
  u: "ú",
  c: "ç",
  n: "ñ",
  A: "Á",
  E: "É",
  I: "Í",
  O: "Ó",
  U: "Ú",
  C: "Ç",
  N: "Ñ",
};

export function compileCatalogSource(text: string, origin: string): CompiledCatalog {
  const parsed = parseCatalog(text);
  if (!parsed.ok) {
    const error = parsed.error;
    const key = "key" in error ? `${error.key}: ` : "";
    const reason = "reason" in error ? error.reason : error.kind;
    throw new Error(`${origin}: ${key}${reason}`);
  }
  const out: Record<string, readonly MessagePart[]> = {};
  for (const [key, source] of parsed.value) {
    const compiled = compileMessage(source);
    if (!compiled.ok) throw new Error(`${origin}: ${key}: ${compiled.error}`);
    out[key] = compiled.value;
  }
  return out;
}

function accent(text: string): string {
  return text.replace(/[aeioucnAEIOUCN]/g, (letter) => ACCENTS[letter] ?? letter);
}

function literalLength(parts: readonly MessagePart[]): number {
  let total = 0;
  for (const part of parts) {
    if (typeof part === "string") total += part.length;
    else if ("branches" in part) {
      for (const branch of Object.values(part.branches)) total += literalLength(branch);
    }
  }
  return total;
}

function accentParts(parts: readonly MessagePart[]): MessagePart[] {
  return parts.map((part): MessagePart => {
    if (typeof part === "string") return accent(part);
    if ("branches" in part) {
      const branches: Record<string, readonly MessagePart[]> = {};
      for (const [name, branch] of Object.entries(part.branches))
        branches[name] = accentParts(branch);
      return "plural" in part
        ? { plural: part.plural, branches }
        : { select: part.select, branches };
    }
    return part;
  });
}

function bracket(parts: MessagePart[], tail: string): MessagePart[] {
  const out: MessagePart[] = ["[", ...parts, tail];
  return out.reduce<MessagePart[]>((merged, part) => {
    const prev = merged[merged.length - 1];
    if (typeof part === "string" && typeof prev === "string")
      merged[merged.length - 1] = prev + part;
    else merged.push(part);
    return merged;
  }, []);
}

export function pseudoCatalog(en: CompiledCatalog): CompiledCatalog {
  const out: Record<string, readonly MessagePart[]> = {};
  for (const [key, message] of Object.entries(en)) {
    const padding = "~".repeat(Math.ceil(0.4 * literalLength(message)));
    out[key] = bracket(accentParts(message), ` ${padding}]`);
  }
  return out;
}

export function catalogModule(catalog: CompiledCatalog): string {
  return `export default ${JSON.stringify(catalog)};\n`;
}
