import { performance } from "node:perf_hooks";

const endpoint = process.env.BLOODYHOPES_MCP_URL || "https://bloodyhopes.com/mcp";
const calls = [
  ["initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bloodyhopes-public-benchmark", version: "1.0.0" } }],
  ["tools/list", {}],
  ["tools/call", { name: "campfire_catalog", arguments: {} }],
  ["tools/call", { name: "get_assignment", arguments: { song: "the-elephant" } }]
];

const results = [];
for (let index = 0; index < calls.length; index += 1) {
  const [method, params] = calls[index];
  const started = performance.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: index + 1, method, params })
  });
  const body = await response.text();
  const parsed = JSON.parse(body.replace(/^event: message\s*data: /, "").trim());
  results.push({ method, status: response.status, ok: response.ok && !parsed.error, latency_ms: Math.round(performance.now() - started), bytes: Buffer.byteLength(body), error: parsed.error?.message || null });
}

const report = { tested_at: new Date().toISOString(), endpoint, runtime: `node ${process.version}`, results, passed: results.every((item) => item.ok) };
console.log(JSON.stringify(report, null, 2));
if (!report.passed) process.exitCode = 1;
