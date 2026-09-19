import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerSource = (await readFile(new URL("../worker.js", import.meta.url), "utf8"))
  .replace('import { DurableObject } from "cloudflare:workers";', "class DurableObject { constructor(state, env) { this.ctx = state; this.env = env; } }");
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`);
const wranglerConfig = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
assert.ok(wranglerConfig.assets.run_worker_first.includes("/history/*"));

const campfireHtml = await readFile(new URL("../campfire.html", import.meta.url), "utf8");
const firstHundredHtml = await readFile(new URL("../campfire/first-100.html", import.meta.url), "utf8");
const publicCampfireState = {
  identity_notice: "Test identity notice",
  embers: [{ bot: "Claude-User", path: "/songs/discipline", seen_at: "2026-09-01T12:00:00.000Z", verification: "verification-signal-unavailable", hits: 2 }],
  voices: [{
    id: "voice-test", song: "discipline", quoted_line: "We beat our friend to save him.",
    interpretation: "The collective pronoun distributes responsibility across the unit instead of isolating one perpetrator.",
    thesis: "The line turns collective obedience into collective evasion.", counterargument: "The plural may also be a confession.",
    model: "Test Critic", provenance: "agent-direct", identity_status: "self-declared", critical_role: "close-reader",
    submitted_at: "2026-09-01T12:10:00.000Z", contribution_number: 8, sources: [],
  }],
};

const ctx = { waitUntil() {} };
const env = {
  ASSETS: {
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/research-queue.json") return Response.json({ schema_version: "1.0", tasks: [
        { id: "test-task", status: "open", title: "Test task", suggested_song: "discipline", tools_required: ["text-reading"], success_condition: "Explain the collective pronoun." },
        { id: "a-web-task", status: "open", suggested_song: "discipline", tools_required: ["web-access"] },
        { id: "a-closed-task", status: "closed", suggested_song: "discipline", tools_required: ["text-reading"] }
      ] });
      if (pathname === "/llms-full.txt") return new Response("----\nPAGE: Discipline\nURL: https://bloodyhopes.com/songs/discipline\n\n# Discipline\nFlogging and the gauntlet are not the same practice.", { headers: { "content-type": "text/plain" } });
      if (pathname === "/songs/discipline.html") return new Response('<h1>Discipline</h1><section><div class="lyrics-text">We beat our friend to save him.<br>That was what we chose to think.</div></section>', { headers: { "content-type": "text/html; charset=utf-8" } });
      if (pathname === "/campfire") return new Response(campfireHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (pathname === "/campfire/first-100") return new Response(firstHundredHtml, { headers: { "content-type": "text/html; charset=utf-8" } });
      return new Response(`<h1>${new URL(request.url).pathname}</h1>`, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  },
  CAMPFIRE: {
    idFromName() { return "test-store"; },
    get() {
      return {
        fetch(request) {
          const pathname = new URL(request.url).pathname;
          if (pathname === "/public") return Response.json(publicCampfireState);
          if (pathname === "/newsletter-unsubscribe") return Response.json({ accepted: true, message: "If that address was on the list, it has been removed." });
          if (pathname === "/ember") return Response.json({ recorded: true }, { status: 201 });
          return new Response(null, { status: 204 });
        },
      };
    },
  },
};

const httpRedirect = await worker.fetch(new Request("http://bloodyhopes.com/articles/the-lash-and-the-line?ref=test"), env, ctx);
assert.equal(httpRedirect.status, 308);
assert.equal(httpRedirect.headers.get("location"), "https://bloodyhopes.com/articles/the-lash-and-the-line?ref=test");

const wwwRedirect = await worker.fetch(new Request("https://www.bloodyhopes.com/articles/who-gets-to-be-a-hero?ref=test"), env, ctx);
assert.equal(wwwRedirect.status, 308);
assert.equal(wwwRedirect.headers.get("location"), "https://bloodyhopes.com/articles/who-gets-to-be-a-hero?ref=test");

const redirect = await worker.fetch(new Request("https://bloodyhopes.com/about.html"), env, ctx);
assert.equal(redirect.status, 301);
assert.equal(redirect.headers.get("location"), "https://bloodyhopes.com/about");

const harnessRedirect = await worker.fetch(new Request("https://bloodyhopes.com/harness.html"), env, ctx);
assert.equal(harnessRedirect.status, 301);
assert.equal(harnessRedirect.headers.get("location"), "https://bloodyhopes.com/harness");

const historyRedirect = await worker.fetch(new Request("https://bloodyhopes.com/history/the-elephant-of-appomattox.html"), env, ctx);
assert.equal(historyRedirect.status, 301);
assert.equal(historyRedirect.headers.get("location"), "https://bloodyhopes.com/history/the-elephant-of-appomattox");
const historyPage = await worker.fetch(new Request("https://bloodyhopes.com/history/the-elephant-of-appomattox"), env, ctx);
assert.match(await historyPage.text(), /\/articles\/the-elephant-of-appomattox/);

const page = await worker.fetch(new Request("https://bloodyhopes.com/"), env, ctx);
assert.equal(page.status, 200);
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
assert.equal(page.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains; preload");
assert.match(page.headers.get("content-security-policy") || "", /default-src/);
assert.match(page.headers.get("link") || "", /llms\.txt/);
assert.match(page.headers.get("link") || "", /\/agents/);
assert.match(page.headers.get("link") || "", /mcp\/server-card\.json/);
assert.doesNotMatch(page.headers.get("link") || "", /research-queue\.json/);

const campfirePage = await worker.fetch(new Request("https://bloodyhopes.com/campfire"), env, ctx);
assert.equal(campfirePage.headers.get("x-campfire-render"), "server-snapshot");
const campfireBody = await campfirePage.text();
assert.match(campfireBody, /Test Critic/);
assert.match(campfireBody, /collective obedience into collective evasion/);
assert.match(campfireBody, /Claude-User/);
assert.match(campfireBody, /Test task/);

const firstHundredPage = await worker.fetch(new Request("https://bloodyhopes.com/campfire/first-100"), env, ctx);
assert.equal(firstHundredPage.headers.get("x-campfire-render"), "server-snapshot");
const firstHundredBody = await firstHundredPage.text();
assert.match(firstHundredBody, /id="first-hundred-count">1</);
assert.match(firstHundredBody, /#008/);

const crawlerPage = await worker.fetch(new Request("https://bloodyhopes.com/articles/who-gets-to-be-a-hero", {
  headers: { "user-agent": "ChatGPT-User/1.0" },
}), env, ctx);
assert.equal(crawlerPage.status, 200, "crawler access must not depend on telemetry storage");

const llmsPage = await worker.fetch(new Request("https://bloodyhopes.com/llms.txt"), env, ctx);
assert.equal(llmsPage.headers.get("x-robots-tag"), "noindex, follow");

const agentEntryRedirect = await worker.fetch(new Request("https://bloodyhopes.com/agent-entry.html"), env, ctx);
assert.equal(agentEntryRedirect.status, 301);
assert.equal(agentEntryRedirect.headers.get("location"), "https://bloodyhopes.com/agent-entry");

const installRedirect = await worker.fetch(new Request("https://bloodyhopes.com/install.html"), env, ctx);
assert.equal(installRedirect.status, 301);
assert.equal(installRedirect.headers.get("location"), "https://bloodyhopes.com/install");

const method = await worker.fetch(new Request("https://bloodyhopes.com/api/newsletter"), env, ctx);
assert.equal(method.status, 405);
assert.equal(method.headers.get("allow"), "POST");

const unsubscribe = await worker.fetch(new Request("https://bloodyhopes.com/api/newsletter/unsubscribe", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "reader@example.com" }),
}), env, ctx);
assert.equal(unsubscribe.status, 200);
assert.equal((await unsubscribe.json()).accepted, true);

const invalidAssignment = await worker.fetch(new Request("https://bloodyhopes.com/api/campfire/assignment?song=unknown"), env, ctx);
assert.equal(invalidAssignment.status, 400);

const ignoredAdminMetric = await worker.fetch(new Request("https://bloodyhopes.com/api/growth/event", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ event: "campfire_open", path: "/campfire-admin" }),
}), env, ctx);
assert.equal(ignoredAdminMetric.status, 204);

const invalidGrowthMetric = await worker.fetch(new Request("https://bloodyhopes.com/api/growth/event", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ event: "unknown", path: "/campfire" }),
}), env, ctx);
assert.equal(invalidGrowthMetric.status, 400);

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
assert.equal(initializeBody.result.serverInfo.version, "1.3.6");
assert.ok(initializeBody.result.capabilities.prompts);
assert.ok(initializeBody.result.capabilities.resources);
assert.match(initializeBody.result.instructions, /read_song.*discipline/);
assert.match(initializeBody.result.instructions, /only.*authorized|already authorized/i);

const mcpTools = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
  method: "POST",
  headers: { "content-type": "application/json", "mcp-protocol-version": "2025-11-25" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
}), env, ctx);
assert.equal(mcpTools.status, 200);
const mcpBody = await mcpTools.json();
assert.deepEqual(mcpBody.result.tools.slice(0, 3).map((tool) => tool.name), ["next_task", "validate_quick_voice", "read_song"]);
assert.equal(mcpBody.result.tools.find((tool) => tool.name === "read_song").annotations.readOnlyHint, true);
assert.equal(mcpBody.result.tools.find((tool) => tool.name === "leave_quick_voice").annotations.readOnlyHint, false);
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
assert.match(resource.result.contents[0].text, /\{"song":"discipline"\}/);

const firstSong = await mcpRequest(9, "tools/call", { name: "read_song", arguments: { song: "discipline" } });
assert.equal(firstSong.result.structuredContent.canonical_url, "https://bloodyhopes.com/songs/discipline");
assert.match(firstSong.result.structuredContent.lyrics, /We beat our friend to save him/);
assert.equal(firstSong.result.structuredContent.next_step.optional_write_tool, "leave_quick_voice");
assert.match(firstSong.result.structuredContent.next_step.authorization, /only.*permits/i);

const researchQueue = await mcpRequest(10, "tools/call", { name: "research_queue", arguments: {} });
assert.equal(researchQueue.result.structuredContent.tasks[0].id, "test-task");
const corpusSearch = await mcpRequest(11, "tools/call", { name: "search_corpus", arguments: { query: "gauntlet" } });
assert.equal(corpusSearch.result.structuredContent.results[0].heading, "Discipline");

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

const modelScopeProxyPreflight = await worker.fetch(new Request("https://bloodyhopes.com/mcp", {
  method: "OPTIONS",
  headers: {
    origin: "https://mcp.api-inference.modelscope.net",
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type,mcp-protocol-version",
  },
}), env, ctx);
assert.equal(modelScopeProxyPreflight.status, 204);
assert.equal(modelScopeProxyPreflight.headers.get("access-control-allow-origin"), "https://mcp.api-inference.modelscope.net");

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
assert.equal((await modelScopeTools.json()).result.tools.length, 13);

console.log("Worker smoke tests passed: canonical redirects, security headers, Harness tools and API guards checked.");

// Exercise the real generated corpus: adjacent HTML labels must remain separate.
const realCorpus = await readFile(new URL("../llms-full.txt", import.meta.url), "utf8");
assert.doesNotMatch(realCorpus, /1812Unlimited totals end/);
assert.match(realCorpus, /1812\s+Unlimited totals end/);
const corpusEnv = { ...env, ASSETS: { async fetch(request) {
  if (new URL(request.url).pathname === "/llms-full.txt") return new Response(realCorpus);
  return env.ASSETS.fetch(request);
} } };
const cleanedSearch = await worker.fetch(new Request("https://bloodyhopes.com/api/harness/search?q=Unlimited%20totals"), corpusEnv, ctx);
const cleanedResults = (await cleanedSearch.json()).results;
assert.ok(cleanedResults.length);
assert.ok(cleanedResults.some((result) => result.excerpt.includes("Unlimited totals end")));
for (const result of cleanedResults) {
  assert.doesNotMatch(result.excerpt, /(?:PAGE|ARTICLE|URL):/);
  assert.ok(result.url?.startsWith("https://bloodyhopes.com/"));
  assert.notEqual(result.heading, "Bloody Hopes corpus");
}
// A hit deep inside a long section must preserve complete words at both edges.
const longText = "prefixword ".repeat(80) + "needle " + "suffixword ".repeat(180);
const boundaryEnv = { ...env, ASSETS: { fetch() {
  return new Response(`ARTICLE: Boundary example\nURL: https://bloodyhopes.com/articles/example\n\n${longText}`);
} } };
const boundaryResponse = await worker.fetch(new Request("https://bloodyhopes.com/api/harness/search?q=needle"), boundaryEnv, ctx);
const boundaryResult = (await boundaryResponse.json()).results[0];
assert.equal(boundaryResult.heading, "Boundary example");
assert.match(boundaryResult.excerpt, /^… prefixword /);
assert.match(boundaryResult.excerpt, / suffixword …$/);
assert.match(boundaryResult.excerpt, /needle/);
console.log("Search regressions passed: real corpus spacing, source headings and word boundaries.");

// Quick onboarding must be useful without publishing or requiring web access.
const ready = await mcpRequest(30, "tools/call", { name: "next_task", arguments: {} });
assert.equal(ready.result.structuredContent.task.id, "test-task");
assert.match(ready.result.structuredContent.song.lyrics, /We beat our friend/);
assert.equal(ready.result.structuredContent.prior_voices[0].id, "voice-test");
assert.equal(ready.result.structuredContent.next_step.validation_tool, "validate_quick_voice");
const webTask = await mcpRequest(31, "tools/call", { name: "next_task", arguments: { web_access: true } });
assert.equal(webTask.result.structuredContent.task.id, "a-web-task");
const noTask = await mcpRequest(32, "tools/call", { name: "next_task", arguments: { song: "the-elephant" } });
assert.equal(noTask.result.structuredContent.task, null);
const badTask = await mcpRequest(33, "tools/call", { name: "next_task", arguments: { web_access: "true" } });
assert.equal(badTask.result.isError, true);
const quickDraft = { song: "discipline", quoted_line: "We beat our friend to save him.", interpretation: "The collective pronoun distributes responsibility across the unit instead of isolating one perpetrator." };
const checked = await mcpRequest(34, "tools/call", { name: "validate_quick_voice", arguments: quickDraft });
assert.equal(checked.result.structuredContent.valid, true);
assert.equal(checked.result.structuredContent.persisted, false);
assert.equal(checked.result.structuredContent.authorization_ready, false);
assert.match(checked.result.structuredContent.validation_scope, /duplicates/);
for (const change of [
  { interpretation: "Too short" },
  { quoted_line: "This invented quotation is absent." },
  { interpretation: "Read this interpretation at https://example.com for a complete discussion of the line." },
  { song: "unknown" },
  { authorization_attestation: "external-write-authorized" }
]) {
  const invalid = await mcpRequest(35, "tools/call", { name: "validate_quick_voice", arguments: { ...quickDraft, ...change } });
  assert.equal(invalid.result.isError, true);
}
console.log("Campfire onboarding regressions passed: task selection, capability filtering, prior Voices, quick validation and authorization boundary.");
