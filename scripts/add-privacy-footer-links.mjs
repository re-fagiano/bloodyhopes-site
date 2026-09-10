import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const htmlFiles = [];
function collect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", ".wrangler", "node_modules", "tmp"].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(target);
    else if (entry.name.endsWith(".html") && !entry.name.endsWith("-preview.html") && entry.name !== "campfire-admin.html") htmlFiles.push(target);
  }
}
collect(root);

let changed = 0;
for (const file of htmlFiles) {
  let html = fs.readFileSync(file, "utf8");
  const start = html.indexOf('<footer class="site">');
  const end = start >= 0 ? html.indexOf("</footer>", start) : -1;
  if (start < 0 || end < 0) continue;
  const footer = html.slice(start, end + 9);
  if (/href="\/privacy"/.test(footer)) continue;
  const contact = /(<a\s+href="mailto:[^"]+"[^>]*>Contact<\/a>)/i;
  let updated;
  if (contact.test(footer)) {
    updated = footer.replace(contact, '<a href="/privacy">Privacy</a> · $1');
  } else {
    const closingDivs = [...footer.matchAll(/<\/div>/g)];
    if (closingDivs.length < 2) continue;
    const insertion = closingDivs.at(-2).index;
    updated = `${footer.slice(0, insertion)} · <a href="/privacy">Privacy</a>${footer.slice(insertion)}`;
  }
  html = `${html.slice(0, start)}${updated}${html.slice(end + 9)}`;
  fs.writeFileSync(file, html, "utf8");
  changed += 1;
}

console.log(`Added Privacy to ${changed} public footers.`);
