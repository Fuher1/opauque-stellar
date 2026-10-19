/**
 * Flags dead code under src/: modules nothing imports, and named exports nothing imports.
 *
 *   npm run lint:unused
 *
 *   npm run lint:unused -- --strict   # also fails on unused exports
 *
 * Regex-based and dependency-free on purpose. Tests count as importers for module-level
 * checks but not for export-level checks, so an export only exercised by a test is reported.
 * Unused modules always fail; unused exports are reported as warnings unless --strict.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

// Roots loaded by the platform rather than by an import statement.
const ENTRYPOINTS = new Set(["main.tsx", "bootstrap.tsx", "polyfills.ts", "wasm.d.ts"]);
const ENTRY_DIRS = ["workers"];

interface SourceFile {
  abs: string;
  rel: string;
  isTest: boolean;
  isEntry: boolean;
  text: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(abs);
  }
  return out;
}

const files: SourceFile[] = walk(root).map((abs) => {
  const rel = relative(root, abs).split(sep).join("/");
  const name = rel.split("/").pop() ?? rel;
  return {
    abs,
    rel,
    isTest: rel.includes("__tests__/") || /\.test\.tsx?$/.test(name),
    isEntry: ENTRYPOINTS.has(name) || ENTRY_DIRS.some((d) => rel.startsWith(`${d}/`)),
    text: readFileSync(abs, "utf8"),
  };
});

const byAbs = new Map(files.map((f) => [f.abs.replace(/\.(tsx?)$/, ""), f]));

function resolveSpecifier(from: SourceFile, spec: string): SourceFile | undefined {
  if (!spec.startsWith(".")) return undefined;
  const base = resolve(dirname(from.abs), spec).replace(/\.(ts|tsx|js)$/, "");
  return byAbs.get(base) ?? byAbs.get(join(base, "index"));
}

interface Usage {
  importers: Set<SourceFile>;
  productNames: Set<string>;
  productNamespace: boolean;
}

const usage = new Map<SourceFile, Usage>();
const usageOf = (f: SourceFile): Usage => {
  let u = usage.get(f);
  if (!u) usage.set(f, (u = { importers: new Set(), productNames: new Set(), productNamespace: false }));
  return u;
};

function recordImport(from: SourceFile, spec: string, names: string[] | "all") {
  const target = resolveSpecifier(from, spec);
  if (!target) return;
  const u = usageOf(target);
  u.importers.add(from);
  if (from.isTest) return;
  if (names === "all") u.productNamespace = true;
  else for (const n of names) u.productNames.add(n);
}

const importRe = /import\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
const reExportRe = /export\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/g;
const sideEffectRe = /import\s+["']([^"']+)["']/g;
const dynamicRe = /import\(\s*["']([^"']+)["']\s*\)/g;
const workerUrlRe = /new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g;

function parseClause(clause: string): string[] | "all" {
  const names: string[] = [];
  const named = clause.match(/\{([^}]*)\}/);
  if (named) {
    for (const part of named[1].split(",")) {
      const trimmed = part.replace(/^\s*type\s+/, "").trim();
      if (!trimmed) continue;
      names.push(trimmed.split(/\s+as\s+/)[0].trim());
    }
  }
  if (/\*\s+as\s+/.test(clause)) return "all";
  const bare = clause.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
  if (bare) names.push("default");
  return names;
}

for (const f of files) {
  for (const m of f.text.matchAll(importRe)) {
    const names = parseClause(m[2]);
    recordImport(f, m[3], names);
  }
  for (const m of f.text.matchAll(reExportRe)) {
    recordImport(f, m[3], m[2].split(",").map((p) => p.trim().split(/\s+as\s+/)[0]).filter(Boolean));
  }
  for (const re of [sideEffectRe, dynamicRe, workerUrlRe]) {
    for (const m of f.text.matchAll(re)) recordImport(f, m[1], "all");
  }
}

const exportRe =
  /export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const localExportRe = /export\s+\{([^}]*)\}\s*;?\s*$/gm;

function declaredExports(f: SourceFile): string[] {
  const names = [...f.text.matchAll(exportRe)].map((m) => m[1]);
  if (/export\s+default\s/.test(f.text)) names.push("default");
  for (const m of f.text.matchAll(localExportRe)) {
    for (const part of m[1].split(",")) {
      const alias = part.trim().split(/\s+as\s+/).pop();
      if (alias) names.push(alias.trim());
    }
  }
  return [...new Set(names)];
}

const findings: string[] = [];

for (const f of files) {
  if (f.isEntry || f.isTest) continue;
  const u = usage.get(f);
  if (!u || u.importers.size === 0) {
    findings.push(`module  ${f.rel}  (no importers)`);
    continue;
  }
  if (![...u.importers].some((importer) => !importer.isTest)) {
    findings.push(`test-only  ${f.rel}`);
    continue;
  }
  if (u.productNamespace) continue;
  for (const name of declaredExports(f)) {
    if (!u.productNames.has(name)) findings.push(`export  ${f.rel}  ${name}`);
  }
}

const strict = process.argv.includes("--strict");
const modules = findings.filter((line) => line.startsWith("module"));
const exports = findings.filter((line) => line.startsWith("export") || line.startsWith("test-only"));

if (findings.length === 0) {
  console.log("No unused modules or exports under src/.");
  process.exit(0);
}

if (modules.length > 0) {
  console.error(`Unused modules under src/ (${modules.length}):`);
  for (const line of modules) console.error(`  ${line}`);
}
if (exports.length > 0) {
  const log = strict ? console.error : console.warn;
  log(`${strict ? "" : "Warnings (pass --strict to fail): "}unused exports or test-only modules under src/ (${exports.length}):`);
  for (const line of exports) log(`  ${line}`);
}

process.exit(modules.length > 0 || (strict && exports.length > 0) ? 1 : 0);
