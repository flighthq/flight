// Builds and assembles the GitHub Pages site from the standalone tools, each as its own Vite
// build under its own base path, merged into one directory for a single Pages artifact:
//
//   tools/site/              ← landing      (base <PAGES_BASE>)
//   tools/site/examples/     ← examples     (base <PAGES_BASE>examples/)
//   tools/site/functional/   ← functional   (base <PAGES_BASE>functional/)
//
// Usage:
//   PAGES_BASE=/ PAGES_CNAME=flighthq.ai tsx ./scripts/build-site.ts
//
// PAGES_BASE defaults to "/" (the custom-domain root, flighthq.ai) and must start and end with "/".
// Set it to "/<repo>/" only for a project-page deploy with no custom domain. Each tool's build reads
// VITE_BASE, so its emitted asset and script URLs resolve under its subpath.
//
// PAGES_CNAME, when set, is written to tools/site/CNAME so GitHub Pages serves the artifact under that
// custom domain. Leave it unset for project-page or local preview builds.
//
// A tool with no "build" script is skipped with a warning rather than failing the assembly — its
// route will 404 on the live site until a static build mode is added. (All three tools build today;
// the skip path remains for a future tool added before its static build mode exists.)

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { copyDirectoryContents } from './copy-dir';

interface SiteTool {
  name: string;
  // Workspace directory of the tool's package, relative to the repo root.
  dir: string;
  // Destination relative to the site root; "." places the tool at the site root.
  dest: string;
}

const root = process.cwd();
const pagesBase = process.env['PAGES_BASE'] ?? '/';
const siteDir = join(root, 'tools', 'site');

// Order matters only for readability: the root tool is listed first. Subpaths never collide.
const TOOLS: readonly SiteTool[] = [
  { name: 'landing', dir: 'apps/site/landing', dest: '.' },
  { name: 'examples', dir: 'examples/runners/web', dest: 'examples' },
  { name: 'functional', dir: 'tools/functional', dest: 'tests' },
];

function baseFor(dest: string): string {
  return dest === '.' ? pagesBase : `${pagesBase}${dest}/`;
}

function runToolBuild(workspace: string, base: string): boolean {
  const npmExecPath = process.env['npm_execpath'];
  const args = ['run', 'build', '--workspace', workspace];
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
    const toolDir = join(root, tool.dir);
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
    if (!runToolBuild(tool.dir, base)) {
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

  // Written last so a tool's dist copy (landing copies into the site root) can't clobber it. GitHub
  // Pages reads this CNAME from the artifact to serve the site under the custom domain.
  const cnameDomain = process.env['PAGES_CNAME'];
  if (cnameDomain) writeFileSync(join(siteDir, 'CNAME'), `${cnameDomain}\n`);

  console.log(
    `\n[build:site] assembled ${siteDir}\n` +
      `  base:    ${pagesBase}\n` +
      `  cname:   ${cnameDomain ?? 'none'}\n` +
      `  built:   ${built.join(', ') || 'none'}\n` +
      `  skipped: ${skipped.join(', ') || 'none'}`,
  );
}

main();
