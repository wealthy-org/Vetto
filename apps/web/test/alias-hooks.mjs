import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."); // apps/web
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const candidates = (b) => [b, `${b}.ts`, `${b}.tsx`, path.join(b, "index.ts")];

export async function resolve(specifier, context, nextResolve) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(root, specifier.slice(2));
  else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (base) {
    const hit = candidates(base).find(isFile);
    if (hit) return nextResolve(pathToFileURL(hit).href, context);
  }
  return nextResolve(specifier, context);
}