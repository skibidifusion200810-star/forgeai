const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const readOnly = new Set([
  'list_roblox_studios', 'get_studio_state', 'search_game_tree', 'inspect_instance',
  'script_read', 'script_search', 'script_grep', 'get_console_output', 'screen_capture'
]);
function isOutdatedProxyResponse(result) {
  if (!result?.isError) return false;
  const message = (result.content || []).map(part => part?.text || '').join(' ');
  return /client proxy is out of date|restart to update/i.test(message);
}
class StudioConnection {
  constructor(onEvent) {
    this.onEvent = onEvent;
    this.client = null;
    this.transport = null;
    this.state = 'disconnected';
    this.tools = [];
    this.studioId = null;
    this.busy = false;
  }
  get status() { return { state: this.state, studioId: this.studioId, toolCount: this.tools.length, tools: this.tools.map(t => t.name) }; }
  async connect() {
    if (this.state === 'connected' || this.state === 'connecting') return this.status;
    if (process.platform !== 'win32') throw new Error('This build currently supports the Windows Roblox Studio MCP launcher only.');
    const bat = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Roblox', 'mcp.bat');
    if (!fs.existsSync(bat)) throw new Error('Roblox Studio MCP launcher not found at ' + bat + '. Update Roblox Studio and enable the Studio MCP server in Assistant settings.');
    this.state = 'connecting'; this.onEvent('studio', 'Connecting to Roblox Studio MCP…');
    try {
      const transport = new StdioClientTransport({ command: 'cmd.exe', args: ['/c', bat], stderr: 'pipe' });
      const client = new Client({ name: 'forge-ai', version: '0.1.0' });
      this.transport = transport;
      this.client = client;
      await client.connect(transport);
      const { tools } = await client.listTools();
      this.tools = tools;
      this.state = 'connected';
      transport.onclose = () => { if (this.transport === transport) { this.client = null; this.transport = null; this.tools = []; this.studioId = null; this.state = 'disconnected'; this.onEvent('studio', 'Studio MCP disconnected'); } };
      this.onEvent('studio', `Connected — ${tools.length} real MCP tools discovered`);
      return this.status;
    } catch (e) { await this.disconnect(); this.onEvent('error', `Studio connection failed: ${e.message}`); throw e; }
  }
  async reconnect() {
    await this.disconnect();
    return this.connect();
  }
  async disconnect() {
    const client = this.client;
    const transport = this.transport;
    this.client = null; this.transport = null; this.tools = []; this.studioId = null; this.state = 'disconnected';
    try { if (client) await client.close(); else if (transport) await transport.close(); } catch (_) { /* already closed */ }
    return this.status;
  }
  async listTools() {
    if (!this.client) throw new Error('Connect to Roblox Studio first');
    const { tools } = await this.client.listTools();
    this.tools = tools;
    return tools;
  }
  selectStudio(id) { this.studioId = String(id || '') || null; this.onEvent('studio', 'Studio selection updated'); return this.status; }
  async execute(name, args = {}, approve = async () => false) {
    if (!this.client || this.state !== 'connected') throw new Error('Roblox Studio is not connected');
    if (this.busy) throw new Error('Another Studio tool call is still running; try again when it finishes');
    if (!name || typeof name !== 'string' || !this.tools.some(t => t.name === name)) throw new Error('Unknown or unavailable Studio tool');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be a JSON object');
    const tool = this.tools.find(t => t.name === name);
    const a = { ...args };
    if (this.studioId && tool.inputSchema?.properties?.studio_id && !a.studio_id) a.studio_id = this.studioId;
    if (!readOnly.has(name) && !(await approve(name, a))) throw new Error('Tool execution denied by user');
    this.busy = true;
    this.onEvent('tool', `Running ${name}`, { name, args: a });
    try {
      const result = await this.client.callTool({ name, arguments: a });
      if (isOutdatedProxyResponse(result)) {
        this.onEvent('error', 'Studio MCP proxy is outdated. Refreshing the MCP client connection.', { name });
        try {
          await this.reconnect();
          return { isError: true, content: [{ type: 'text', text: 'Roblox Studio reported: Client proxy is out of date, restart to update. FORGE AI refreshed its MCP client connection. Do NOT assume the previous operation completed; no edit was automatically repeated. Re-inspect the place before retrying. If the error persists, close both FORGE AI and Roblox Studio, end lingering StudioMCP.exe processes, update/reopen Studio with MCP enabled, and reconnect FORGE AI.' }] };
        } catch (error) {
          return { isError: true, content: [{ type: 'text', text: 'Roblox Studio MCP proxy is outdated, and FORGE AI could not reconnect: ' + error.message + '. Close both FORGE AI and Roblox Studio, end lingering StudioMCP.exe processes, update/reopen Studio with MCP enabled, then reconnect FORGE AI. Do not assume an earlier edit succeeded.' }] };
        }
      }
      this.onEvent(result.isError ? 'error' : 'success', `${name}: ${result.isError ? 'Studio returned an error' : 'tool returned'}`, { name, result });
      return result;
    } catch (e) { this.onEvent('error', `${name}: ${e.message}`, { name }); throw e; }
    finally { this.busy = false; }
  }
}
module.exports = { StudioConnection, isOutdatedProxyResponse };
