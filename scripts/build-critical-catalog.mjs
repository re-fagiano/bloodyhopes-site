import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const projectRoot = path.resolve(import.meta.dirname, "..");
const songsDirectory = path.join(projectRoot, "songs");
const version = "2026-08-07.1";

const decodeEntities = (value) => value
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">");

const inlineText = (value) => decodeEntities(value.replace(/<[^>]+>/g, ""))
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
    return {
      slug,
      title,
      canonical_url: `https://bloodyhopes.com/songs/${name}`,
      critic_ready: true,
      text_version: version,
      content_hash: `sha256:${contentHash}`,
      description,
      sources_status: "not-yet-curated",
      assignment_url: `https://bloodyhopes.com/api/campfire/assignment?song=${slug}`,
    };
  });

const catalog = {
  name: "Bloody Hopes critical catalog",
  schema_version: "1.0",
  text_version: version,
  notice: "critic_ready confirms complete published lyrics and page context. Historical bibliographies are not yet curated for every song.",
  songs,
};

fs.writeFileSync(path.join(projectRoot, "critical-catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Built critical-catalog.json for ${songs.length} songs.`);
