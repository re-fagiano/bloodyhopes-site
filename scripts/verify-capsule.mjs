import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "capsule/2026/v1/index.json"), "utf8"));
for (const record of manifest.documents) {
  const bytes = fs.readFileSync(path.join(root, new URL(record.url).pathname));
  assert.equal(bytes.length, record.bytes);
  assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), record.sha256, `Fixed capsule changed: ${record.url}. Use a new version or addendum.`);
  assert.equal(new TextDecoder("utf-8", { fatal: true }).decode(bytes).includes("�"), false);
}
assert.equal(manifest.version, "1.0.0");
console.log("Capsule integrity passed: fixed originals, UTF-8 and SHA-256 digests.");
