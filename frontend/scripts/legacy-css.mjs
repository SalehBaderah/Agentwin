// Legacy CSS audit/prune helper for the shadcn migration.
//   node scripts/legacy-css.mjs unused              list legacy classes no longer referenced in src/ or tests/
//   node scripts/legacy-css.mjs prune-unused        remove selectors that use those classes
//   node scripts/legacy-css.mjs prune a b c         remove selectors that use any of the given classes
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const stylesheets = ["src/styles.css", "src/modern.css", "src/motion.css", "src/features/digital-twin/live-twin.css"].filter((file) => fs.existsSync(file));
const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === "ui" && dir.endsWith("components") ? [] : sourceFiles(full);
  return /\.(tsx?|mjs)$/.test(entry.name) ? [full] : [];
});
const source = [...sourceFiles("src"), ...sourceFiles("tests")].map((file) => fs.readFileSync(file, "utf8")).join("\n");
const classesIn = (selector) => [...selector.replace(/\[[^\]]*\]/g, "").matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]);

function legacyClasses() {
  const found = new Set();
  for (const file of stylesheets) postcss.parse(fs.readFileSync(file, "utf8")).walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    rule.selectors.forEach((selector) => classesIn(selector).forEach((name) => found.add(name)));
  });
  return [...found].sort();
}
const referenced = (name) => new RegExp(`(^|[^\\w-])${name.replace(/[-]/g, "\\-")}(?![\\w-])`).test(source);

function prune(classes) {
  const targets = new Set(classes);
  for (const file of stylesheets) {
    const root = postcss.parse(fs.readFileSync(file, "utf8"));
    let removed = 0;
    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
      const keep = rule.selectors.filter((selector) => !classesIn(selector).some((name) => targets.has(name)));
      if (keep.length === rule.selectors.length) return;
      removed += rule.selectors.length - keep.length;
      if (keep.length) rule.selectors = keep;
      else rule.remove();
    });
    let changed = true;
    while (changed) {
      changed = false;
      root.walkAtRules((atRule) => { if (atRule.nodes && atRule.nodes.length === 0) { atRule.remove(); changed = true; } });
    }
    if (removed) {
      fs.writeFileSync(file, root.toString());
      console.log(`${file}: removed ${removed} selector(s)`);
    }
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "unused") console.log(legacyClasses().filter((name) => !referenced(name)).join("\n") || "(none)");
else if (command === "prune-unused") prune(legacyClasses().filter((name) => !referenced(name)));
else if (command === "prune" && args.length) prune(args);
else { console.error("usage: legacy-css.mjs unused | prune-unused | prune <class...>"); process.exit(1); }
