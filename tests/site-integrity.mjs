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

assert.equal(failures.length, 0, `Site integrity failed:\n- ${failures.join("\n- ")}`);
console.log(`Site integrity passed: ${htmlFiles.length} public HTML documents and ${files.filter((file) => file.endsWith(".json")).length} JSON documents checked.`);
