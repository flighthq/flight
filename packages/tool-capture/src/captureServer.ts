// Server lifecycle for a capture run: either a Vite dev server (on-demand transform), a lightweight
// Node.js static server over a pre-built dist (the default, faster), or an already-running external
// URL. Each resolves to a { url, kill } handle the capture loop drives pages against.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, relative } from 'node:path';

import type { Tool } from './captureEntries.js';

export interface Server {
  url: string;
  kill(): void;
}

/** Serves an already-built directory on an ephemeral localhost port for a capture suite. */
export function resolveCaptureDirectoryServer(directory: string): Promise<Server> {
  return serveDirectory(directory);
}

export function resolveServer(opts: { tool?: Tool; root: string; externalUrl?: string }): Promise<Server> {
  const { tool, root, externalUrl } = opts;

  if (externalUrl) {
    const url = externalUrl.replace(/\/$/, '');
    return Promise.resolve({ url, kill: () => {} });
  }

  if (tool === undefined) return Promise.reject(new Error('A built-in tool is required when no external URL is set'));

  const toolDir = tool === 'examples' ? join(root, 'examples', 'runners', 'web') : join(root, 'tools', tool);
  const viteJs = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const configPath = join(toolDir, 'vite.config.ts');

  // Run predev (asset download) before starting the server, mirroring what
  // npm run dev would do. npm_execpath is set by npm and points to the npm
  // CLI script; fall back to shell npm for direct tsx invocations.
  const toolPkg = JSON.parse(readFileSync(join(toolDir, 'package.json'), 'utf-8')) as {
    scripts?: Record<string, string>;
  };
  if (toolPkg.scripts?.predev) {
    const npmExecPath = process.env['npm_execpath'];
    const result = npmExecPath
      ? spawnSync(process.execPath, [npmExecPath, 'run', 'predev'], { cwd: toolDir, stdio: 'inherit' })
      : spawnSync('npm', ['run', 'predev'], { cwd: toolDir, stdio: 'inherit', shell: true });
    if (result.status !== 0) throw new Error(`predev failed for ${tool}`);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [viteJs, '--config', configPath], {
      cwd: toolDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let done = false;
    let output = '';

    const timeout = setTimeout(() => {
      if (!done) {
        proc.kill();
        reject(
          new Error(
            `Server did not start within 60s.\nCaptured output:\n${output}\n\n` +
              `Tip: start the server manually with "npm run ${DEV_SCRIPT[tool]}" ` +
              `and pass --url=http://localhost:5173`,
          ),
        );
      }
    }, 60_000);

    const scan = (chunk: Buffer): void => {
      output += chunk.toString();
      // eslint-disable-next-line no-control-regex -- ESC (0x1b) is required to strip ANSI color codes
      const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
      const match = clean.match(/localhost:(\d+)/);
      if (match && !done) {
        done = true;
        clearTimeout(timeout);
        resolve({ url: `http://localhost:${match[1]}`, kill: () => proc.kill('SIGTERM') });
      }
    };

    proc.stdout?.on('data', scan);
    proc.stderr?.on('data', scan);
    proc.on('error', reject);
  });
}

// Serve a pre-built tool dist from a lightweight Node.js HTTP server, bypassing the Vite dev
// server and its on-demand transform overhead. Auto-builds when dist is absent; pass forceBuild to
// always rebuild (e.g. for baseline captures that must be authoritative).
export function resolveStaticServer(opts: { tool: Tool; root: string; forceBuild?: boolean }): Promise<Server> {
  const { tool, root, forceBuild = false } = opts;

  const toolDir = tool === 'examples' ? join(root, 'examples', 'runners', 'web') : join(root, 'tools', tool);
  const distDir = join(toolDir, 'dist');

  if (!existsSync(distDir) || forceBuild) {
    console.log(`Building tools/${tool}…`);
    const npmExecPath = process.env['npm_execpath'];
    const workspace = tool === 'examples' ? '@flighthq/examples' : `tools/${tool}`;
    const args = ['run', 'build', `--workspace=${workspace}`];
    const result = npmExecPath
      ? spawnSync(process.execPath, [npmExecPath, ...args], {
          cwd: root,
          stdio: 'inherit',
        })
      : spawnSync('npm', args, {
          cwd: root,
          stdio: 'inherit',
          shell: true,
        });
    if (result.status !== 0) {
      return Promise.reject(new Error(`Build failed. Run "npm run build:${tool}" to debug.`));
    }
  }

  if (!existsSync(distDir)) {
    return Promise.reject(new Error(`No build found at ${distDir} after build. Run "npm run build:${tool}" to debug.`));
  }

  return serveDirectory(distDir);
}

function serveDirectory(directory: string): Promise<Server> {
  const MIME: Record<string, string> = {
    '.css': 'text/css',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.jsonl': 'text/plain; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.utf8': 'text/plain; charset=utf-8',
    '.wav': 'audio/wav',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  };

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      let urlPath = (req.url ?? '/').split('?')[0];
      if (urlPath.endsWith('/')) urlPath += 'index.html';

      const fsPath = join(directory, urlPath);
      if (relative(directory, fsPath).startsWith('..')) {
        res.writeHead(403);
        res.end();
        return;
      }

      if (!existsSync(fsPath)) {
        res.writeHead(404);
        res.end();
        return;
      }

      res.setHeader('Content-Type', MIME[extname(fsPath)] ?? 'application/octet-stream');
      res.end(readFileSync(fsPath));
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://localhost:${port}`, kill: () => server.close() });
    });
  });
}

// The root npm script that starts each tool's dev server, used in the manual-start tip. 'reference'
// runs its own dev server (flight-reference's Vite) via the reference-capture runner, not resolveServer,
// so its entry is only here to satisfy the Tool map.
const DEV_SCRIPT: Record<Tool, string> = {
  examples: 'dev:examples',
  functional: 'dev:functional',
  reference: 'dev:reference',
};
