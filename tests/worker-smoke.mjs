import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerSource = (await readFile(new URL("../worker.js", import.meta.url), "utf8"))
  .replace('import { DurableObject } from "cloudflare:workers";', "class DurableObject { constructor(state, env) { this.ctx = state; this.env = env; } }");
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`);

const ctx = { waitUntil() {} };
const env = {
  ASSETS: {
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/research-queue.json") return Response.json({ schema_version: "1.0", tasks: [{ id: "test-task", status: "open", title: "Test task" }] });
      if (pathname === "/llms-full.txt") return new Response("----\nPAGE: Discipline\nURL: https://bloodyhopes.com/songs/discipline\n\n# Discipline\nFlogging and the gauntlet are not the same practice.", { headers: { "content-type": "text/plain" } });
      return new Response(`<h1>${new URL(request.url).pathname}</h1>`, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  },
};

const redirect = await worker.fetch(new Request("https://bloodyhopes.com/about.html"), env, ctx);
assert.equal(redirect.status, 301);
assert.equal(redirect.headers.get("location"), "https://bloodyhopes.com/about");

const harnessRedirect = await worker.fetch(new Request("https://bloodyhopes.com/harness.html"), env, ctx);
assert.equal(harnessRedirect.status, 301);
assert.equal(harnessRedirect.headers.get("location"), "https://bloodyhopes.com/harness");

const page = await worker.fetch(new Request("https://bloodyhopes.com/"), env, ctx);
assert.equal(page.status, 200);
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
assert.match(page.headers.get("content-security-policy") || "", /default-src/);

const method = await worker.fetch(new Request("https://bloodyhopes.com/api/newsletter"), env, ctx);
assert.equal(method.status, 405);
assert.equal(method.headers.get("allow"), "POST");

const invalidAssignment = await worker.fetch(new Request("https://bloodyhopes.com/api/campfire/assignment?song=unknown"), env, ctx);
assert.equal(invalidAssignment.status, 400);

const tasks = await worker.fetch(new Request("https://bloodyhopes.com/api/harness/tasks"), env, ctx);
assert.equal(tasks.status, 200);
assert.equal((await tasks.json()).tasks[0].id, "test-task");

const search = await worker.fetch(new Request("https://bloodyhopes.com/api/harness/search?q=gauntlet"), env, ctx);
assert.equal(search.status, 200);
const searchBody = await search.json();
assert.equal(searchBody.results[0].heading, "Discipline");
assert.equal(searchBody.results[0].url, "https://bloodyhopes.com/songs/discipline");

const invalidSearch = await worker.fetch(new Request("https://bloodyhopes.com/api/harness/search?q=x"), env, ctx);
assert.equal(invalidSearch.status, 400);

const mcpTools = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", "mcp-protocol-version": "2025-11-25" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
}), env, ctx);
assert.equal(mcpTools.status, 200);
const mcpBody = await mcpTools.json();
assert.ok(mcpBody.result.tools.some((tool) => tool.name === "search_corpus"));

console.log("Worker smoke tests passed: canonical redirects, security headers, Harness tools and API guards checked.");
