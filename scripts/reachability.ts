import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';
import { Project } from 'ts-morph';

import type { ReachabilityAllowance, ReachabilityAudit, ReachabilityViolation } from './reachability-core';
import { auditReachability, collectEntryPointInventory } from './reachability-core';
import { getSelectors, selectPackages } from './select';

// Declared composition points belong on the cultivated public entry point. A genuinely internal one
// may remain contract-only/private only when named exactly here with its architectural reason. Exact
// package + source + symbol matching prevents a broad exemption from hiding a later declaration.
const ALLOW: ReachabilityAllowance[] = [
  {
    packageName: 'render',
    symbol: 'registerRenderCacheRenderer',
    source: 'packages/render/src/renderCache.ts',
    reason:
      'sibling-backend seam used only by each enable*RenderCache adapter; applications select the adapter, not its cache renderer',
  },
  {
    packageName: 'scene2d-canvas',
    symbol: 'defaultCanvasRenderCacheRenderer',
    source: 'packages/scene2d-canvas/src/canvasCache.ts',
    reason:
      'installed internally by enableCanvasRenderCache; the cache renderer is not an independently selectable leaf renderer',
  },
  {
    packageName: 'scene2d-dom',
    symbol: 'defaultDomRenderCacheRenderer',
    source: 'packages/scene2d-dom/src/domCache.ts',
    reason:
      'installed internally by enableDomRenderCache; the cache renderer is not an independently selectable leaf renderer',
  },
  {
    packageName: 'scene2d-gl',
    symbol: 'defaultGlRenderCacheRenderer',
    source: 'packages/scene2d-gl/src/glCache.ts',
    reason:
      'installed internally by enableGlRenderCache; the cache renderer is not an independently selectable leaf renderer',
  },
  {
    packageName: 'scene2d-wgpu',
    symbol: 'defaultWgpuRenderCacheRenderer',
    source: 'packages/scene2d-wgpu/src/wgpuCache.ts',
    reason:
      'installed internally by enableWgpuRenderCache; the cache renderer is not an independently selectable leaf renderer',
  },
];

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const root = join(scriptsDir, '..');
const checkMode = process.argv.includes('--check');
const jsonMode = process.argv.includes('--json');
const selected = selectPackages(getSelectors());

const project = new Project({
  tsConfigFilePath: join(root, 'tsconfig.base.json'),
  skipAddingFilesFromTsConfig: true,
});
for (const name of selected) project.addSourceFilesAtPaths(join(root, 'packages', name, 'src', '**', '*.ts'));

const reports: ReachabilityAudit[] = [];
for (const name of selected) {
  const sourceDir = join(root, 'packages', name, 'src');
  const index = project.getSourceFile(join(sourceDir, 'index.ts'));
  if (index === undefined) continue;
  const contract = project.getSourceFile(join(sourceDir, 'contract.ts'));
  const inventory = collectEntryPointInventory(index, contract);
  const sourceFiles = project.getSourceFiles().filter((sourceFile) => {
    const rel = relative(sourceDir, sourceFile.getFilePath()).replaceAll('\\', '/');
    return !rel.startsWith('../') && rel !== 'index.ts' && rel !== 'contract.ts' && !rel.endsWith('.test.ts');
  });
  reports.push(
    auditReachability({
      packageName: name,
      sourceFiles,
      publicNames: inventory.publicNames,
      contractNames: inventory.contractNames,
      relativePath: (sourceFile) => relative(root, sourceFile.getFilePath()).replaceAll('\\', '/'),
      allowances: ALLOW,
    }),
  );
}

const candidates = reports.reduce((count, report) => count + report.candidates, 0);
const allowed = reports.flatMap((report) => report.allowed);
const violations = reports.flatMap((report) => report.violations).sort(compareViolation);
const staleAllowances = reports.flatMap((report) => report.staleAllowances);
const missingPackageAllowances = ALLOW.filter((entry) => !selected.includes(entry.packageName));
if (getSelectors().length === 0) staleAllowances.push(...missingPackageAllowances);
const passed = violations.length === 0 && staleAllowances.length === 0;

if (jsonMode) {
  console.log(JSON.stringify({ passed, candidates, allowed, violations, staleAllowances }, null, 2));
  process.exit(!passed && checkMode ? 1 : 0);
}

if (passed) {
  console.log(
    `${pc.green('OK')} ${pc.bold('Declared composition points are publicly reachable')} ${pc.dim(`(${candidates} candidates, ${allowed.length} named internal${allowed.length === 1 ? '' : 's'} allow-listed)`)}`,
  );
  process.exit(0);
}

if (violations.length > 0) {
  console.log(
    `${pc.yellow('!')} ${pc.bold(`${violations.length} declared composition point${violations.length === 1 ? '' : 's'} cannot be imported from the package root`)}\n`,
  );
  for (const violation of violations) {
    console.log(
      `  ${pc.yellow('!')} ${pc.white(`${violation.source}:${violation.line}`)} ${pc.bold(violation.symbol)} ${pc.dim(`(${violation.kind}, ${violation.lane})`)}`,
    );
  }
}
if (staleAllowances.length > 0) {
  console.log(
    `\n${pc.yellow('!')} ${pc.bold(`${staleAllowances.length} stale reachability allowance${staleAllowances.length === 1 ? '' : 's'}`)}`,
  );
  for (const allowance of staleAllowances) {
    console.log(
      `  ${pc.yellow('!')} ${allowance.source} ${pc.bold(allowance.symbol)} ${pc.dim(`(${allowance.reason})`)}`,
    );
  }
}
console.log(
  `\n${pc.dim('Promote composition points through src/index.ts. A deliberately internal exception must be exact and reasoned in scripts/reachability.ts ALLOW.')}`,
);
process.exit(!passed && checkMode ? 1 : 0);

function compareViolation(a: ReachabilityViolation, b: ReachabilityViolation): number {
  return a.source.localeCompare(b.source) || a.line - b.line || a.symbol.localeCompare(b.symbol);
}
