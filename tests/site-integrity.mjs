import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([".git", ".wrangler", "integrations", "node_modules"]);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

const files = await walk(root);
const htmlFiles = files.filter((file) => file.endsWith(".html") && !file.endsWith("-preview.html"));
const failures = [];

function report(condition, message) {
  if (!condition) failures.push(message);
}

async function localTargetExists(sourceFile, reference) {
  const clean = reference.split(/[?#]/, 1)[0];
  if (!clean || clean === "/") return true;
  if (clean.startsWith("/api/") || clean === "/mcp") return true;
  const relative = clean.startsWith("/")
    ? clean.slice(1)
    : path.relative(root, path.resolve(path.dirname(sourceFile), clean));
  if (relative.replaceAll("\\", "/").startsWith("api/")) return true;
  const candidates = [relative, `${relative}.html`, path.join(relative, "index.html")];
  for (const candidate of candidates) {
    try {
      if ((await stat(path.join(root, candidate))).isFile()) return true;
    } catch {}
  }
  return false;
}

for (const file of htmlFiles) {
  const relativeFile = path.relative(root, file).replaceAll("\\", "/");
  const html = await readFile(file, "utf8");
  report(/<!doctype html>/i.test(html), `${relativeFile}: missing doctype`);
  report(/<html\s+lang="[a-z-]+"/i.test(html), `${relativeFile}: missing document language`);
  report(/<meta\s+name="viewport"/i.test(html), `${relativeFile}: missing viewport meta`);
  report(/<title>[^<]+<\/title>/i.test(html), `${relativeFile}: missing title`);
  report(/<h1(?:\s|>)/i.test(html), `${relativeFile}: missing h1`);
  if (relativeFile !== "campfire-admin.html") {
    report(/<meta\s+property="og:image"\s+content="https:\/\//i.test(html), `${relativeFile}: missing absolute Open Graph image`);
    report((html.match(/name="twitter:card"/g) || []).length <= 1, `${relativeFile}: duplicate twitter:card metadata`);
    const structuredData = [...html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    report(structuredData.length > 0, `${relativeFile}: missing structured SEO data`);
    for (const [index, match] of structuredData.entries()) {
      try {
        const data = JSON.parse(match[1]);
        report(data["@context"] === "https://schema.org", `${relativeFile}: structured data block ${index + 1} needs schema.org context`);
      } catch (error) {
        failures.push(`${relativeFile}: invalid structured data block ${index + 1} (${error.message})`);
      }
    }
  }

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  report(duplicateIds.length === 0, `${relativeFile}: duplicate ids ${[...new Set(duplicateIds)].join(", ")}`);

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const reference = match[1];
    if (/^(?:https?:|mailto:|data:|javascript:|#|\/\/)/i.test(reference)) continue;
    report(await localTargetExists(file, reference), `${relativeFile}: missing local target ${reference}`);
  }
}

for (const jsonFile of files.filter((file) => file.endsWith(".json"))) {
  try { JSON.parse(await readFile(jsonFile, "utf8")); }
  catch (error) { failures.push(`${path.relative(root, jsonFile)}: invalid JSON (${error.message})`); }
}

const home = await readFile(path.join(root, "index.html"), "utf8");
report((home.match(/name="twitter:card"/g) || []).length === 1, "index.html: twitter:card must appear exactly once");
report(home.includes('class="home-hero"'), "index.html: branded home hero is missing");
report(home.includes('aria-label="Primary navigation"'), "index.html: primary navigation needs an accessible name");

const expectedPrimaryNav = [
  ["/", "Home"],
  ["/about", "About"],
  ["/catalog", "Songs"],
  ["/history-and-songs", "History"],
  ["/campfire", "Campfire"],
  ["https://www.youtube.com/@BloodyHopesMusic", "YouTube"],
];
for (const file of htmlFiles) {
  const relativeFile = path.relative(root, file).replaceAll("\\", "/");
  if (relativeFile === "campfire-admin.html") continue;
  const html = await readFile(file, "utf8");
  const primaryNav = html.match(/<nav class="primary"[^>]*>([\s\S]*?)<\/nav>/i)?.[1];
  if (!primaryNav) continue;
  const links = [...primaryNav.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
    .map((match) => [match[1], match[2].trim()]);
  report(JSON.stringify(links) === JSON.stringify(expectedPrimaryNav), `${relativeFile}: primary navigation differs from the canonical site map`);
}

const agentEntry = await readFile(path.join(root, "agent-entry.html"), "utf8");
report(agentEntry.includes('<meta name="robots" content="noindex,follow">'), "agent-entry.html: minimal fallback must remain noindex,follow");
report(agentEntry.includes('<link rel="canonical" href="https://bloodyhopes.com/agents">'), "agent-entry.html: canonical guide must be /agents");

const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const sitemapEntries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((match) => match[1]);
report(sitemapEntries.length > 0, "sitemap.xml: no URL entries found");
for (const entry of sitemapEntries) {
  const location = entry.match(/<loc>([^<]+)<\/loc>/)?.[1] || "unknown URL";
  report(/^https:\/\/bloodyhopes\.com\//.test(location), `sitemap.xml: non-canonical URL ${location}`);
  report(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(entry), `sitemap.xml: missing or invalid lastmod for ${location}`);
}

const catalogHtml = await readFile(path.join(root, "catalog.html"), "utf8");
const catalogStructuredData = [...catalogHtml.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => JSON.parse(match[1]));
const catalogList = catalogStructuredData.find((data) => data["@type"] === "ItemList");
const songFiles = htmlFiles.filter((file) => path.relative(root, file).replaceAll("\\", "/").startsWith("songs/"));
report(Boolean(catalogList), "catalog.html: structured song ItemList is missing");
if (catalogList) {
  report(catalogList.numberOfItems === songFiles.length, "catalog.html: structured song count does not match published pages");
  report(catalogList.itemListElement?.length === songFiles.length, "catalog.html: structured catalog does not include every published song");
  report(catalogList.itemListElement?.every((item) => item.url.startsWith("https://bloodyhopes.com/songs/")), "catalog.html: structured catalog must use canonical Bloody Hopes song URLs");
  for (const item of catalogList.itemListElement || []) {
    report(await localTargetExists(path.join(root, "catalog.html"), new URL(item.url).pathname), `catalog.html: missing structured song target ${item.url}`);
  }
}
for (const songFile of songFiles) {
  const slug = path.basename(songFile, ".html");
  const html = await readFile(songFile, "utf8");
  const image = `https://bloodyhopes.com/assets/seo/songs/${slug}-1200x630.jpg`;
  report(html.includes(`<meta property="og:title"`), `${slug}: missing Open Graph title`);
  report(html.includes(`<meta property="og:description"`), `${slug}: missing Open Graph description`);
  report(html.includes(`<meta property="og:url" content="https://bloodyhopes.com/songs/${slug}">`), `${slug}: missing canonical Open Graph URL`);
  report(html.includes(`<meta property="og:image" content="${image}">`), `${slug}: missing dedicated Open Graph image`);
  report(html.includes('<meta property="og:image:width" content="1200">') && html.includes('<meta property="og:image:height" content="630">'), `${slug}: Open Graph dimensions are missing`);
  report(await localTargetExists(songFile, `/assets/seo/songs/${slug}-1200x630.jpg`), `${slug}: dedicated Open Graph asset is missing`);
}

const articlesHtml = await readFile(path.join(root, "articles.html"), "utf8");
const articlesStructuredData = [...articlesHtml.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => JSON.parse(match[1]));
const articlesList = articlesStructuredData.find((data) => data["@type"] === "ItemList");
const articleFiles = htmlFiles.filter((file) => path.relative(root, file).replaceAll("\\", "/").startsWith("articles/"));
report(Boolean(articlesList), "articles.html: structured article ItemList is missing");
if (articlesList) {
  report(articlesList.numberOfItems === articleFiles.length, "articles.html: structured article count does not match published pages");
  report(articlesList.itemListElement?.length === articleFiles.length, "articles.html: structured list does not include every published article");
}

const botAccess = JSON.parse(await readFile(path.join(root, "bot-access.json"), "utf8"));
report(botAccess.canonical_machine_entry === "https://bloodyhopes.com/llms.txt", "bot-access.json: canonical machine entry must be llms.txt");
report(botAccess.read_only_entrypoints?.minimal_html_fallback === "https://bloodyhopes.com/agent-entry", "bot-access.json: script-free HTML fallback is missing");
report(Boolean(botAccess.independent_fallbacks?.github_agent_guide), "bot-access.json: independent agent fallback is missing");
report(await localTargetExists(path.join(root, "index.html"), "/install"), "install.html: public install page is missing");
report(sitemap.includes("https://bloodyhopes.com/privacy"), "sitemap.xml: privacy page is missing");

const campfire = await readFile(path.join(root, "campfire.html"), "utf8");
report(!/href="(?:\/)?campfire-admin"/.test(campfire), "campfire.html: public moderation link must not be exposed");
report(campfire.includes("Canonical machine entry:"), "campfire.html: canonical machine entry is not declared");

const llms = await readFile(path.join(root, "llms.txt"), "utf8");
report(llms.includes("This is the canonical machine entry for Bloody Hopes."), "llms.txt: canonical-entry declaration is missing");

assert.equal(failures.length, 0, `Site integrity failed:\n- ${failures.join("\n- ")}`);
console.log(`Site integrity passed: ${htmlFiles.length} public HTML documents and ${files.filter((file) => file.endsWith(".json")).length} JSON documents checked.`);
