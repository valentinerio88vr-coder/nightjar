const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

let mainWindow;
let projectRoot = null;
let activeCommand = null;
let commandSequence = 0;
let runtimeBinary = app.isPackaged ? path.join(process.resourcesPath, 'llama-b11852-bin-win-cpu-x64', 'llama-server.exe') : null;
let runtimeModel = null;
let modelProcess = null;
const integrationProcesses = new Map();
const devUrl = 'http://127.0.0.1:5173';

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function projectPath(relativePath) {
  if (!projectRoot || typeof relativePath !== 'string') throw new Error('No project is open.');
  const target = path.resolve(projectRoot, relativePath);
  if (!inside(projectRoot, target)) throw new Error('Path is outside the open project.');
  return target;
}

async function tree(dir = projectRoot, depth = 0) {
  if (!dir || depth > 8) return [];
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.cache']);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    const relative = path.relative(projectRoot, full).split(path.sep).join('/');
    result.push(entry.isDirectory()
      ? { name: entry.name, path: relative, type: 'directory', children: await tree(full, depth + 1) }
      : { name: entry.name, path: relative, type: 'file' });
  }
  return result;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500, height: 940, minWidth: 980, minHeight: 640,
    backgroundColor: '#101214', title: 'Nightjar — Offline IDE',
    icon: path.join(__dirname, '../build/icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(devUrl)) return;
    event.preventDefault();
  });
  if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  else mainWindow.loadURL(devUrl);
}

ipcMain.handle('project:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (canceled || !filePaths[0]) return null;
  projectRoot = await fs.realpath(filePaths[0]);
  return { root: projectRoot, name: path.basename(projectRoot), tree: await tree() };
});
ipcMain.handle('project:refresh', async () => ({ root: projectRoot, name: projectRoot ? path.basename(projectRoot) : null, tree: await tree() }));
ipcMain.handle('file:read', async (_event, relativePath) => {
  const target = projectPath(relativePath);
  const real = await fs.realpath(target);
  if (!inside(projectRoot, real)) throw new Error('Symlink target is outside the open project.');
  const stat = await fs.stat(real);
  if (!stat.isFile() || stat.size > 2_000_000) throw new Error('File is not readable or exceeds the 2 MB editor limit.');
  return fs.readFile(real, 'utf8');
});
ipcMain.handle('file:save', async (_event, relativePath, content) => {
  if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > 2_000_000) throw new Error('File content must be text under 2 MB.');
  const target = projectPath(relativePath);
  const parentReal = await fs.realpath(path.dirname(target));
  if (!inside(projectRoot, parentReal)) throw new Error('Target is outside the open project.');
  const temp = `${target}.nightjar-tmp`;
  await fs.writeFile(temp, content, 'utf8');
  await fs.rename(temp, target);
  return true;
});
ipcMain.handle('project:create-file', async (_event, relativePath) => {
  const target = projectPath(relativePath);
  const parentReal = await fs.realpath(path.dirname(target));
  if (!inside(projectRoot, parentReal)) throw new Error('Target is outside the open project.');
  await fs.writeFile(target, '', { flag: 'wx' });
  return tree();
});
ipcMain.handle('project:create-folder', async (_event, relativePath) => {
  const target = projectPath(relativePath);
  const parentReal = await fs.realpath(path.dirname(target));
  if (!inside(projectRoot, parentReal)) throw new Error('Parent folder is outside the open project.');
  await fs.mkdir(target, { recursive: false });
  const real = await fs.realpath(target);
  if (!inside(projectRoot, real)) throw new Error('Folder is outside the open project.');
  return tree();
});
ipcMain.handle('project:rename', async (_event, oldRelative, newRelative) => {
  const source = projectPath(oldRelative);
  const target = projectPath(newRelative);
  const sourceReal = await fs.realpath(source);
  const targetParent = await fs.realpath(path.dirname(target));
  if (!inside(projectRoot, sourceReal) || !inside(projectRoot, targetParent)) throw new Error('Path is outside the open project.');
  await fs.rename(sourceReal, target);
  return tree();
});
ipcMain.handle('project:delete', async (_event, relativePath) => {
  const target = projectPath(relativePath);
  const real = await fs.realpath(target);
  if (!inside(projectRoot, real) || real === projectRoot) throw new Error('Cannot delete outside the project or delete its root.');
  await fs.rm(real, { recursive: true, force: false });
  return tree();
});
ipcMain.handle('project:search', async (_event, query) => {
  if (!projectRoot) throw new Error('No project is open.');
  if (typeof query !== 'string' || !query.trim()) return [];
  const needle = query.trim().toLowerCase();
  const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.cache', 'vendor', 'coverage']);
  const results = [];
  let bytesRead = 0;
  const maxBytes = 12 * 1024 * 1024;
  async function visit(dir, depth = 0) {
    if (depth > 12 || results.length >= 200 || bytesRead >= maxBytes) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= 200 || bytesRead >= maxBytes) break;
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { await visit(full, depth + 1); continue; }
      const stat = await fs.stat(full);
      if (!stat.isFile() || stat.size > 512 * 1024) continue;
      const content = await fs.readFile(full);
      bytesRead += content.length;
      if (content.includes(0)) continue;
      const lines = content.toString('utf8').split(/\r?\n/);
      const relative = path.relative(projectRoot, full).split(path.sep).join('/');
      for (let i = 0; i < lines.length && results.length < 200; i++) {
        if (lines[i].toLowerCase().includes(needle)) results.push({ path: relative, line: i + 1, text: lines[i].trim().slice(0, 300) });
      }
    }
  }
  await visit(projectRoot);
  return { results, truncated: results.length >= 200 || bytesRead >= maxBytes };
});
ipcMain.handle('git:status', async () => {
  if (!projectRoot) throw new Error('No project is open.');
  try {
    const { stdout, stderr } = await execFileAsync('git', ['-C', projectRoot, 'status', '--short', '--branch'], { windowsHide: true, timeout: 8000, maxBuffer: 1024 * 1024 });
    return { available: true, text: stdout || stderr || 'Working tree clean.', diff: '' };
  } catch (error) {
    if (error.code === 'ENOENT') return { available: false, text: 'Git was not found on PATH.', diff: '' };
    if (error.code === 128) return { available: true, text: 'This folder is not a Git repository.', diff: '' };
    throw error;
  }
});
ipcMain.handle('git:diff', async () => {
  if (!projectRoot) throw new Error('No project is open.');
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectRoot, '--no-pager', 'diff', '--no-ext-diff', '--no-color', '--', '.'], { windowsHide: true, timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
    return stdout.slice(0, 1024 * 1024) || 'No unstaged tracked changes.';
  } catch (error) {
    if (error.code === 'ENOENT') return 'Git was not found on PATH.';
    if (error.code === 128) return 'This folder is not a Git repository.';
    throw error;
  }
});
ipcMain.handle('command:run', async (_event, command) => {
  if (!projectRoot) throw new Error('Open a project before running a command.');
  if (activeCommand) throw new Error('A command is already running. Stop it before starting another.');
  if (typeof command !== 'string' || !command.trim() || command.length > 2000) throw new Error('Enter a command under 2,000 characters.');
  const id = ++commandSequence;
  const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { cwd: projectRoot, windowsHide: true, shell: false, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
  activeCommand = { id, child, bytes: 0, timer: null, stopped: false };
  const emit = payload => mainWindow?.webContents.send('command:event', { id, ...payload });
  const stop = reason => {
    if (!activeCommand || activeCommand.id !== id || activeCommand.stopped) return;
    activeCommand.stopped = true;
    if (activeCommand.timer) clearTimeout(activeCommand.timer);
    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
    emit({ type: 'limit', text: reason });
  };
  activeCommand.timer = setTimeout(() => stop('Stopped after the 10 minute command limit.'), 10 * 60 * 1000);
  const output = (stream, chunk) => {
    if (!activeCommand || activeCommand.id !== id || activeCommand.stopped) return;
    const text = chunk.toString('utf8');
    activeCommand.bytes += Buffer.byteLength(text);
    if (activeCommand.bytes > 1024 * 1024) { stop('Stopped after the 1 MB output limit.'); return; }
    emit({ type: 'output', stream, text });
  };
  child.stdout.on('data', chunk => output('stdout', chunk));
  child.stderr.on('data', chunk => output('stderr', chunk));
  child.on('error', error => { emit({ type: 'exit', code: 1, text: error.message }); if (activeCommand?.id === id) { clearTimeout(activeCommand.timer); activeCommand = null; } });
  child.on('close', code => { emit({ type: 'exit', code: code ?? 1, text: `\nProcess exited with code ${code ?? 1}.` }); if (activeCommand?.id === id) { clearTimeout(activeCommand.timer); activeCommand = null; } });
  emit({ type: 'start', cwd: projectRoot, command });
  return id;
});
ipcMain.handle('command:stop', async () => {
  if (!activeCommand) return false;
  const { child } = activeCommand;
  activeCommand.stopped = true;
  if (activeCommand.timer) clearTimeout(activeCommand.timer);
  execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
  return true;
});
ipcMain.handle('preview:open', async (_event, value) => {
  let url;
  try { url = new URL(value); } catch { throw new Error('Enter a valid local preview URL.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port) throw new Error('Preview accepts only an HTTP loopback URL with an explicit port.');
  const preview = new BrowserWindow({ width: 1280, height: 820, title: `Preview — ${url.host}`, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  preview.webContents.on('will-navigate', (event, target) => { if (!target.startsWith(`${url.origin}/`) && target !== url.origin) event.preventDefault(); });
  await preview.loadURL(url.toString());
  return true;
});
ipcMain.handle('dialog:confirm', async (_event, message) => {
  const { response } = await dialog.showMessageBox(mainWindow, { type: 'warning', buttons: ['Cancel', 'Continue'], defaultId: 0, cancelId: 0, message: String(message) });
  return response === 1;
});
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('integrations:status', async () => {
  const checks = [
    ['github', 'gh', ['auth', 'status', '--hostname', 'github.com']],
    ['vercel', 'vercel', ['whoami']],
    ['netlify', 'netlify', ['status']],
    ['huggingface', 'hf', ['auth', 'whoami']]
  ];
  const results = await Promise.all(checks.map(async ([id, bin, args]) => {
    try {
      const executable = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : bin;
      const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', `${bin} ${args.join(' ')}`] : args;
      const { stdout, stderr } = await execFileAsync(executable, commandArgs, { windowsHide: true, timeout: 8000, maxBuffer: 65536 });
      const text = `${stdout || ''}\n${stderr || ''}`.replace(/(?:gh[pousr]_[A-Za-z0-9_]+|hf_[A-Za-z0-9]+|vercel_[A-Za-z0-9_-]+)/g, '[redacted]').trim();
      return [id, { connected: true, detail: (text.split(/\r?\n/).find(line => line.trim()) || 'Signed in').slice(0, 120) }];
    } catch (error) {
      const msg = String(error.stderr || error.message || 'Not connected').replace(/(?:gh[pousr]_[A-Za-z0-9_]+|hf_[A-Za-z0-9]+|vercel_[A-Za-z0-9_-]+)/g, '[redacted]');
      return [id, { connected: false, detail: msg.includes('not logged') || msg.includes('not authenticated') ? 'Not signed in' : 'Not signed in or CLI unavailable' }];
    }
  }));
  return Object.fromEntries(results);
});
ipcMain.handle('integrations:login', async (_event, id) => {
  const commands = {
    github: ['gh', ['auth', 'login', '--web', '--hostname', 'github.com', '--git-protocol', 'https', '--skip-ssh-key']],
    vercel: ['vercel', ['login']],
    netlify: ['netlify', ['login']],
    huggingface: ['hf', ['auth', 'login']]
  };
  const selected = commands[id];
  if (!selected) throw new Error('Unknown integration.');
  if (integrationProcesses.has(id)) throw new Error('Sign-in is already running.');
  const [bin, args] = selected;
  const child = spawn(bin, args, { windowsHide: true, shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
  integrationProcesses.set(id, child);
  const emit = payload => mainWindow?.webContents.send('integration:event', { provider: id, ...payload });
  emit({ type: 'start', text: `Starting ${id} sign-in…\n` });
  const clean = text => String(text).replace(/(?:gh[pousr]_[A-Za-z0-9_]+|hf_[A-Za-z0-9]+|vercel_[A-Za-z0-9_-]+)/g, '[redacted]').slice(0, 12000);
  child.stdout.on('data', chunk => emit({ type: 'output', text: clean(chunk.toString('utf8')) }));
  child.stderr.on('data', chunk => emit({ type: 'output', text: clean(chunk.toString('utf8')) }));
  if (id === 'huggingface') setTimeout(() => { if (integrationProcesses.get(id) === child && child.stdin.writable) child.stdin.write('\n'); }, 400);
  child.on('error', error => { emit({ type: 'exit', text: `Could not start CLI: ${error.message}` }); integrationProcesses.delete(id); });
  child.on('close', code => { emit({ type: 'exit', text: `Sign-in command finished (exit ${code ?? 1}).` }); integrationProcesses.delete(id); });
  return true;
});
ipcMain.handle('model:recommended-path', async () => {
  const filename = 'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf';
  const candidates = [path.join(app.getPath('userData'), 'models', filename), path.join(app.getPath('appData'), 'offline-cyber-ide', 'models', filename)];
  for (const target of candidates) {
    try { if ((await fs.stat(target)).isFile()) { runtimeModel = await fs.realpath(target); return runtimeModel; } } catch {}
  }
  return null;
});
ipcMain.handle('model:runtime-path', async () => {
  const packaged = path.join(process.resourcesPath, 'llama-b11852-bin-win-cpu-x64', 'llama-server.exe');
  const source = path.join(__dirname, '..', 'llama-b11852-bin-win-cpu-x64', 'llama-server.exe');
  const candidates = app.isPackaged ? [packaged] : [source, packaged];
  for (const candidate of candidates) { try { if ((await fs.stat(candidate)).isFile()) { runtimeBinary = await fs.realpath(candidate); return runtimeBinary; } } catch {} }
  return null;
});
ipcMain.handle('model:download-recommended', async () => {
  const dir = path.join(app.getPath('userData'), 'models');
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, 'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf');
  const temp = `${target}.download`;
  const url = 'https://huggingface.co/bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf';
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Hugging Face download failed (HTTP ${response.status}).`);
  const expected = Number(response.headers.get('content-length') || 0);
  if (expected > 2_000_000_000) throw new Error('Unexpected model size; download cancelled.');
  const file = await fs.open(temp, 'w');
  let received = 0;
  try {
    for await (const chunk of response.body) {
      received += chunk.length;
      if (received > 2_000_000_000) throw new Error('Model download exceeded the 2 GB safety limit.');
      await file.write(chunk);
      if (received % (32 * 1024 * 1024) < chunk.length) mainWindow?.webContents.send('model:download-progress', { received, total: expected });
    }
    await file.sync();
  } catch (error) { await file.close(); await fs.rm(temp, { force: true }); throw error; }
  await file.close();
  if (expected && received !== expected) { await fs.rm(temp, { force: true }); throw new Error(`Incomplete download (${received} of ${expected} bytes).`); }
  await fs.rename(temp, target);
  runtimeModel = target;
  return { path: target, bytes: received };
});
ipcMain.handle('model:pick-runtime', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Select llama-server.exe', properties: ['openFile'], filters: [{ name: 'Windows executable', extensions: ['exe'] }] });
  if (canceled || !filePaths[0]) return null;
  const real = await fs.realpath(filePaths[0]);
  if (!(await fs.stat(real)).isFile()) throw new Error('Selected runtime is not a file.');
  runtimeBinary = real;
  return real;
});
ipcMain.handle('model:pick-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Select a local GGUF model', properties: ['openFile'], filters: [{ name: 'GGUF model', extensions: ['gguf'] }] });
  if (canceled || !filePaths[0]) return null;
  const real = await fs.realpath(filePaths[0]);
  if (!(await fs.stat(real)).isFile()) throw new Error('Selected model is not a file.');
  runtimeModel = real;
  return real;
});
ipcMain.handle('model:start', async (_event, threadsValue) => {
  if (modelProcess) throw new Error('The local model runtime is already running.');
  if (!runtimeBinary || !runtimeModel) throw new Error('Select both llama-server.exe and a GGUF model first.');
  const threads = Number(threadsValue);
  if (!Number.isInteger(threads) || threads < 1 || threads > 32) throw new Error('CPU threads must be between 1 and 32.');
  const [binaryReal, modelReal] = await Promise.all([fs.realpath(runtimeBinary), fs.realpath(runtimeModel)]);
  const args = ['-m', modelReal, '-c', '4096', '-t', String(threads), '--host', '127.0.0.1', '--port', '8080'];
  const child = spawn(binaryReal, args, { cwd: path.dirname(binaryReal), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  modelProcess = child;
  const emit = payload => mainWindow?.webContents.send('model:event', payload);
  emit({ type: 'starting', text: `Starting local model with ${threads} CPU threads on 127.0.0.1:8080.\n` });
  let total = 0;
  const log = (stream, chunk) => {
    total += chunk.length;
    if (total <= 512 * 1024) emit({ type: 'log', stream, text: chunk.toString('utf8') });
  };
  child.stdout.on('data', chunk => log('stdout', chunk));
  child.stderr.on('data', chunk => log('stderr', chunk));
  child.on('error', error => { emit({ type: 'exit', text: `Runtime error: ${error.message}` }); if (modelProcess === child) modelProcess = null; });
  child.on('close', code => { emit({ type: 'exit', text: `Runtime stopped (exit ${code ?? 1}).` }); if (modelProcess === child) modelProcess = null; });
  return { endpoint: 'http://127.0.0.1:8080' };
});
ipcMain.handle('ollama:use-model', async (_event, tag) => {
  if (typeof tag !== 'string' || !/^[a-zA-Z0-9._/-]+(?::[a-zA-Z0-9._-]+)?$/.test(tag)) throw new Error('Invalid Ollama model tag.');
  const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error('Ollama did not respond on 127.0.0.1:11434. Start Ollama first.');
  const data = await response.json();
  const models = Array.isArray(data.models) ? data.models : [];
  const match = models.find(model => model.name === tag || model.model === tag);
  if (!match) throw new Error(`Model ${tag} is not installed in Ollama. Run: ollama run ${tag}`);
  return { endpoint: 'http://127.0.0.1:11434', model: match.name || match.model };
});
ipcMain.handle('model:stop', async () => {
  if (!modelProcess) return false;
  const child = modelProcess;
  execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
  return true;
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => {
  if (activeCommand?.child?.pid) execFile('taskkill', ['/pid', String(activeCommand.child.pid), '/t', '/f'], { windowsHide: true }, () => {});
  if (modelProcess?.pid) execFile('taskkill', ['/pid', String(modelProcess.pid), '/t', '/f'], { windowsHide: true }, () => {});
  for (const child of integrationProcesses.values()) if (child.pid) execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
