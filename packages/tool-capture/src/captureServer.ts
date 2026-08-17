// Server lifecycle for a capture run: either a Vite dev server (on-demand transform), a lightweight
// Node.js static server over a pre-built dist (the default, faster), or an already-running external
// URL. Each resolves to a { url, kill } handle the capture loop drives pages against.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, extname, join, relative } from 'node:path';

import type { Tool } from './captureEntries.js';
import { discoverFunctionalScene3Ds } from './functionalScene3Ds.js';

export interface Server {
  url: string;
  kill(): void;
}

/**
 * Explains when a served build predates the newest source it was built from.
 *
 * Returns null when the build is at least as new as the source, so a fresh build stays silent.
 * Timestamps are millisecond epochs; a missing one (null) yields no verdict, since a comparison that
 * could not be made must not read as reassurance.
 */
export function explainCaptureDistStaleness(builtAt: number | null, sourceChangedAt: number | null): string | null {
  if (builtAt === null || sourceChangedAt === null || builtAt >= sourceChangedAt) return null;
  return (
    'The static build is older than the current source. This capture measures the PREVIOUS code, so a ' +
    'change under test will look like it had no effect.'
  );
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

  // Run predev (asset download) before starting the server, mirroring what npm run dev would do.
  const toolPkg = JSON.parse(readFileSync(join(toolDir, 'package.json'), 'utf-8')) as {
    scripts?: Record<string, string>;
  };
  if (toolPkg.scripts?.predev) {
    const result = runNpm(['run', 'predev'], toolDir);
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

function runNpm(args: readonly string[], cwd: string) {
  const npmExecPath = process.env['npm_execpath'];
  // `npx tsx ...` also sets npm_execpath, but to npx-cli.js. Passing `run build` back to that CLI asks
  // npx to install the unrelated `run` package. Only an actual npm CLI script is safe to reuse.
  if (npmExecPath !== undefined && basename(npmExecPath).toLowerCase() === 'npm-cli.js') {
    return spawnSync(process.execPath, [npmExecPath, ...args], { cwd, stdio: 'inherit' });
  }
  return spawnSync('npm', [...args], { cwd, stdio: 'inherit', shell: true });
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

// The root npm script that starts each tool's dev server, used in the manual-start tip.
const DEV_SCRIPT: Record<Tool, string> = {
  examples: 'dev:examples',
  functional: 'dev:functional',
};

// Serve a pre-built tool dist from a lightweight Node.js HTTP server, bypassing the Vite dev
// server and its on-demand transform overhead. Auto-builds when dist is absent; pass forceBuild to
// always rebuild (e.g. for baseline captures that must be authoritative).
export function resolveStaticServer(opts: { tool: Tool; root: string; forceBuild?: boolean }): Promise<Server> {
  const { tool, root, forceBuild = false } = opts;

  const toolDir = tool === 'examples' ? join(root, 'examples', 'runners', 'web') : join(root, 'tools', tool);
  const distDir = join(toolDir, 'dist');

  if (!existsSync(distDir) || forceBuild) {
    console.log(`Building tools/${tool}…`);
    const workspace = tool === 'examples' ? '@flighthq/examples' : `tools/${tool}`;
    const args = ['run', 'build', `--workspace=${workspace}`];
    const result = runNpm(args, root);
    if (result.status !== 0) {
      return Promise.reject(new Error(`Build failed. Run "npm run build:${tool}" to debug.`));
    }
  }

  if (!existsSync(distDir)) {
    return Promise.reject(new Error(`No build found at ${distDir} after build. Run "npm run build:${tool}" to debug.`));
  }

  if (tool === 'functional') {
    const { discovered, missing } = getMissingFunctionalCaptureRoutes(root, distDir);
    if (missing.length > 0) {
      return Promise.reject(
        new Error(
          `Functional dist is missing ${missing.length} of ${discovered.length} discovered routes, so it cannot serve the current suite. Run "npm run build:functional" and retry. Missing: ${missing.join(', ')}`,
        ),
      );
    }
  }

  // A capture served from a stale dist measures the code as it was BEFORE the edit under test, and
  // answers with the pre-change result — which reads as "the change had no effect" rather than as a
  // failure to observe it. That is the most persuasive wrong answer available, so say it out loud.
  // ★ DELIBERATELY WIDE: this fires on ANY capture-source edit, including a tool-capture change that
  // cannot affect the bundle, and costs an unnecessary rebuild when it does. That is the accepted price.
  // Narrowing it to "sources that actually reach the bundle" is how the defect it exists to prevent comes
  // back — a stale dist silently served 22 missing routes and cost the fleet most of a day, and every
  // narrowing is a new chance to mis-classify one source as irrelevant. Pay the rebuild.
  const staleness = explainCaptureDistStaleness(
    newestModifiedTime(distDir),
    newestCaptureSourceModifiedTime(tool, root),
  );
  if (staleness !== null) {
    return Promise.reject(new Error(`${staleness} Run "npm run build:${tool}" and retry.`));
  }

  return serveDirectory(distDir);
}

function getMissingFunctionalCaptureRoutes(root: string, distDir: string): { discovered: string[]; missing: string[] } {
  const scenes = discoverFunctionalScene3Ds(join(root, 'functional', 'scenes'));
  const discovered = scenes.flatMap((scene) => scene.renderers.map((renderer) => `tests/${scene.name}/${renderer}/`));
  return {
    discovered,
    missing: discovered.filter((route) => !existsSync(join(distDir, route, 'index.html'))),
  };
}

function newestCaptureSourceModifiedTime(tool: Tool, root: string): number | null {
  const sources =
    tool === 'functional'
      ? [
          join(root, 'packages'),
          join(root, 'functional', 'scenes'),
          join(root, 'tools', 'functional'),
          join(root, 'tools', 'harness'),
        ]
      : tool === 'examples'
        ? [join(root, 'packages'), join(root, 'examples', 'packages'), join(root, 'examples', 'runners', 'web')]
        : [];
  let newest: number | null = null;
  for (const source of sources) {
    const time = newestModifiedTime(source);
    if (time !== null && (newest === null || time > newest)) newest = time;
  }
  return newest;
}

/** Newest modification time under a directory tree, or null when it cannot be read. */
function newestModifiedTime(directory: string): number | null {
  try {
    const stats = statSync(directory);
    if (!stats.isDirectory()) return stats.mtimeMs;
  } catch {
    return null;
  }

  let newest: number | null = null;
  const walk = (current: string, depth: number): void => {
    if (depth > 6) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'dist' ||
        entry.name === 'dev-dist' ||
        entry.name.startsWith('.')
      )
        continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(path, depth + 1);
        continue;
      }
      try {
        const time = statSync(path).mtimeMs;
        if (newest === null || time > newest) newest = time;
      } catch {
        // A file that vanished mid-walk simply does not contribute a timestamp.
      }
    }
  };
  walk(directory, 0);
  return newest;
}
