import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowRight, Blocks, Bot, CheckCircle2, ChevronDown, CircleHelp,
  ClipboardCopy, Code2, Download, ExternalLink, FolderTree, Hammer, History,
  LayoutDashboard, Link2, Loader2, Play, Plug, RefreshCw, ScrollText,
  Search, Settings, ShieldCheck, Sparkles, Terminal, Unplug, Wrench, XCircle
} from 'lucide-react';
import GeminiPanel from './GeminiPanel.jsx';

const pages = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'gemini', label: 'AI Builder (Gemini)', icon: Sparkles },
  { id: 'tools', label: 'Studio tools', icon: Wrench },
  { id: 'activity', label: 'Activity log', icon: History },
  { id: 'setup', label: 'Claude connection', icon: Plug }
];
function pretty(x) { return JSON.stringify(x, null, 2); }
function isResultGood(x) { return !!x?.ok; }
function App() {
  const [page, setPage] = useState('dashboard');
  const [status, setStatus] = useState({ state: 'disconnected', toolCount: 0, studioId: null });
  const [logs, setLogs] = useState([]);
  const [tools, setTools] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [selected, setSelected] = useState('');
  const [args, setArgs] = useState('{}');
  const [result, setResult] = useState(null);
  const [search, setSearch] = useState('');
  const [studioId, setStudioId] = useState('');
  const connected = status.state === 'connected';
  const notify = (msg, error = false) => { setNote({ msg, error }); };
  const update = useCallback(async () => {
    const state = await window.forge?.state();
    if (state?.ok) { setStatus(state.data.status); setLogs(state.data.logs || []); }
    return state;
  }, []);
  useEffect(() => {
    update();
    const unsubscribe = window.forge?.onChange(data => { if (data.status) setStatus(data.status); if (data.logs) setLogs(data.logs); });
    return () => unsubscribe?.();
  }, [update]);
  const refreshTools = async () => {
    const response = await window.forge.listTools();
    if (response.ok) { setTools(response.data); if (!selected && response.data.length) setSelected(response.data[0].name); }
    else notify(response.error, true);
  };
  useEffect(() => { if (connected) refreshTools(); else setTools([]); }, [connected]);
  useEffect(() => {
    const t = tools.find(x => x.name === selected);
    if (!t) return;
    const obj = {};
    for (const k of t.inputSchema?.required || []) {
      const prop = t.inputSchema?.properties?.[k];
      obj[k] = prop?.type === 'number' || prop?.type === 'integer' ? 0 : prop?.type === 'boolean' ? false : prop?.type === 'object' ? {} : '';
    }
    setArgs(pretty(obj)); setResult(null);
  }, [selected, tools]);
  const action = async (fn) => {
    setBusy(true);
    try {
      const response = await fn();
      if (isResultGood(response)) { await update(); return response.data; }
      notify(response?.error || 'Operation failed', true);
      return null;
    } catch (e) { notify(e.message, true); return null; }
    finally { setBusy(false); }
  };
  const connect = () => action(() => window.forge.connect()).then(x => { if (x) notify('Studio MCP connected — tools discovered'); });
  const disconnect = () => action(() => window.forge.disconnect()).then(x => { if (x) notify('Studio disconnected'); });
  const runTool = async (name = selected, parameters = null) => {
    try {
      const parsed = parameters || JSON.parse(args);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Arguments must be an object');
      const value = await action(() => window.forge.execute(name, parsed));
      if (value != null) { setResult(value); notify(`${name} returned from Roblox Studio`); }
    } catch (e) { notify('Invalid tool arguments: ' + e.message, true); }
  };
  const selectedTool = tools.find(t => t.name === selected);
  const filtered = useMemo(() => tools.filter(t => `${t.name} ${t.description || ''}`.toLowerCase().includes(search.toLowerCase())), [tools, search]);
  const select = name => { setSelected(name); setPage('tools'); };
  const counts = [logs.filter(x => x.kind === 'success').length, logs.filter(x => x.kind === 'error').length];
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Blocks size={23}/></div><div><strong>FORGE<span> AI</span></strong><small>ROBLOX DEVELOPMENT</small></div></div>
      <div className="side-label">WORKSPACE</div>
      <nav>{pages.map(p => { const Icon = p.icon; return <button key={p.id} className={'nav '+(page === p.id ? 'active' : '')} onClick={() => setPage(p.id)}><Icon size={17}/>{p.label}{page === p.id && <span className="nav-active-dot"/>}</button>; })}</nav>
      <div className="sidebar-spacer"/>
      <div className="mini-info"><div className={'status-led '+(connected ? 'on' : '')}/><div><strong>{connected ? 'Studio connected' : 'Studio offline'}</strong><span>{connected ? `${status.toolCount} tools available` : 'Connect to start building'}</span></div></div>
      <div className="side-foot"><ShieldCheck size={15}/> LOCAL STUDIO • GEMINI OPTION</div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs">WORKSPACE <span>/</span> <b>{pages.find(p=>p.id===page)?.label}</b></div><div className="top-right"><span className="top-pill"><span className={'status-led '+(connected ? 'on' : '')}/>{connected ? 'CONNECTED' : 'DISCONNECTED'}</span><span className="version">v0.1.0</span></div></header>
      <div className="content">
        {page === 'dashboard' && <>
          <div className="hero"><div className="hero-eyebrow"><Sparkles size={15}/> YOUR ROBLOX DEVELOPMENT COMMAND CENTER</div><h1>Build with <span>Gemini.</span><br/>Create in Roblox Studio.</h1><p>Build Roblox games from an in-app Gemini chat. Connect your Studio instance, add a Google AI Studio API key and let Gemini invoke real MCP tools.</p><div className="hero-actions"><button className="primary" disabled={busy || connected} onClick={connect}>{busy ? <Loader2 className="spin" size={17}/> : <Plug size={17}/>} {connected ? 'Studio connected' : 'Connect Roblox Studio'}</button><button className="secondary" onClick={() => setPage('gemini')}><Sparkles size={17}/> Open AI Builder <ArrowRight size={16}/></button></div><div className="hero-glow"/></div>
          <div className="section-heading"><h2>System overview</h2><span>Live connection state</span></div>
          <div className="stats"><div className="stat"><div className="stat-icon purple"><Blocks size={20}/></div><small>ROBLOX STUDIO</small><strong>{connected ? 'ONLINE' : 'OFFLINE'}</strong><span>{connected ? 'MCP handshake verified' : 'Waiting for connection'}</span></div><div className="stat"><div className="stat-icon blue"><Terminal size={20}/></div><small>DISCOVERED TOOLS</small><strong>{status.toolCount || 0}</strong><span>From the actual Studio server</span></div><div className="stat"><div className="stat-icon green"><CheckCircle2 size={20}/></div><small>SUCCESSFUL OPERATIONS</small><strong>{counts[0]}</strong><span>Recorded locally</span></div><div className="stat"><div className="stat-icon orange"><Activity size={20}/></div><small>RECORDED ERRORS</small><strong>{counts[1]}</strong><span>Open Activity log to inspect</span></div></div>
          <div className="two-col"><section className="panel"><div className="panel-heading"><h3><Wrench size={18}/> Quick actions</h3><button className="ghost" onClick={() => setPage('tools')}>All tools <ArrowRight size={14}/></button></div><div className="quick"><button disabled={!connected || busy} onClick={() => runTool('list_roblox_studios', {})}><FolderTree size={19}/><div><strong>Find open Studio projects</strong><span>Discover active Studio sessions</span></div><ArrowRight size={16}/></button><button disabled={!connected} onClick={() => { setPage('tools'); refreshTools(); }}><Code2 size={19}/><div><strong>Run a Studio MCP tool</strong><span>Browse supported calls and their schemas</span></div><ArrowRight size={16}/></button><button onClick={() => setPage('gemini')}><Bot size={19}/><div><strong>Open Gemini AI Builder</strong><span>Chat with Gemini and build inside Roblox</span></div><ArrowRight size={16}/></button></div></section>
          <section className="panel"><div className="panel-heading"><h3><History size={18}/> Latest activity</h3><button className="ghost" onClick={() => setPage('activity')}>View all <ArrowRight size={14}/></button></div><ActivityList logs={logs.slice(0,5)}/></section></div>
          {result && <section className="panel result-panel"><div className="panel-heading"><h3><Terminal size={18}/> Last Studio tool response</h3><button className="ghost" onClick={() => navigator.clipboard.writeText(pretty(result))}><ClipboardCopy size={15}/> Copy</button></div><pre>{pretty(result)}</pre></section>}
        </>}
        {page === 'gemini' && <GeminiPanel connected={connected} onConnect={connect}/> }
        {page === 'tools' && <><div className="page-heading"><div><div className="eyebrow">LIVE STUDIO CONNECTION</div><h1>Roblox tools</h1><p>These are discovered from your actual Roblox Studio MCP server.</p></div><button className="secondary" disabled={!connected || busy} onClick={refreshTools}><RefreshCw size={16}/> Refresh</button></div>
          {!connected ? <Empty icon={Unplug} title="Studio isn't connected" text="Connect Roblox Studio from the dashboard to discover its available tools." action={() => setPage('dashboard')}/> : <div className="tools-layout"><div className="panel tools-list"><div className="input-wrap"><Search size={16}/><input placeholder="Search MCP tools..." value={search} onChange={e => setSearch(e.target.value)}/></div><div className="tools-scroll">{filtered.map(t => <button key={t.name} onClick={() => setSelected(t.name)} className={'tool-entry '+(selected===t.name?'chosen':'')}><Code2 size={16}/><span>{t.name}</span><ArrowRight size={14}/></button>)}</div><div className="hint">{tools.length} tools from Studio</div></div><div className="panel editor"><div className="panel-heading"><h3><Code2 size={19}/> Tool executor</h3><span className="tag">LIVE MCP</span></div>{selectedTool ? <><h2>{selectedTool.name}</h2><p className="subtle">{selectedTool.description || 'No description provided by the Studio server.'}</p><div className="field-label">ARGUMENT SCHEMA</div><pre className="schema">{pretty(selectedTool.inputSchema)}</pre><div className="field-label">JSON ARGUMENTS</div><textarea value={args} onChange={e => setArgs(e.target.value)} spellCheck="false"/><div className="editor-footer"><span>Mutating operations require local approval</span><button className="primary" onClick={() => runTool()} disabled={busy}>{busy ? <Loader2 className="spin" size={16}/> : <Play size={16}/>} Execute tool</button></div>{result && <><div className="field-label">ACTUAL STUDIO RESULT</div><pre className="result">{pretty(result)}</pre></>}</> : <p>Select a tool from the list.</p>}</div></div>}
          {connected && <div className="studio-selection"><label>Target Studio instance ID (optional)</label><input placeholder="Use list_roblox_studios to find an ID" value={studioId} onChange={e => setStudioId(e.target.value)}/><button className="secondary" onClick={() => action(() => window.forge.selectStudio(studioId))}>Set target</button><span>Current: {status.studioId || 'Not selected'}</span></div>}
        </>}
        {page === 'activity' && <><div className="page-heading"><div><div className="eyebrow">AUDIT HISTORY</div><h1>Activity log</h1><p>Tool execution requests, connection changes, and real results.</p></div><button className="secondary" onClick={update}><RefreshCw size={16}/> Refresh</button></div><section className="panel activity-panel"><ActivityList logs={logs}/></section></>}
        {page === 'setup' && <><div className="page-heading"><div><div className="eyebrow">AI CONNECTION</div><h1>Claude Desktop setup</h1><p>Use your Claude Pro subscription through the official Claude Desktop app and local MCP protocol. No Anthropic API key required.</p></div></div>
          <div className="setup-grid"><section className="panel setup-panel"><div className="number">01</div><h3>Enable Studio MCP</h3><p>Open Roblox Studio → Assistant → ⋯ → Manage MCP Servers → Enable Studio as MCP server.</p><span className="tip">Make sure your Roblox Studio version is up to date.</span></section><section className="panel setup-panel"><div className="number">02</div><h3>Connect FORGE AI</h3><p>Connect this application to Roblox Studio. It discovers the supported tools automatically.</p><button className="secondary" disabled={connected || busy} onClick={connect}><Plug size={16}/> {connected ? 'Connected' : 'Connect Studio'}</button></section><section className="panel setup-panel"><div className="number">03</div><h3>Install the Claude connector</h3><p>Writes the local FORGE AI MCP entry to your Claude Desktop configuration, preserving existing entries and making a backup.</p><button className="primary" disabled={busy} onClick={() => action(() => window.forge.installClaude()).then(data => { if (data) notify('Claude connector installed. Restart Claude Desktop.'); })}><Download size={16}/> Install Claude connection</button></section><section className="panel setup-panel"><div className="number">04</div><h3>Start building with Claude</h3><p>Keep FORGE AI running, restart Claude Desktop, and ask: “Use FORGE AI to list Roblox Studio sessions and create a test part.”</p><button className="secondary" onClick={() => window.forge.openClaude()}><ExternalLink size={16}/> Open Claude</button></section></div>
          <div className="warning"><ShieldCheck size={19}/><div><strong>Local by design</strong><p>Claude requests real tools through a secure loopback connection. Potentially changing your game requires an approval dialog on your PC. Save your Roblox place before major changes.</p></div></div>
        </>}
      </div>
    </main>
    {note && <div className={'toast '+(note.error?'bad':'')}><div>{note.error ? <XCircle size={18}/> : <CheckCircle2 size={18}/>}</div><span>{note.msg}</span><button onClick={() => setNote(null)}>×</button></div>}
  </div>;
}
function ActivityList({logs}) {
  if (!logs.length) return <div className="no-activity"><ScrollText size={27}/><strong>No activity yet</strong><span>Connection and tool activity will appear here.</span></div>;
  return <div className="activities">{logs.map(l => <div className="activity" key={l.id}><div className={'activity-dot '+l.kind}/><div><strong>{l.message}</strong><span>{new Date(l.time).toLocaleString()} • {l.kind}</span>{l.details && <details><summary>View details</summary><pre>{l.details}</pre></details>}</div></div>)}</div>;
}
function Empty({icon:Icon,title,text,action}) { return <div className="empty"><div className="empty-icon"><Icon size={30}/></div><h2>{title}</h2><p>{text}</p><button className="primary" onClick={action}>Go to dashboard <ArrowRight size={17}/></button></div>; }
export default App;
