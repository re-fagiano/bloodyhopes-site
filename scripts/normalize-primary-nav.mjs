import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const excluded = new Set(["campfire-admin.html"]);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if ([".git", ".wrangler", "tmp"].includes(entry.name)) return [];
      return walk(target);
    }
    return target;
  });
}

function activeSection(relative) {
  if (relative === "index.html") return "home";
  if (relative === "about.html") return "about";
  if (relative === "catalog.html" || relative.startsWith("songs/")) return "songs";
  if (relative === "history-and-songs.html" || relative === "articles.html" || relative.startsWith("articles/")) return "history";
  if (relative === "campfire.html" || relative.startsWith("campfire/")) return "campfire";
  return "";
}

function link(href, label, key, active) {
  const current = key === active ? ' class="active"' : "";
  return `<li><a href="${href}"${current}>${label}</a></li>`;
}

for (const file of walk(root)) {
  if (!file.endsWith(".html") || file.endsWith("-preview.html")) continue;
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (excluded.has(relative)) continue;
  const original = fs.readFileSync(file, "utf8");
  if (!/<nav class="primary"/.test(original)) continue;

  const active = activeSection(relative);
  const nav = `<nav class="primary" aria-label="Primary navigation"><ul>${[
    link("/", "Home", "home", active),
    link("/about", "About", "about", active),
    link("/catalog", "Songs", "songs", active),
    link("/history-and-songs", "History", "history", active),
    link("/campfire", "Campfire", "campfire", active),
    '<li><a href="https://www.youtube.com/@BloodyHopesMusic" target="_blank" rel="noopener">YouTube</a></li>',
  ].join("")}</ul></nav>`;

  const updated = original.replace(/<nav class="primary"[^>]*>[\s\S]*?<\/nav>/, nav);
  if (updated !== original) fs.writeFileSync(file, updated, "utf8");
}

console.log("Normalized primary navigation across public HTML pages.");
