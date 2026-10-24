# Nightjar — Offline General-Purpose IDE Project Brief

**Status:** Core IDE prototype and Windows installer/portable builds are present; external account actions and hands-on desktop verification remain open.
**Purpose:** A clear, model-independent handoff so a different coding model or developer can continue without relying on chat history.
**Working name:** Nightjar (temporary; subject to change).

## 1. Product vision

Build a general-purpose, VS Code–style desktop IDE for building websites and other software, with an optional local assistant and cybersecurity learning workflow. The IDE should support ordinary development tasks such as browsing and editing projects, searching code, working with Git, running development tools after explicit approval, and previewing locally built websites. It should remain useful without a network connection after installation and model setup. Cybersecurity practice is an additional use case, not the whole purpose of the product.

This project is inspired by coding-agent products such as OpenCode and Freebuff. It is not a plan to copy their branding or proprietary implementation. Prioritize a small, dependable local application before cloud sync, hosted accounts, integrations, or mobile clients.

## 2. User and intended use

The initial user is a solo developer who wants to build websites and general software, and also learn defensive security concepts using toy projects and intentionally vulnerable local training apps. Security testing is limited to systems the user owns or is authorized to assess.

The application should make the authorized, local lab context clear. It should not silently scan networks, access third-party systems, run commands, or modify files. Its controls should make the target workspace and command execution visible to the user.

## 3. Product principles

1. **Offline-first:** Core editor, project browsing, chat history, local inference, and local project operations work without a network connection once dependencies and model weights are present.
2. **Local by default:** Project content and conversations stay on the device. No telemetry or remote model fallback in the MVP.
3. **Human review:** The user can inspect every proposed file change before it is applied.
4. **Explicit execution:** Commands are displayed before execution and require user approval. Show working directory and command output.
5. **Safe practice:** Encourage isolated, disposable labs for security exercises. The IDE is a development tool, not a guarantee of system security.
6. **Replaceable model backend:** Do not hardwire the interface to one Hugging Face model or inference runtime.
7. **Small MVP:** Deliver a dependable editing loop before advanced agents, integrations, or cloud features.

## 4. MVP scope

### Included

- Windows desktop application as the first target (the project owner is currently using Windows). Keep architecture portable where reasonable, but do not delay MVP for macOS/Linux packaging.
- Open a user-selected local project folder.
- File tree with basic create, rename, and delete actions, with confirmation for destructive operations.
- Code editor with syntax highlighting, tabs, dirty-file indication, and save.
- General web development support for HTML, CSS, JavaScript, TypeScript, JSON, Markdown, and common configuration files.
- Project-wide text search, local Git status/diffs, an integrated terminal with explicit command approval, and local website preview.
- Local assistant panel for text chat and selected-file/project context.
- Model settings that allow selecting a model already present on disk and configuring the local inference runtime.
- Assistant can explain code and propose changes as a reviewable diff.
- User explicitly accepts or rejects each proposed change.
- Local chat history, with a way to clear it.
- Command panel to run a user-approved command in the selected project directory and display output/exit status.
- Clear offline status and clear errors when a model/runtime is not installed or available.
- Basic settings for workspace, model, and lab safety behavior.
- Branded Windows app icon and installer-created desktop and Start menu shortcuts.
- An extension/provider catalog with clear local-versus-cloud behavior and explicit permissions.
- Optional GitHub, Vercel, and Netlify connections for repository and deployment workflows.

### Explicitly deferred

- Automatic execution of agent plans or shell commands.
- Autonomous internet or LAN reconnaissance.
- Cloud sync, telemetry, and silent remote model fallbacks.
- Third-party service connections until the user explicitly connects them and approves scopes.
- Mobile app, browser app, collaboration, or multi-user support.
- Marketplace or one-click downloads of arbitrary models in-app.
- Multi-agent workflows, advanced retrieval/indexing, and broad IDE plugin support.
- Claims that model output is correct, safe, or suitable for production security work.

## 5. Proposed architecture

Keep boundaries clear so components can be replaced independently.

### Desktop shell

Use **Electron + React + TypeScript + Vite** as a practical first implementation, unless initial repository inspection finds an existing compatible foundation. Electron is likely familiar and provides a straightforward Windows desktop path. Keep privileged operations in the main process and expose a narrow, typed preload API to the UI. Do not enable unrestricted Node access in renderer pages.

### UI

- Three-pane workspace: project/file tree, editor, assistant/chat; terminal/command output can be a bottom panel.
- Use Monaco Editor or another established editor component rather than writing an editor from scratch.
- Make visual layout responsive to window resizing and usable at a typical laptop resolution.
- Show clear states: no project, no model, model loading, ready, generating, error, and offline.

### Local model runtime

Create a provider interface, for example:

```ts
interface LocalModelProvider {
  listModels(): Promise<ModelInfo[]>;
  getStatus(): Promise<ProviderStatus>;
  chat(request: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk>;
}
```

Potential first runtime: **llama.cpp server or a bundled llama.cpp-compatible process using GGUF files**. This is a proposal, not a final selection. Verify Windows support, packaging, licensing, model format compatibility, and hardware needs before implementation. A local HTTP endpoint is acceptable only if it binds to loopback and the app clearly identifies it as local. Add other runtimes later behind the provider interface.

Model weights are user-provided or installed through an explicitly requested setup flow. The IDE should not assume that every Hugging Face repository has a compatible GGUF file. Display model name, local path, quantization when available, and license/source metadata when known. Never silently download weights.

### Providers, plugins, and integrations

Treat these as distinct extension types, even if the UI presents them in one catalog:

- **Model providers:** llama.cpp/local GGUF first; Qwen can be used when a compatible local model/runtime build is available. Claude and Inception's Mercury 3 are hosted providers and require network access, provider credentials, and explicit per-request data-sharing consent. Never enable them in offline mode or as automatic fallbacks.
- **Coding agents:** Cline is a VS Code extension/agent product, not a model. Do not claim drop-in VS Code extension compatibility. Prefer an explicit, supported connector after technical review.
- **Service integrations:** GitHub, Vercel, and Netlify connectors should each request the narrowest needed scopes, explain actions before authorization, and provide disconnect/revoke controls. Store credentials in OS-protected storage, never localStorage or project files.
- **Third-party plugins:** Start with built-in adapters described by a typed manifest. Do not load arbitrary plugin JavaScript into Electron's privileged main process. A later third-party extension system needs provenance/signature checks, isolation, version controls, and a user-visible permission grant/revoke screen.

Provider capabilities should be explicit (chat, streaming, tools, vision, local/cloud) so the UI can hide unsupported actions. Project files and prompts sent to a cloud provider must be disclosed before sending; cloud providers are disabled when offline mode is enabled.

### Project/file access

- Main process owns filesystem access and validates all paths against the selected workspace for workspace-scoped actions.
- Do not follow symlinks outside the workspace without explicit user action and clear disclosure.
- Use bounded reads for context; avoid sending an entire large repository into a small model.
- Exclude common generated/vendor directories by default (for example `.git`, `node_modules`, build output), with user-visible configuration.
- Keep backups or atomic writes for accepted edits where practical.

### Command execution

- Run only after an explicit user action.
- Display the exact command and working directory before launch.
- Never construct shell commands from model text and run them automatically.
- Start with a constrained command runner and process lifecycle controls (cancel/terminate, output limits, timeout).
- Prefer a disposable VM or container for cybersecurity labs. If container integration is later added, make network isolation and mounted folders explicit. Do not imply that Electron or a prompt alone provides a security sandbox.

### Data storage

Store settings and chat history locally in a documented app data directory. Avoid storing secrets in plain text. The MVP should not need API keys because model inference is local. Include a clear “delete local history” action. Do not add encryption claims without a reviewed design.

## 6. Model strategy

The user is considering small Hugging Face models, including 1B–9B parameter variants, some described as “uncensored” or “abliterated.” These are exploratory candidates, not requirements and not yet validated for the user’s hardware, quality, license, or runtime compatibility.

Selection criteria:

- Runs fully locally with the chosen inference backend.
- Fits the user’s RAM/VRAM and provides usable generation speed.
- Has a license compatible with the intended use.
- Handles code explanation and small, bounded edits well enough for practice.
- Includes clear provenance and model-card details.

Do not equate removal of refusal behavior with improved security capability. A small model can hallucinate, miss vulnerabilities, or suggest unsafe commands. The IDE must keep review and execution controls regardless of model choice.

Before recommending a specific model, collect the computer’s operating system, RAM, GPU, and VRAM, then verify current model files, licenses, and runtime compatibility from primary sources/model cards.

## 7. Core user journeys

### First launch

1. Explain that the app is local-first and that model weights are not bundled by default.
2. Let the user choose a local model file or configure an already installed local runtime.
3. Show runtime/model readiness and a short hardware-fit note when available.
4. Let the user open or create a practice workspace.
5. Explain that commands should be run in an isolated lab and always require approval.

### Ask about a file

1. User opens a project and selects a file or a bounded set of context files.
2. User asks the assistant a question.
3. App shows which files are included in context.
4. Assistant responds locally; user can stop generation.

### Apply a code suggestion

1. Assistant proposes a patch.
2. App validates that changed paths are within the selected workspace.
3. User reviews a readable diff.
4. User accepts or rejects the patch.
5. On acceptance, app writes changes safely and reports the affected files.

### Run a lab command

1. User enters or selects a command.
2. App shows exact command, working directory, and any configured execution boundary.
3. User approves execution.
4. App streams bounded output, supports cancellation, and reports exit status.

## 8. Milestones

### Milestone 0 — Repository and machine discovery

- Confirm project folder and inspect any existing files before coding.
- Record Windows version, RAM, GPU, and VRAM when available.
- Decide packaging target and check whether a compatible local inference runtime is available.
- Confirm model license/source and obtain a legally usable test model through the user’s chosen setup path.

### Milestone 1 — Desktop shell

- Electron + React + TypeScript scaffold.
- Secure main/preload/renderer separation.
- App frame, navigation, settings view, and local empty states.

### Milestone 2 — Project workspace

- Open folder, file tree, tabs, editor, save, dirty-state handling.
- Workspace path validation and basic file-operation confirmations.

### Milestone 3 — Local model connection

- Implement provider interface and one local runtime adapter.
- Model/runtime status, streaming chat, cancellation, error handling.
- Verify behavior with network disconnected after setup.

### Milestone 4 — Reviewable edits

- Structured patch proposal, diff view, accept/reject, safe writes.
- Keep model output untrusted; reject malformed or out-of-workspace paths.

### Milestone 5 — Command panel and practice workflow

- Explicit command confirmation, bounded output, timeout and cancellation.
- Document and demonstrate a safe toy lab workflow.
- Add optional container/VM guidance or integration only after threat review.

### Milestone 6 — Packaging and handoff

- Package a Windows build with clear runtime/model setup instructions.
- Review offline behavior, permissions, failure states, and recovery.
- Publish an updated status and known limitations in this document or a changelog.

## 9. Definition of done for MVP

- App launches on the target Windows machine.
- User can open a local project, edit/save files, and use basic file navigation.
- Configured local model can answer a prompt without sending project data to a remote service.
- User can see and control which file context is provided.
- Proposed edits are reviewed as diffs and only written after user acceptance.
- Commands are never run solely because model output requested them; the user sees and approves command and working directory.
- No network access is needed for core app operation after installation/model setup; this is demonstrated or carefully verified.
- Errors for missing model/runtime, invalid patch, and failed command are understandable and recoverable.
- Documentation lists model/runtime setup, storage locations, limitations, and safe practice recommendations.

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Small model produces incorrect or unsafe advice | Show output as suggestions, maintain diff review and command approval, encourage independent validation |
| Model/runtime does not fit hardware | Gather specs, support quantized models, show clear model/runtime status, keep provider replaceable |
| Prompted file path escapes workspace | Validate paths in main process, reject traversal and unauthorized symlinks |
| Malicious project content influences model | Treat repository content as untrusted data; do not let it authorize actions or change tool policy |
| Shell command causes damage | Explicit approval, visible command/cwd, bounded process runner, recommend disposable isolated lab |
| Accidental online data transfer | No remote fallback or telemetry in MVP; verify runtime binds locally; make network behavior documented |
| Model license or redistribution issue | User-supplied models initially; inspect each model card/license before offering redistribution |
| Packaging becomes too large | Keep model weights separate from installer; document local model setup |

## 11. Decisions made and still open

### Established from the user’s request

- Build the IDE first.
- It is a desktop IDE intended to feel like a VS Code-style general-purpose development environment.
- The user wants to build websites with it; web development is a first-class use case.
- Initial focus is completely offline operation with small local Hugging Face models.
- Cybersecurity practice is an additional learning use case, not the IDE’s only purpose.
- A detailed project handoff document is needed so a different model can continue later.

### Proposed defaults, not yet confirmed by implementation

- Windows first, because the current workspace is on Windows.
- Electron + React + TypeScript + Vite.
- Monaco editor.
- One local GGUF-compatible runtime first, behind a replaceable provider interface.
- Offline mode is default; no telemetry or silent remote model fallback.

### Product requests captured (pending implementation)

- Branded Windows app icon and installer-created desktop/Start menu shortcuts.
- Provider/extension support for local Qwen, hosted Claude and Mercury 3, and a reviewed Cline connector path.
- Opt-in GitHub, Vercel, and Netlify service integrations.
- Integrated terminal remains a core feature; it is now present with explicit command confirmation.

### Open questions for the implementation phase

- What are the user’s RAM, GPU, and VRAM specs?
- Which local runtime should be the first supported backend?
- Should lab command execution be omitted from the earliest prototype, or included with explicit approval?
- Should the first release be portable or installed through a Windows installer?
- Which specific model should be used for initial compatibility and quality checks?

Resolve these through repository and hardware discovery where possible; do not block early UI scaffolding on model choice.

## 12. Instructions for the next coding model

1. Read this file fully before changing anything.
2. Treat all statements above as product intent and proposed architecture; distinguish confirmed user requirements from open decisions.
3. Inspect the current repository and any `AGENTS.md` instructions first. Do not assume a prior project or unrelated app is the IDE.
4. Report the actual project root and existing stack before implementation.
5. Work in small, reviewable milestones. Do not silently expand scope.
6. Keep privileged filesystem/process/model operations in the desktop main process behind a narrow API.
7. Never add a remote fallback, telemetry, automatic command execution, or automatic model download without explicit product direction.
8. When modifying code, summarize changed files, user-visible behavior, how it was checked, and remaining limitations.
9. Update this project document as real decisions are made; label proposed choices as decided only after implementation/user confirmation.
10. Do not claim an offline guarantee until network behavior has been checked for the actual packaged application and local runtime.

## 13. Current progress (updated 2026-10-24)

### Implemented in this workspace

- Added an Electron + React + TypeScript + Vite application scaffold.
- Added a dark VS Code–inspired IDE UI named **Nightjar** (working name): activity rail, file explorer/search/Git panels, editor, assistant panel, and terminal panel.
- Added Monaco editor tabs, dirty state, save, language selection, file filtering, and workspace empty states.
- Added Electron main/preload split with context isolation, Node integration disabled, sandbox enabled, popup denial, and a narrow typed-style `window.ide` API.
- Added local folder selection, bounded file reads, save, file/folder creation, rename/delete with confirmation, and project path checks in the Electron main process. Symlinks are excluded from the file tree and reads are checked against the real path.
- Added assistant connection UI and an OpenAI-compatible local chat request path, with selected-file context limited to 12,000 characters and an explicit local-only status.
- Added loopback-only endpoint validation for `127.0.0.1`, `localhost`, and `::1` using HTTP. No automatic remote fallback or model download is implemented.
- Added bounded project text search (generated/vendor directories ignored; binary and large files skipped; up to 200 matches).
- Added Git status and unstaged tracked diff inspection through fixed-argument `git` subprocess calls; no staging or commit actions.
- Added a Windows command panel: user-entered commands show the project working directory and require native confirmation before execution. Process runtime is capped at 10 minutes, output at 1 MB, and the UI retains only the latest 16 KB. This is not a sandbox.
- Added local website preview in a separate Electron window for HTTP loopback URLs with an explicit port; the preview has no Node integration or preload and blocks navigation away from the selected origin.
- Added Nightjar SVG icon source, generated Windows ICO asset, Electron window icon, and electron-builder NSIS/portable configuration. NSIS is configured to create desktop and Start menu shortcuts.
- Updated the product direction: Nightjar is a general-purpose IDE for websites and software, with cybersecurity learning as an optional workflow.
- Removed remote font imports so the UI stylesheet does not need to fetch web assets.

### Not implemented / not verified

- Windows NSIS installer and portable app were built under `release/`. The packaged app includes the llama.cpp CPU server and required DLLs; model weights stay in AppData. The Desktop shortcut points to the portable build. The NSIS installer is configured to create desktop and Start menu shortcuts when installed.
- The ICO source now contains a 256x256 image accepted by electron-builder. Code signing/executable resource editing is disabled because this Windows environment cannot extract the builder's signing tools due symlink privilege restrictions. The NSIS installer/uninstaller and Desktop shortcut use the Nightjar ICO, and the BrowserWindow loads it at runtime. The executable is unsigned; Windows SmartScreen may warn.
- The installer has not been run and the packaged app has not been interactively launched/verified. Offline behavior is not certified. Packaging currently bundles the CPU runtime from `llama-b11852-bin-win-cpu-x64`.

- No model installer or model weights are included. Settings can now select a trusted `llama-server.exe` and local GGUF file, start/stop the process without a shell, and set CPU threads. Paths are held for the app session and must be selected again after restarting Nightjar. The process binds to `127.0.0.1:8080`; interactive startup, chat, and shutdown have not yet been manually exercised.
- The user-provided Qwen2.5-Coder-1.5B-Instruct Q4_K_M model is present at `%APPDATA%\offline-cyber-ide\models\Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf` (986,048,800 bytes). Startup discovery checks this existing Electron app-data location and the app's current userData model directory.
- Added an Ollama backend option. It checks the local `/api/tags` endpoint for the requested tag and uses Ollama's OpenAI-compatible loopback API for chat and edit suggestions. Default tag is `huihui_ai/qwen2.5-coder-abliterate:1.5b`; user must first run `ollama run huihui_ai/qwen2.5-coder-abliterate:1.5b` in a trusted terminal to download and start it.
- Added Connected Accounts UI using installed `gh`, `vercel`, `netlify`, and `hf` CLIs for sign-in and status checks. Nightjar does not receive or store provider tokens; CLIs own credentials. Sign-in requires internet and account authorization; integrations do not currently provide in-app repository browsing/deployment actions.
- Git support currently reads status and unstaged tracked diffs only. It does not stage, commit, switch branches, or show untracked file contents.
- Search is bounded text search over project files; it excludes common generated/vendor folders, skips binary and large files, and caps returned matches.
- Terminal execution is user-entered and requires explicit confirmation; commands run in the selected project directory but are **not sandboxed**. Process time and displayed output are bounded, but commands may still modify files or affect the computer. Use trusted commands and isolated VMs/containers for risky labs.
- Preview accepts an HTTP loopback URL with an explicit port and opens it in a separate sandboxed Electron window with Node integration disabled. This assumes the user has explicitly started a trusted local dev server.
- Assistant edit proposals now target only the selected file, require structured output, enforce a 2 MB maximum, check that the open buffer has not changed, and show a Monaco side-by-side diff before the user accepts a save. This has typechecked but has not yet been manually exercised with a running model.
- No container/VM integration or strong command execution boundary is implemented (Milestone 5 remains open).
- Windows NSIS installer and portable executable are built in `release/`; they have not been launched or visually checked. Offline proof remains open (Milestone 6).
- Dependencies are installed and `package-lock.json` is present.
- `npm run typecheck` passes. `npm run build` passes when run with permission for Vite/esbuild to start its helper process; restricted execution otherwise reports `spawn EPERM`.
- `electron-builder` is installed and `package-lock.json` was refreshed for packaging. `npm install` reported 14 dependency audit findings (13 high, 1 critical); review/update dependencies before production distribution.
- Electron desktop launch and interactive file/search/Git/command/preview flows have not yet been manually exercised.
- No plugin runtime/catalog, Claude or Mercury 3 API adapter, Cline connector, GitHub OAuth flow, or Vercel/Netlify integration is implemented yet. Claude and Mercury 3 require hosted connectivity and credentials; they cannot be used in a fully offline session. Cline is an agent/extension, not a model.
- The provider account panel invokes the provider CLIs for login and status, but account-linked repository/project/deployment actions are not implemented. CLI availability is checked at runtime; those CLIs are already installed on the user's machine. GitHub CLI web login, Vercel/Netlify device/browser login, and Hugging Face CLI browser login depend on live internet and user authorization.
- Ollama backend and CLI sign-in flows have passed typecheck and production build, but have not been interactively exercised in the desktop app yet.

### Files added

- `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`
- `electron/main.cjs`, `electron/preload.cjs`
- `src/main.tsx`, `src/App.tsx`, `src/types.ts`, `src/styles/app.css`
- `assets/nightjar.svg`, `build/icon.ico`, `scripts/make-icon.py`

### Next steps

1. Launch with `npm run desktop` and manually exercise the editor, workspace operations, search, Git status/diffs, command confirmation/stop/output bounds, and local preview.
2. Run the NSIS installer and verify install/uninstall, Start menu and desktop shortcuts, app icon, and packaged runtime startup.
3. Manually verify Ollama model discovery/chat, switch between Ollama and llama.cpp backends, and exercise all CLI sign-in/status flows.
4. Add a curated extension catalog and permissions model; investigate Cline as an agent connector rather than assuming VS Code extensions install directly.
5. Manually exercise local runtime lifecycle and reviewed edit acceptance/rejection with a compatible local model.
6. Add account-linked GitHub repository and Vercel/Netlify project/deployment actions through the existing provider CLIs, with approvals before publication or remote writes.
7. Consider stronger command isolation before positioning terminal execution as suitable for untrusted code or risky labs.
8. Verify core offline behavior with network disconnected. Hosted providers and service integrations must remain unavailable in offline mode.

### Handoff caution

The current code is a working IDE prototype, not a completed or verified offline product. Runtime selection/launch and diff review have been implemented but require interactive verification. The installer dependency is declared but may not be installed and packaging/offline behavior have not been proven. Hosted providers and service integrations remain future work. Update this section as milestones are verified.
