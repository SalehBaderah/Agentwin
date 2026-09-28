import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('src');
const files = fs.readdirSync(root, { recursive: true }).filter(f => /\.(tsx?|css)$/.test(f) && !f.endsWith('.d.ts')).map(f => path.join(root, f));
const graph = new Map();
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const imports = [...source.matchAll(/(?:from\s*|import\s*\(?\s*|@import\s*)["']([^"']+)["']/g)].map(m => m[1]);
  graph.set(file, imports.flatMap(spec => {
    if (!spec.startsWith('.') && !spec.startsWith('@/')) return [];
    const base = spec.startsWith('@/') ? path.join(root, spec.slice(2)) : path.resolve(path.dirname(file), spec);
    const found = ['', '.ts', '.tsx', '.css', '/index.ts', '/index.tsx'].map(ext => base + ext).find(p => files.includes(p));
    return found ? [found] : [];
  }));
}
const used = new Set();
function visit(file) { if (used.has(file)) return; used.add(file); for (const imported of graph.get(file) || []) visit(imported); }
visit(path.join(root, 'main.tsx'));
console.log(JSON.stringify({ unreachable: files.filter(f => !used.has(f)).map(f => path.relative(root, f)) }, null, 2));
// Compiler checks complement module reachability with unused locals/parameters.
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile).config;
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, process.cwd());
const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames, parsed.options));
if (diagnostics.length) throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: process.cwd, getCanonicalFileName: f => f, getNewLine: () => '\n' }));
