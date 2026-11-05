# FORGE AI — Roblox Studio + Claude Desktop

A **local-first, Windows desktop application** that connects the official Roblox Studio MCP server to Claude Desktop, with a dark development dashboard, discovered tools, operation history, and explicit approval of game-changing actions.

> **Status:** working-source MVP. Real Roblox Studio integration is implemented, but it must be tested on your own Windows machine with Roblox Studio running. Advanced game generation depends on Claude using the tools; FORGE AI does not independently contain an AI model, chat engine, marketplace, or all Lemonade.gg features.

## What works in this version

- Electron + React desktop dashboard, styled workspace, live connection status and audit history
- Connect to the official Roblox Studio MCP launcher at `%LOCALAPPDATA%\Roblox\mcp.bat`
- Discover tools using the real MCP protocol (no fake localhost Roblox HTTP server)
- Browse tool schemas and execute operations with editable JSON arguments
- Support multiple Studio sessions by selecting `studio_id`
- Install a local **FORGE_AI** Claude Desktop MCP connector in one click
- Local bridge binds only to `127.0.0.1`, requires a random session token and prompts for approval before mutating tool calls
- No Anthropic API key and no extra paid service required for Claude Desktop mode
- Persist operation history locally (JSON under Electron user data), preserve Claude config and create backup

## Requirements

- Windows 10 or 11
- [Node.js LTS](https://nodejs.org/) and npm to develop or build from source
- [Roblox Studio](https://create.roblox.com/), updated to a version with built-in Studio MCP
- [Claude Desktop](https://claude.ai/download) with MCP support; use your existing Claude Pro account

## Run from source

```powershell
# Clone the repository on Windows
 git clone https://github.com/skibidifusion200810-star/forgeai.git
 cd forgeai
 npm install
 npm run build
 npm run dev
```

`npm run build` produces `dist/` and `dist-electron/`. `npm run dev` starts Vite and Electron. To run production UI without Vite, use `npm start` after `npm run build`.

## Build Windows installer

```powershell
npm install
npm run dist:win
```

The NSIS installer will be in `release/`. GitHub Actions also builds a Windows installer and uploads it as a workflow artifact. Builds are **not automatically releases**.

## Connect Roblox Studio and Claude

1. Open your game in **Roblox Studio**.
2. Open **Assistant → ⋯ → Manage MCP Servers → Enable Studio as MCP server**.
3. Launch FORGE AI and click **Connect Roblox Studio**. A green indicator appears only if the MCP connection succeeds.
4. Click **Claude connection → Install Claude connection**. This modifies `%APPDATA%\Claude\claude_desktop_config.json`, preserving other servers and backing up the existing config as `.forge-backup`.
5. Restart **Claude Desktop**. Leave FORGE AI running while Claude uses the tools.
6. Ask Claude:

   > Use FORGE AI: check forge_status, list the available Roblox Studio tools, list Studio instances, then ask for permission to create a blue Part at (0,10,0) in the open place. Verify the result using a read-only Studio tool.

The bridge exposes `forge_status`, `forge_list_studio_tools`, and `forge_execute_studio_tool` to Claude. Claude discovers real Roblox tool schemas and forwards valid calls. **Every unrecognized or potentially modifying Studio operation requires an explicit native approval dialog.**

### Multiple Studio windows

In the **Studio tools** view execute `list_roblox_studios`, copy an instance `studio_id`, then paste into **Target Studio instance ID** and click **Set target**. Where tool schemas accept `studio_id`, the selected ID is supplied automatically.

## Architecture

```text
Claude Desktop (your subscription / no Anthropic API key)
    │ stdio MCP: three FORGE AI tools
    ▼
bridge-server.cjs (launched by Claude, runs locally)
    │ bearer-protected HTTP on 127.0.0.1:43157
    ▼
Electron main process (tool permissions + audit log)
    │ official Model Context Protocol over stdio
    ▼
%LOCALAPPDATA%\Roblox\mcp.bat
    │
    ▼
Open Roblox Studio place
```

The app never sends your game to a separate hosted FORGE AI service. Claude Desktop's normal privacy and service policies still apply to content you send to Claude.

## Troubleshooting

- **MCP launcher not found:** Update Roblox Studio and enable its built-in MCP server in Assistant settings. The launcher is installed by Roblox, not by this repository.
- **Connected but no active game:** Open a place in Roblox Studio and run `list_roblox_studios`.
- **Claude cannot find FORGE_AI:** Run `npm run build`, click Install Claude connection, and restart Claude Desktop. Check the config JSON.
- **Claude says FORGE AI offline:** Keep the desktop app running; the local bridge cannot execute tools without it.
- **Approval dialog blocks a call:** Click **Allow once** in the FORGE AI dialog; if you deny, Claude receives a genuine tool error.
- **Port already used:** Only one FORGE AI instance can own localhost port 43157. Close older copies.
- **Studio tool errors:** Read the actual schema in Studio tools. Tool capabilities and required parameters come from your installed Roblox Studio version.

## Security

- Bridge credentials are randomly rotated each app launch and stored at Electron's userData path; avoid copying this file.
- Do not commit `.env` or any API keys.
- All potentially mutating Studio calls require a local confirmation.
- Save versions of your Roblox place before major AI edits; an MCP tool may modify or delete Studio content.
- Local loopback authentication does not protect against malicious programs running under the **same Windows user**; only install trusted applications.

## Roadmap

- Visual task planner and safe checkpoints
- Rich editable hierarchy and property inspector
- Verification/test orchestration and automatic error surfacing
- Native installer code-signing, security review and usability testing
- Optional supported direct AI-provider integrations (not included in current MVP)

Licensed under MIT — see LICENSE.

## NEW — Built-in Gemini AI Builder (v0.2)

FORGE AI now includes a **real in-app Google Gemini chat**. It does not require Anthropic, Claude Desktop, or Replit. The Claude Desktop bridge remains optional for people who already use it.

1. Install/run FORGE AI on Windows and open **AI Builder (Gemini)** from the sidebar.
2. Create a fresh **Gemini Developer API** key from [Google AI Studio](https://aistudio.google.com/api-keys). **The previously shared `AQ.` key is not a confirmed Gemini key.** Never paste a key into GitHub or chat.
3. Paste your key into the app's **Gemini API** settings and click **Save key**. The desktop app encrypts the key using Electron `safeStorage` and Windows encryption; the renderer only sees a `configured` flag when loading settings. You can remove the key at any time.
4. Select `gemini-2.5-flash-lite` (default) or `gemini-2.5-flash` and click **Test API connection**. This makes a real API call and consumes a small amount of your allowance.
5. Open your Roblox place in Studio; enable **Assistant → Manage MCP Servers → Studio as MCP server**. In FORGE AI click **Connect Roblox Studio**.
6. In **AI Builder** ask something simple such as: *"Inspect my current Roblox game, then create one anchored blue part and verify it exists."* The app uses Gemini **function calling** to discover official Studio MCP tools and execute actual calls. Every mutating operation still requires your explicit Windows approval.
7. Read the output in chat and check **Activity log** for real tool results. Use **New chat** to reset conversation context and **Stop** to stop additional AI tool calls after any operation already running finishes.

**Free-tier limits:** A Gemini Developer API free tier is available for some models, countries, and eligible Google projects. Request limits and privacy rules apply; there is no guarantee of unrestricted free requests. **Use a Google AI Studio project without billing enabled** if you require zero charges. FORGE AI does not activate paid API services for you. See [Google's pricing](https://ai.google.dev/gemini-api/docs/pricing).

**Privacy:** Messages, relevant Roblox project data, and tool results are sent to Google when using Gemini. Chat messages are stored locally in Electron's user data folder; API keys are stored in a separate encrypted file and never committed to GitHub. In Gemini free tier, Google may use prompts to improve products, as documented in the pricing and data terms.

**Implementation:** `electron/gemini-agent.cjs` uses the official `@google/genai` SDK. Its tool calling loop sends both user/model turns and actual Studio tool results back to Gemini. `electron/studio.cjs` remains the single Studio MCP gateway for tool discovery, approval, and audit logging. No unverified end-to-end Studio changes are claimed; these require Roblox Studio running on Windows.

**Development tests:** `npm test` runs mocked agent-loop tests (tool discovery, execution, denial, invalid arguments, cancellation). `npm run check` validates Electron-side Node syntax. The GitHub Actions Windows build also runs both checks and creates the installer.
