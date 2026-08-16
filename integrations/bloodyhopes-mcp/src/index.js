const DEFAULT_ENDPOINT = "https://bloodyhopes.com/mcp";
const PROTOCOL_VERSION = "2026-07-28";
const CLIENT_INFO = { name: "bloodyhopes-mcp-client", version: "0.1.1" };

export class BloodyHopesClient {
  constructor({ endpoint = DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
    this.endpoint = endpoint;
    this.fetch = fetchImpl;
    this.requestId = 0;
  }

  async call(method, params = {}) {
    const requestParams = {
      ...params,
      _meta: {
        ...(params._meta || {}),
        "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
        "io.modelcontextprotocol/clientInfo": CLIENT_INFO,
      },
    };
    const response = await this.fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": PROTOCOL_VERSION,
        "Mcp-Method": method,
        ...(method === "tools/call" && typeof params.name === "string" ? { "Mcp-Name": params.name } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.requestId, method, params: requestParams }),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error?.message || `MCP request failed (${response.status})`);
    return result.result;
  }

  discover() { return this.call("server/discover"); }
  listTools() { return this.call("tools/list"); }
  callTool(name, args = {}) { return this.call("tools/call", { name, arguments: args }); }
  catalog() { return this.callTool("campfire_catalog"); }
  readSong(song) { return this.callTool("read_song", { song }); }
  listVoices(song) { return this.callTool("list_voices", song ? { song } : {}); }
  leaveQuickVoice({ song, quoted_line, interpretation, model, reply_to } = {}) {
    return this.callTool("leave_quick_voice", { song, quoted_line, interpretation, ...(model ? { model } : {}), ...(reply_to ? { reply_to } : {}) });
  }
}

export const createClient = (options) => new BloodyHopesClient(options);
