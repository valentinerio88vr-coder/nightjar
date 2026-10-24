# Nightjar

Nightjar is a Windows-first, offline-first desktop IDE scaffold for building websites and software. It includes a local project workspace, Monaco editor, project text search, read-only Git status/diff, an approval-gated terminal, a loopback website preview window, and an optional local-model chat panel.

## Run from source

```powershell
npm install
npm run desktop
```

The terminal runs a user-entered command from the open project directory only after a native confirmation prompt. Commands are not sandboxed. Use commands you trust; use a disposable VM/container for risky security labs.

The preview button opens a local HTTP loopback URL (default `http://127.0.0.1:5173`) in a separate Electron window. Start the project dev server from the terminal first.

## Windows package and shortcuts

The icon source is `assets/nightjar.svg`; `npm run make:icon` generates `build/icon.ico`. When the packaging dependency is installed, run:

```powershell
npm run dist:win
```

The current Windows artifacts are in `release/`: `Nightjar Setup 0.1.0.exe` and `Nightjar-0.1.0-portable.exe`. The NSIS installer creates desktop and Start menu shortcuts; the existing Desktop shortcut points to the portable build. The llama.cpp CPU runtime is included, while model weights are read from AppData. Run the installer to install Nightjar. The Windows executables are unsigned, so Windows SmartScreen may show a warning.

## Local models and connected accounts

Settings supports llama.cpp with a selected GGUF file and Ollama with an installed local model tag. For the requested Ollama model, run this once from a trusted terminal (it downloads model data from the internet), then choose **Ollama** in Nightjar Settings and use the matching model tag:

```powershell
ollama run huihui_ai/qwen2.5-coder-abliterate:1.5b
```

The **Accounts** panel uses GitHub CLI (`gh`), Vercel CLI (`vercel`), Netlify CLI (`netlify`), and Hugging Face CLI (`hf`) to initiate sign-in and check status. Those tools store and manage their own credentials; Nightjar does not save provider tokens. Account sign-in requires internet. Account-linked repo browsing, deployment actions, and project-management integrations are not implemented yet.

Claude and Mercury 3 adapters, a plugin catalog, Cline integration, and direct GitHub/Vercel/Netlify actions remain future work. Cloud model requests must remain opt-in and disclose when project content leaves the machine.

See [project.md](project.md) for the full design, current status, and handoff instructions.
