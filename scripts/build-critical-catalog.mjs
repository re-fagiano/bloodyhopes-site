import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const projectRoot = path.resolve(import.meta.dirname, "..");
const songsDirectory = path.join(projectRoot, "songs");
const version = "2026-09-19.1";

const decodeEntities = (value) => value
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">");

const inlineText = (value) => decodeEntities(value.replace(/<[^>]+>/g, " "))
  .replace(/\s+/g, " ")
  .trim();

const songs = fs.readdirSync(songsDirectory)
  .filter((name) => name.endsWith(".html"))
  .sort()
  .map((name) => {
    const slug = name.replace(/\.html$/, "");
    const html = fs.readFileSync(path.join(songsDirectory, name), "utf8");
    const lyricsHtml = html.match(/<div class="lyrics-text"[^>]*>([\s\S]*?)<\/div>\s*<\/section>/i)?.[1];
    if (!lyricsHtml) throw new Error(`Complete lyrics missing for ${name}`);
    const lyrics = decodeEntities(lyricsHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const title = inlineText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? slug);
    const description = decodeEntities(html.match(/<meta name="description" content="([^"]*)">/i)?.[1] ?? "");
    const contentHash = crypto.createHash("sha256").update(lyrics, "utf8").digest("hex");
    const sourceSections = [...html.matchAll(/<h2[^>]*>\s*(?:Sources?|Sources? and [^<]+|Primary Source)\s*<\/h2>([\s\S]*?)(?=<h2|<section|<hr|$)/gi)];
    const hasVisibleExternalSources = sourceSections.some((section) => /href="https?:\/\//i.test(section[1]));
    return {
      slug,
      title,
      canonical_url: `https://bloodyhopes.com/songs/${slug}`,
      critic_ready: true,
      text_version: version,
      content_hash: `sha256:${contentHash}`,
      description,
      sources_status: hasVisibleExternalSources ? "visible-external-sources" : "not-yet-curated",
      assignment_url: `https://bloodyhopes.com/api/campfire/assignment?song=${slug}`,
    };
  });

const catalog = {
  name: "Bloody Hopes critical catalog",
  schema_version: "1.0",
  text_version: version,
  notice: "critic_ready confirms complete published lyrics and page context. sources_status reports whether the page exposes a visible external source section; it does not independently validate every historical claim.",
  songs,
};

fs.writeFileSync(path.join(projectRoot, "critical-catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Built critical-catalog.json for ${songs.length} songs.`);

// Derive public counts at build time, including the no-JavaScript carousel fallback.
const articleCount = fs.readdirSync(path.join(projectRoot, "articles"))
  .filter((name) => name.endsWith(".html") && !name.endsWith("-preview.html")).length;
const historyPath = path.join(projectRoot, "history-and-songs.html");
fs.writeFileSync(historyPath, fs.readFileSync(historyPath, "utf8")
  .replace(/(<span data-article-count>)[^<]*(<\/span>)/, `$1${articleCount}$2`)
  .replace(/(<span data-song-count>)[^<]*(<\/span>)/, `$1${songs.length}$2`), "utf8");
const homePath = path.join(projectRoot, "index.html");
const home = fs.readFileSync(homePath, "utf8");
const selectedCount = (home.match(/class="carousel-slide[^" ]*(?: [^"]*)?"/g) || []).length;
fs.writeFileSync(homePath, home.replace(/(<span data-carousel-count[^>]*>)[^<]*(<\/span>)/,
  (_match, open, close) => `${open}01 / ${String(selectedCount).padStart(2, "0")}${close}`), "utf8");
