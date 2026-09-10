import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const decode = (value) => value
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)));
const plain = (value) => decode(value.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const attr = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const songsDir = path.join(root, "songs");
for (const filename of fs.readdirSync(songsDir).filter((name) => name.endsWith(".html")).sort()) {
  const file = path.join(songsDir, filename);
  let html = fs.readFileSync(file, "utf8");
  const slug = filename.replace(/\.html$/, "");
  const title = plain(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || slug.replaceAll("-", " "));
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"\s*\/?>/i)?.[1] || `${title}, a Bloody Hopes historical war ballad.`;
  const canonical = `https://bloodyhopes.com/songs/${slug}`;
  const image = `${canonical.replace("/songs/", "/assets/seo/songs/")}-1200x630.jpg`;
  const socialTitle = `${title} | Bloody Hopes`;
  const imageAlt = `${title} — Bloody Hopes historical war ballad`;

  html = html.replace(/<meta\s+(?:property="og:[^"]+"|name="twitter:[^"]+")[^>]*>\s*/gi, "");
  const block = [
    `<meta property="og:type" content="music.song">`,
    `<meta property="og:title" content="${attr(socialTitle)}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:secure_url" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${attr(imageAlt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${attr(socialTitle)}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<meta name="twitter:image:alt" content="${attr(imageAlt)}">`,
  ].join("\n");
  html = html.replace(/(<link\s+rel="canonical"[^>]*>)/i, `$1\n${block}`);
  fs.writeFileSync(file, html, "utf8");
}

console.log(`Normalized social metadata for ${fs.readdirSync(songsDir).filter((name) => name.endsWith(".html")).length} songs.`);
