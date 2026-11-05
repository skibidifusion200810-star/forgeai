const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { parseStudios, studioErrorText } = require('./studio-sessions.cjs');

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
    this.sessions = [];
  }
  get status() { return { state: this.state, studioId: this.studioId, toolCount: this.tools.length, sessions: this.sessions, tools: this.tools.map(t => t.name) }; }
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
      // A successful MCP handshake only proves the proxy works, not Studio.
      const list = tools.find(t => t.name === 'list_roblox_studios');
      if (!list) throw new Error('Studio MCP proxy does not expose list_roblox_studios. Update Roblox Studio and restart FORGE AI.');
      const sessionResult = await client.callTool({ name: list.name, arguments: {} });
      if (sessionResult?.isError) throw new Error('Could not discover the open Studio place: ' + studioErrorText(sessionResult));
      const sessions = parseStudios(sessionResult);
      if (!sessions.length) {
        // Tool discovery succeeding doesn't mean the Studio place is attached.
        // Include the short raw response for diagnosis rather than claiming
        // an empty session list when Roblox changed its response shape.
        const raw = studioErrorText(sessionResult).slice(0, 1400);
        throw new Error('MCP proxy responded but no Studio session could be identified. Open a place, then check the green connected-client indicator in Assistant → Manage MCP Servers. list_roblox_studios raw response: ' + raw);
      }
      this.sessions = sessions;
      if (sessions.length === 1) {
        this.studioId = sessions[0].studio_id;
        const stateTool = tools.find(t => t.name === 'get_studio_state');
        if (stateTool) {
          const stateResult = await client.callTool({ name: stateTool.name, arguments: { studio_id: this.studioId } });
          if (stateResult?.isError) throw new Error('Found a Studio place but the Studio state check failed: ' + studioErrorText(stateResult));
        }
      }
      this.state = 'connected';
      transport.onclose = () => { if (this.transport === transport) { this.client = null; this.transport = null; this.tools = []; this.studioId = null; this.sessions = []; this.state = 'disconnected'; this.onEvent('studio', 'Studio MCP disconnected'); } };
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
    this.client = null; this.transport = null; this.tools = []; this.studioId = null; this.sessions = []; this.state = 'disconnected';
    try { if (client) await client.close(); else if (transport) await transport.close(); } catch (_) { /* already closed */ }
    return this.status;
  }
  async listTools() {
    if (!this.client) throw new Error('Connect to Roblox Studio first');
    const { tools } = await this.client.listTools();
    this.tools = tools;
    return tools;
  }
  selectStudio(id) {
    const selected = String(id || '').trim();
    if (selected && this.sessions.length && !this.sessions.some(s => s.studio_id === selected)) throw new Error('That Studio instance ID is not in the connected session list. Refresh the connection.');
    this.studioId = selected || null;
    this.onEvent('studio', 'Studio selection updated');
    return this.status;
  }
  async execute(name, args = {}, approve = async () => false) {
    if (!this.client || this.state !== 'connected') throw new Error('Roblox Studio is not connected');
    if (this.busy) throw new Error('Another Studio tool call is still running; try again when it finishes');
    if (!name || typeof name !== 'string' || !this.tools.some(t => t.name === name)) throw new Error('Unknown or unavailable Studio tool');
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be a JSON object');
    const tool = this.tools.find(t => t.name === name);
    const a = { ...args };
    if (name !== 'list_roblox_studios' && tool.inputSchema?.properties?.studio_id) {
      if (!a.studio_id && this.studioId) a.studio_id = this.studioId;
      if (!a.studio_id) throw new Error('No Studio instance selected. Use list_roblox_studios to find the open game and select its studio_id in Studio tools.');
      if (this.sessions.length && !this.sessions.some(s => s.studio_id === a.studio_id)) throw new Error('Studio instance ID is not among active sessions. Reconnect Studio to refresh the list.');
    }
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
    } catch (e) {
      if (/client proxy is out of date|restart to update/i.test(String(e.message || e))) {
        this.onEvent('error', 'Studio MCP returned a stale-proxy exception. Reopening the MCP connection.', { name });
        try {
          await this.reconnect();
          return { isError: true, content: [{ type: 'text', text: 'MCP error -32603: Client proxy was out of date. FORGE AI reconnected to the Studio session. This action was NOT repeated; inspect your game before retrying.' }] };
        } catch (recoveryError) {
          return { isError: true, content: [{ type: 'text', text: 'MCP error -32603: Studio proxy is outdated, and reopening the connection failed: ' + recoveryError.message + '. Fully close Studio and FORGE AI, stop leftover StudioMCP.exe processes, reopen the updated Studio with a place loaded, then reconnect.' }] };
        }
      }
      this.onEvent('error', `${name}: ${e.message}`, { name });
      throw e;
    }
    finally { this.busy = false; }
  }
}
module.exports = { StudioConnection, isOutdatedProxyResponse };
