import { type ChildProcess, spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';

interface ToolConfig {
  workspace: string;
  port: number;
  title: string;
  env?: Record<string, string>;
}

const tools: Record<string, ToolConfig> = {
  examples: {
    workspace: '@flighthq/examples',
    port: 5173,
    title: 'Flight Examples',
  },
  gallery: {
    workspace: 'tools/gallery',
    port: 5174,
    title: 'Flight Gallery',
  },
  'gallery:examples': {
    workspace: 'tools/gallery',
    port: 5174,
    title: 'Flight Gallery: Examples',
    env: { VITE_GALLERY_TOOL: 'examples' },
  },
  'gallery:functional': {
    workspace: 'tools/gallery',
    port: 5174,
    title: 'Flight Gallery: Functional',
    env: { VITE_GALLERY_TOOL: 'functional' },
  },
  'gallery:reference': {
    workspace: 'tools/gallery',
    port: 5174,
    title: 'Flight Gallery: Reference',
    env: { VITE_GALLERY_TOOL: 'reference' },
  },
};

const toolName = process.argv[2];

if (!toolName || !(toolName in tools)) {
  console.error(`Usage: tsx ./scripts/electron-tool.ts <${Object.keys(tools).join('|')}>`);
  process.exit(1);
}

const tool = tools[toolName];
const host = '127.0.0.1';
const url = `http://${host}:${tool.port}/`;
const children: ChildProcess[] = [];
let shuttingDown = false;

function npm(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(command, args, {
    env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
  children.push(child);
  return child;
}

function shutdown(code: number): never {
  if (!shuttingDown) {
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) child.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
    }
  }
  process.exit(code);
}

function requestOk(target: string): Promise<boolean> {
  return new Promise((resolve) => {
    const client = target.startsWith('https:') ? https : http;
    const req = client.get(target, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.setTimeout(500, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitForUrl(target: string, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await requestOk(target)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${target}`);
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

const baseEnv = {
  ...process.env,
  ...tool.env,
};

const vite = npm(
  'npm',
  ['run', 'dev', '--workspace', tool.workspace, '--', '--host', host, '--port', String(tool.port), '--strictPort'],
  baseEnv,
);
vite.on('exit', (code, signal) => {
  if (!shuttingDown) {
    console.error(`[electron-tool] ${tool.workspace} dev server exited (${signal ?? code ?? 0})`);
    shutdown(code ?? 1);
  }
});

try {
  await waitForUrl(url);
} catch (error) {
  console.error(`[electron-tool] ${(error as Error).message}`);
  shutdown(1);
}

const electron = npm('npm', ['run', 'electron-harness'], {
  ...baseEnv,
  FLIGHT_ELECTRON_URL: url,
  FLIGHT_ELECTRON_TITLE: tool.title,
});

electron.on('exit', (code) => shutdown(code ?? 0));
