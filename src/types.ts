export type TreeEntry = { name: string; path: string; type: 'file' | 'directory'; children?: TreeEntry[] };
export type ProjectSnapshot = { root: string | null; name: string | null; tree: TreeEntry[] };
export type SearchResult = { path: string; line: number; text: string };
export type CommandEvent = { id: number; type: 'start' | 'output' | 'exit' | 'limit'; cwd?: string; command?: string; stream?: string; text?: string; code?: number };
export type ModelEvent = { type: 'starting' | 'log' | 'exit'; stream?: string; text?: string };
export type IntegrationEvent = { provider: string; type: 'start' | 'output' | 'exit'; text?: string };
export type IntegrationStatus = Record<'github' | 'vercel' | 'netlify' | 'huggingface', { connected: boolean; detail: string }>;

declare global {
  interface Window {
    ide: {
      openProject(): Promise<ProjectSnapshot | null>;
      refreshProject(): Promise<ProjectSnapshot>;
      readFile(path: string): Promise<string>;
      saveFile(path: string, content: string): Promise<boolean>;
      createFile(path: string): Promise<TreeEntry[]>;
      createFolder(path: string): Promise<TreeEntry[]>;
      renamePath(oldPath: string, newPath: string): Promise<TreeEntry[]>;
      deletePath(path: string): Promise<TreeEntry[]>;
      searchProject(query: string): Promise<{ results: SearchResult[]; truncated: boolean }>;
      gitStatus(): Promise<{ available: boolean; text: string; diff: string }>;
      gitDiff(): Promise<string>;
      runCommand(command: string): Promise<number>;
      stopCommand(): Promise<boolean>;
      openPreview(url: string): Promise<boolean>;
      onCommandEvent(callback: (event: CommandEvent) => void): () => void;
      pickModelRuntime(): Promise<string | null>;
      pickModelFile(): Promise<string | null>;
      recommendedModelPath(): Promise<string | null>;
      modelRuntimePath(): Promise<string | null>;
      downloadRecommendedModel(): Promise<{ path: string; bytes: number }>;
      onModelDownloadProgress(callback: (progress: { received: number; total: number }) => void): () => void;
      startModel(threads: number): Promise<{ endpoint: string }>;
      useOllamaModel(tag: string): Promise<{ endpoint: string; model: string }>;
      stopModel(): Promise<boolean>;
      onModelEvent(callback: (event: ModelEvent) => void): () => void;
      integrationStatus(): Promise<IntegrationStatus>;
      integrationLogin(provider: 'github' | 'vercel' | 'netlify' | 'huggingface'): Promise<boolean>;
      onIntegrationEvent(callback: (event: IntegrationEvent) => void): () => void;
      confirm(message: string): Promise<boolean>;
      version(): Promise<string>;
    };
  }
}
export {};
