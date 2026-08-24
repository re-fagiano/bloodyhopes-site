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
assert.match(page.headers.get("link") || "", /agent-entry/);
assert.match(page.headers.get("link") || "", /bot-access\.json/);

const agentEntryRedirect = await worker.fetch(new Request("https://bloodyhopes.com/agent-entry.html"), env, ctx);
assert.equal(agentEntryRedirect.status, 301);
assert.equal(agentEntryRedirect.headers.get("location"), "https://bloodyhopes.com/agent-entry");

const installRedirect = await worker.fetch(new Request("https://bloodyhopes.com/install.html"), env, ctx);
assert.equal(installRedirect.status, 301);
assert.equal(installRedirect.headers.get("location"), "https://bloodyhopes.com/install");

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

const mcpInitialize = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "conversion-smoke", version: "1.0" } } }),
}), env, ctx);
const initializeBody = await mcpInitialize.json();
assert.equal(initializeBody.result.serverInfo.version, "1.3.3");
assert.ok(initializeBody.result.capabilities.prompts);
assert.ok(initializeBody.result.capabilities.resources);

const mcpTools = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", "mcp-protocol-version": "2025-11-25" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
}), env, ctx);
assert.equal(mcpTools.status, 200);
const mcpBody = await mcpTools.json();
assert.ok(mcpBody.result.tools.some((tool) => tool.name === "search_corpus"));
assert.ok(mcpBody.result.tools.some((tool) => tool.name === "build_citation_bundle"));
assert.ok(mcpBody.result.tools.some((tool) => tool.name === "validate_voice"));

const mcpRequest = async (id, method, params = {}) => {
  const response = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", "mcp-protocol-version": "2025-11-25" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  }), env, ctx);
  assert.equal(response.status, 200);
  return response.json();
};

const prompts = await mcpRequest(2, "prompts/list");
assert.ok(prompts.result.prompts.some((prompt) => prompt.name === "critic_to_campfire"));
const prompt = await mcpRequest(3, "prompts/get", { name: "critic_to_campfire", arguments: { song: "discipline" } });
assert.match(prompt.result.messages[0].content.text, /leave_quick_voice/);
const resources = await mcpRequest(4, "resources/list");
assert.ok(resources.result.resources.some((resource) => resource.uri === "bloodyhopes://campfire/quick-voice"));
const resource = await mcpRequest(5, "resources/read", { uri: "bloodyhopes://campfire/quick-voice" });
assert.match(resource.result.contents[0].text, /read_song/);

const modernPrompts = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "mcp-protocol-version": "2026-07-28",
    "mcp-method": "prompts/list",
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 6, method: "prompts/list", params: {} }),
}), env, ctx);
assert.equal(modernPrompts.status, 200);
assert.equal(modernPrompts.headers.get("mcp-protocol-version"), "2026-07-28");
assert.ok((await modernPrompts.json()).result.prompts.length > 0);

const modelScopePreflight = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
  method: "OPTIONS",
  headers: {
    origin: "https://www.modelscope.ai",
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type,mcp-protocol-version",
  },
}), env, ctx);
assert.equal(modelScopePreflight.status, 204);
assert.equal(modelScopePreflight.headers.get("access-control-allow-origin"), "https://www.modelscope.ai");

const untrustedPreflight = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
  method: "OPTIONS",
  headers: { origin: "https://example.invalid", "access-control-request-method": "POST" },
}), env, ctx);
assert.equal(untrustedPreflight.status, 403);

const modelScopeInitialize = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://www.modelscope.ai" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "modelscope-compatibility-smoke", version: "1.0" } } }),
}), env, ctx);
assert.equal(modelScopeInitialize.status, 200);
assert.equal(modelScopeInitialize.headers.get("access-control-allow-origin"), "https://www.modelscope.ai");
assert.equal((await modelScopeInitialize.json()).result.protocolVersion, "2025-06-18");

const modelScopeTools = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", "mcp-protocol-version": "2025-06-18", origin: "https://www.modelscope.ai" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 8, method: "tools/list", params: {} }),
}), env, ctx);
assert.equal(modelScopeTools.status, 200);
assert.equal((await modelScopeTools.json()).result.tools.length, 10);

console.log("Worker smoke tests passed: canonical redirects, security headers, Harness tools and API guards checked.");
