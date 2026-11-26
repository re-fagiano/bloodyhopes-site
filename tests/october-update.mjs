import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const source = (await readFile(new URL("worker.js", root), "utf8")).replace('import { DurableObject } from "cloudflare:workers";', 'class DurableObject {}');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const env = {
  ASSETS: { async fetch(request) {
    try { return new Response(await readFile(new URL(new URL(request.url).pathname.slice(1), root))); }
    catch { return new Response("Not found", { status: 404 }); }
  } },
  CAMPFIRE: { idFromName() { return "test"; }, get() { return { fetch(request) {
    // Existing aggregate discovery telemetry is allowed; content writes are not.
    assert.ok(["/agent-event", "/ember"].includes(new URL(request.url).pathname));
    return Response.json({ recorded: true });
  } }; } },
};
const ctx = { waitUntil() {} };
async function mcp(method, params = {}) {
  return (await worker.fetch(new Request("https://bloodyhopes.com/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), env, ctx)).json();
}
const listed = await mcp("resources/list");
for (const name of ["letter.md", "context.md", "index.json"]) {
  const uri = `https://bloodyhopes.com/capsule/2026/v1/${name}`;
  assert.ok(listed.result.resources.some((item) => item.uri === uri));
  const response = await worker.fetch(new Request(uri), env, ctx);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), name.endsWith(".md") ? /text\/markdown; charset=utf-8/ : /application\/json; charset=utf-8/);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
  const text = await response.text();
  const resource = await mcp("resources/read", { uri });
  assert.equal(resource.result.contents[0].text, text);
  assert.equal((await worker.fetch(new Request(uri, { method: "POST" }), env, ctx)).status, 405);
}
assert.equal((await worker.fetch(new Request("https://bloodyhopes.com/capsule/private.md"), env, ctx)).status, 404);
assert.ok((await mcp("resources/read", { uri: "https://example.com/private" })).error);
const redirect = await worker.fetch(new Request("https://bloodyhopes.com/listening/a-civil-war-trilogy.html"), env, ctx);
assert.equal(redirect.status, 301);
assert.equal(redirect.headers.get("location"), "https://bloodyhopes.com/listening/a-civil-war-trilogy");
for (const slug of ["fare-you-well-my-darling", "the-nation-born-at-appomattox", "i-havent-found-the-ending-yet", "andersonville-prisoner", "some-dreams-only-sleep", "it-has-to-mean-something"]) {
  const song = await mcp("tools/call", { name: "read_song", arguments: { song: slug } });
  assert.equal(Boolean(song.error || song.result?.isError), false, slug);
  const html = await readFile(new URL(`songs/${slug}.html`, root), "utf8");
  assert.match(html, /class="lyrics-text"/);
}
for (const slug of ["fare-you-well-my-darling", "the-nation-born-at-appomattox"]) {
  const html = await readFile(new URL(`songs/${slug}.html`, root), "utf8");
  const lyrics = html.match(/<div class="lyrics-text">([\s\S]*?)<\/div>/)[1];
  assert.doesNotMatch(lyrics, /\[(?:Verse|Chorus|Intro|Outro|Style Note|Bridge)|instrumental|melody|guitar/i);
}
console.log("October update passed: HTTP and MCP capsule parity, read-only boundaries, new songs and listening redirects.");
