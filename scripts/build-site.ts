// Builds and assembles the GitHub Pages site from the standalone tools, each as its own Vite
// build under its own base path, merged into one directory for a single Pages artifact:
//
//   tools/site/              ← landing      (base <PAGES_BASE>)
//   tools/site/explorer/     ← explorer     (base <PAGES_BASE>explorer/)
//   tools/site/functional/   ← functional   (base <PAGES_BASE>functional/)
//
// Usage:
//   PAGES_BASE=/flight/ tsx ./scripts/build-site.ts
//
// PAGES_BASE defaults to "/flight/" (the project's Pages path) and must start and end with "/".
// Each tool's build reads VITE_BASE, so its emitted asset and script URLs resolve under its subpath.
// A tool with no "build" script is skipped with a warning rather than failing the assembly — its
// route will 404 on the live site until a static build mode is added. (All three tools build today;
// the skip path remains for a future tool added before its static build mode exists.)

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { copyDirectoryContents } from './copy-dir';

interface SiteTool {
  name: string;
  // Destination relative to the site root; "." places the tool at the site root.
  dest: string;
}

const root = process.cwd();
const pagesBase = process.env['PAGES_BASE'] ?? '/flight/';
const siteDir = join(root, 'tools', 'site');

// Order matters only for readability: the root tool is listed first. Subpaths never collide.
const TOOLS: readonly SiteTool[] = [
  { name: 'landing', dest: '.' },
  { name: 'explorer', dest: 'examples' },
  { name: 'functional', dest: 'tests' },
];

function baseFor(dest: string): string {
  return dest === '.' ? pagesBase : `${pagesBase}${dest}/`;
}

function runToolBuild(name: string, base: string): boolean {
  const npmExecPath = process.env['npm_execpath'];
  const args = ['run', 'build', '--workspace', `tools/${name}`];
  const env = { ...process.env, VITE_BASE: base };
  const result = npmExecPath
    ? spawnSync(process.execPath, [npmExecPath, ...args], { cwd: root, stdio: 'inherit', env })
    : spawnSync('npm', args, { cwd: root, stdio: 'inherit', env, shell: true });
  return result.status === 0;
}

function main(): void {
  if (!pagesBase.startsWith('/') || !pagesBase.endsWith('/')) {
    console.error(`[build:site] PAGES_BASE must start and end with "/": got "${pagesBase}"`);
    process.exit(1);
  }

  rmSync(siteDir, { recursive: true, force: true });
  mkdirSync(siteDir, { recursive: true });

  const built: string[] = [];
  const skipped: string[] = [];

  for (const tool of TOOLS) {
    const toolDir = join(root, 'tools', tool.name);
    const pkg = JSON.parse(readFileSync(join(toolDir, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    if (!pkg.scripts?.build) {
      skipped.push(tool.name);
      console.warn(
        `[build:site] ${tool.name} has no "build" script — skipping. ` +
          `Its route (${baseFor(tool.dest)}) will 404 until a static build mode is added.`,
      );
      continue;
    }

    const base = baseFor(tool.dest);
    console.log(`[build:site] building ${tool.name}  base=${base}`);
    if (!runToolBuild(tool.name, base)) {
      console.error(`[build:site] ${tool.name} build failed`);
      process.exit(1);
    }

    const dist = join(toolDir, 'dist');
    if (!existsSync(dist)) {
      console.error(`[build:site] ${tool.name} produced no dist/ at ${dist}`);
      process.exit(1);
    }

    const target = tool.dest === '.' ? siteDir : join(siteDir, tool.dest);
    copyDirectoryContents(dist, target);
    built.push(tool.name);
  }

  console.log(
    `\n[build:site] assembled ${siteDir}\n` +
      `  base:    ${pagesBase}\n` +
      `  built:   ${built.join(', ') || 'none'}\n` +
      `  skipped: ${skipped.join(', ') || 'none'}`,
  );
}

main();
