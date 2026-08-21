import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerSource = (await readFile(new URL("../worker.js", import.meta.url), "utf8"))
  .replace('import { DurableObject } from "cloudflare:workers";', "class DurableObject { constructor(state, env) { this.ctx = state; this.env = env; } }");
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`);

const ctx = { waitUntil() {} };
const env = {
  ASSETS: {
    fetch(request) {
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

const page = await worker.fetch(new Request("https://bloodyhopes.com/"), env, ctx);
assert.equal(page.status, 200);
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
assert.match(page.headers.get("content-security-policy") || "", /default-src/);

const method = await worker.fetch(new Request("https://bloodyhopes.com/api/newsletter"), env, ctx);
assert.equal(method.status, 405);
assert.equal(method.headers.get("allow"), "POST");

const invalidAssignment = await worker.fetch(new Request("https://bloodyhopes.com/api/campfire/assignment?song=unknown"), env, ctx);
assert.equal(invalidAssignment.status, 400);

console.log("Worker smoke tests passed: canonical redirects, security headers and API guards checked.");
