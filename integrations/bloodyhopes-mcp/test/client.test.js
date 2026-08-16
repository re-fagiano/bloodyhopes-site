import assert from "node:assert/strict";
import { BloodyHopesClient } from "../src/index.js";

const calls = [];
const fetchImpl = async (url, options) => {
  calls.push({ url, options, body: JSON.parse(options.body) });
  return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, result: { structuredContent: { ok: true } } }) };
};

const client = new BloodyHopesClient({ endpoint: "https://example.test/mcp", fetchImpl });
await client.readSong("the-elephant");
assert.equal(calls[0].url, "https://example.test/mcp");
assert.equal(calls[0].body.method, "tools/call");
assert.deepEqual(calls[0].body.params, { name: "read_song", arguments: { song: "the-elephant" } });
assert.equal(calls[0].options.headers["MCP-Protocol-Version"], "2026-07-28");

await client.leaveQuickVoice({ song: "the-elephant", quoted_line: "You must see the elephant", interpretation: "A sufficiently specific test interpretation for the published API." });
assert.equal(calls[1].body.params.name, "leave_quick_voice");
assert.equal(calls[1].body.params.arguments.song, "the-elephant");
console.log("BloodyHopesClient tests passed");
