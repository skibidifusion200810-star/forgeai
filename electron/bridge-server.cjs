// Claude Desktop launches this local stdio MCP server. No Anthropic API key is needed.
// It forwards to the authenticated FORGE AI Electron app on loopback.
const fs = require('node:fs');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

async function request(endpoint, body = {}) {
  const authFile = process.env.FORGE_AUTH_FILE;
  if (!authFile) throw new Error('FORGE_AUTH_FILE is missing; install the connector from FORGE AI settings.');
  const { token, port } = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `FORGE AI returned HTTP ${response.status}`);
  return data.data;
}
const server = new Server({ name: 'forge-ai', version: '0.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
  { name: 'forge_status', description: 'Check whether the local FORGE AI desktop app and Roblox Studio are connected. Start FORGE AI and click Connect first.', inputSchema: { type: 'object', properties: {} } },
  { name: 'forge_list_studio_tools', description: 'Discover the exact tools and JSON schemas available in the connected Roblox Studio MCP server. Call this before using forge_execute_studio_tool.', inputSchema: { type: 'object', properties: {} } },
  { name: 'forge_execute_studio_tool', description: 'Execute an available Roblox Studio MCP tool. Must use a name and arguments from forge_list_studio_tools. Mutating operations show an approval dialog in FORGE AI. Use list_roblox_studios first and supply studio_id for projects with multiple sessions.', inputSchema: { type: 'object', properties: { name: { type: 'string' }, args: { type: 'object', additionalProperties: true } }, required: ['name', 'args'] } }
] }));
server.setRequestHandler(CallToolRequestSchema, async requestData => {
  const { name, arguments: args = {} } = requestData.params;
  try {
    const result = name === 'forge_status'
      ? await request('/status')
      : name === 'forge_list_studio_tools'
        ? await request('/tools')
        : name === 'forge_execute_studio_tool'
          ? await request('/execute', { name: args.name, args: args.args })
          : (() => { throw new Error(`Unknown tool ${name}`); })();
    // Keep original Roblox tool response structure in the text for Claude.
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) { return { isError: true, content: [{ type: 'text', text: String(error.message || error) }] }; }
});
server.connect(new StdioServerTransport()).catch(e => { process.stderr.write(`FORGE AI MCP: ${e.message}\n`); process.exitCode = 1; });
