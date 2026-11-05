import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Bot, CheckCircle2, CircleAlert, ExternalLink, Eye, EyeOff, KeyRound,
  Loader2, MessageSquarePlus, Plug, RotateCcw, ShieldCheck, Sparkles, Square, Trash2, Wrench } from 'lucide-react';

const EXAMPLES = [
  'Inspect my Roblox game and explain what systems it already has.',
  'Create a blue, anchored Part above my spawn and verify it exists.',
  'Build a throwing simulator with coins, strength upgrades and a rebirth button. Make a plan, then start with the foundation.'
];
function GeminiPanel({ connected, onConnect }) {
  const [state, setState] = useState({ configured: false, model: 'gemini-3.5-flash-lite', models: [], messages: [] });
  const [message, setMessage] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settingBusy, setSettingBusy] = useState(false);
  const [step, setStep] = useState('');
  const [toolEvents, setToolEvents] = useState([]);
  const [alert, setAlert] = useState(null);
  const [pendingMessage, setPendingMessage] = useState('');
  const bottom = useRef(null);
  useEffect(() => {
    let active = true;
    window.forge.geminiState().then(r => { if (active && r.ok) setState(r.data); else if (active) setAlert(r.error); });
    const unsubscribe = window.forge.onGeminiEvent(e => {
      if (e.type === 'progress') setStep(e.message);
      if (e.type === 'tool' || e.type === 'toolResult') setToolEvents(events => [...events.slice(-25), e]);
      if (e.type === 'done') setStep('');
    });
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [state.messages, pendingMessage, step, toolEvents]);
  const runSetting = async (fn, success) => {
    setSettingBusy(true); setAlert(null);
    try {
      const r = await fn();
      if (!r.ok) throw new Error(r.error || 'Request failed');
      if (r.data?.model && r.data?.messages) setState(r.data);
      setAlert({ good: true, text: success || 'Success' });
      return r.data;
    } catch (e) { setAlert({ good: false, text: e.message }); return null; }
    finally { setSettingBusy(false); }
  };
  const saveKey = async () => {
    if (!key.trim()) return;
    const saved = await runSetting(() => window.forge.saveGeminiKey(key), 'Gemini key encrypted and saved on this PC.');
    if (saved) { setKey(''); setShowKey(false); }
  };
  const send = async text => {
    const input = (text || message).trim();
    if (!input || busy || !state.configured) return;
    setMessage(''); setPendingMessage(input); setBusy(true); setAlert(null); setToolEvents([]); setStep('Connecting to Gemini…');
    try {
      const r = await window.forge.sendGemini(input);
      if (!r.ok) throw new Error(r.error || 'Gemini request failed');
      setState(prev => ({ ...prev, messages: r.data.messages }));
    } catch (e) {
      setAlert({ good: false, text: e.message });
      setMessage(input);
    } finally { setPendingMessage(''); setBusy(false); setStep(''); }
  };
  const configured = state.configured;
  return <div className="gemini-page">
    <div className="page-heading gemini-heading">
      <div><div className="eyebrow"><Sparkles size={14}/> GOOGLE GEMINI • DIRECT BUILDER</div><h1>AI Game Builder</h1><p>Ask Gemini to inspect, script and build inside your open Roblox Studio place. Real Studio tool calls use local approval.</p></div>
      <div className="gemini-pills"><span className={'gemini-pill ' + (configured ? 'ok' : '')}><KeyRound size={13}/>{configured ? 'Gemini configured' : 'Key required'}</span><span className={'gemini-pill ' + (connected ? 'ok' : '')}><Plug size={13}/>{connected ? 'Studio connected' : 'Studio offline'}</span></div>
    </div>
    {alert && <div className={'gemini-alert ' + (alert.good ? 'good' : 'bad')}><CircleAlert size={18}/><span>{typeof alert === 'string' ? alert : alert.text}</span><button onClick={() => setAlert(null)}>×</button></div>}
    <div className="gemini-columns">
      <section className="panel gemini-chat">
        <div className="gemini-chat-header"><div><h3><Bot size={18}/> Gemini Builder</h3><span>Real model responses • actual Studio MCP operations</span></div><button className="secondary" disabled={busy || !state.messages.length} onClick={() => runSetting(() => window.forge.clearGemini(), 'Chat cleared.')}><MessageSquarePlus size={15}/> New chat</button></div>
        <div className="gemini-messages">
          {!state.messages.length && !pendingMessage && <div className="gemini-welcome"><div className="gemini-orb"><Sparkles size={31}/></div><h2>What should we build?</h2><p>Connect Studio, add your free-tier Gemini API key, and describe a Roblox feature.</p><div className="gemini-examples">{EXAMPLES.map(q => <button key={q} disabled={!configured || busy} onClick={() => send(q)}>{q}</button>)}</div></div>}
          {state.messages.map((m, i) => <div className={'gemini-message ' + m.role} key={i}><span className="gemini-avatar">{m.role === 'assistant' ? <Sparkles size={16}/> : 'You'}</span><div className="gemini-bubble"><div className="gemini-byline">{m.role === 'assistant' ? 'Gemini' : 'You'}</div><div className="gemini-text">{m.text}</div></div></div>)}
          {pendingMessage && <div className="gemini-message user"><span className="gemini-avatar">You</span><div className="gemini-bubble"><div className="gemini-byline">You</div><div className="gemini-text">{pendingMessage}</div></div></div>}
          {busy && <div className="gemini-inflight"><Loader2 size={16} className="spin"/><span>{step || 'Gemini is working…'}</span></div>}
          {toolEvents.length > 0 && busy && <div className="gemini-events"><strong><Wrench size={14}/> Live tool activity</strong>{toolEvents.slice(-5).map((e, i) => <p key={i}>{e.type === 'toolResult' ? (e.ok ? '✓ ' : '✕ ') + e.summary : '↳ ' + e.message}</p>)}</div>}
          <div ref={bottom}/>
        </div>
        <div className="gemini-composer"><textarea placeholder={configured ? 'Describe a Roblox game, script, map or bug to fix…' : 'Add your Gemini API key on the right to start chatting…'} value={message} disabled={!configured || busy} onChange={e => setMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={3}/><div className="gemini-compose-bottom"><span>Enter to send • Shift+Enter for newline • Studio edits require approval</span>{busy ? <button className="secondary" onClick={() => window.forge.stopGemini().then(() => setStep('Stopping after current operation…'))}><Square size={15}/> Stop</button> : <button className="primary" disabled={!configured || !message.trim()} onClick={() => send()}><ArrowUp size={18}/> Send</button>}</div></div>
      </section>
      <aside className="gemini-side">
        <section className="panel gemini-settings"><div className="panel-heading"><h3><KeyRound size={18}/> Gemini API</h3></div><p className="subtle">Create a free-tier API key in Google AI Studio. A key from a different provider won't work.</p><button className="gemini-link" onClick={() => window.forge.openGeminiKeys()}><ExternalLink size={14}/> Open Google AI Studio</button>
          <div className="field-label">YOUR GEMINI API KEY</div>
          <div className="gemini-key-row"><input type={showKey ? 'text' : 'password'} autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={configured ? '•••••••••••••• saved' : 'Paste Google AI Studio key'}/><button title={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
          <div className="gemini-setting-actions"><button className="primary" disabled={!key.trim() || settingBusy || busy} onClick={saveKey}>{settingBusy ? <Loader2 size={15} className="spin"/> : <ShieldCheck size={15}/>} Save key</button>{configured && <button className="secondary" disabled={settingBusy || busy} onClick={() => runSetting(() => window.forge.removeGeminiKey(), 'Stored key removed.')}><Trash2 size={14}/> Remove</button>}</div>
          <div className="field-label">MODEL</div><select value={state.model} disabled={settingBusy || busy} onChange={e => runSetting(() => window.forge.setGeminiModel(e.target.value), 'Model changed; previous chat cleared.')}>{(state.models.length ? state.models : ['gemini-3.5-flash-lite', 'gemini-3.8-flash']).map(m => <option key={m} value={m}>{m}</option>)}</select>
          <button className="secondary gemini-test" disabled={!configured || settingBusy || busy} onClick={() => runSetting(() => window.forge.refreshGeminiModels(), 'Updated model list for your Gemini API key. Use Test API connection to confirm access.')}><RotateCcw size={15}/> Refresh available models</button>
          <button className="secondary gemini-test" disabled={!configured || settingBusy || busy} onClick={() => runSetting(() => window.forge.testGemini(), 'Gemini responded successfully.')}><RotateCcw size={15}/> Test API connection</button>
          <p className="gemini-smallprint">Gemini free tier has quotas and availability restrictions. Keep your Google AI Studio project on the free tier to avoid charges. Chat messages and relevant Studio content are sent to Google when you use this mode.</p>
        </section>
        <section className="panel gemini-settings"><div className="panel-heading"><h3><Wrench size={18}/> Studio status</h3></div><div className="gemini-studio-line"><span className={'status-led ' + (connected ? 'on' : '')}/><span>{connected ? 'Connected to Roblox Studio MCP' : 'Roblox Studio not connected'}</span></div>{!connected && <button className="primary gemini-connect" disabled={settingBusy} onClick={onConnect}><Plug size={16}/> Connect Roblox Studio</button>}<p className="gemini-smallprint">The app discovers tools from Studio. Gemini can inspect and edit your real place; all mutating calls open an approval dialog.</p></section>
      </aside>
    </div>
  </div>;
}
export default GeminiPanel;
