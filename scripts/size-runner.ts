import { spawnSync } from 'node:child_process';

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { availableParallelism } from 'os';
import { basename, relative, resolve } from 'path';
import { build, mergeConfig } from 'vite';
import { gzipSync } from 'zlib';

import { createSizeDebugStub } from './size-debug-stub';
import { createBaseConfig } from './vite-base';

export const RENDERERS = ['dom', 'canvas', 'webgl', 'webgpu'] as const;
export type Render = (typeof RENDERERS)[number];

export interface SizeCase {
  name: string;
  render: Render;
  root: string;
  variant: string | null;
}

export interface SizeResult {
  name: string;
  render: Render;
  variant: string | null;
  gzipSize: number;
  gzipKB: string;
  baselineCommit: string | null;
  baselineCommitDate: string | null;
  baselineKB: number | null;
  baselineKBStr: string | null;
  delta: string | null;
  passed: boolean;
  threshold: number | null;
  key: string;
}

export interface SizeBaselineOrigin {
  commit: string | null;
  commitDate: string | null;
}

export interface RunSizeOptions {
  root?: string;
  fixturesDir?: string;
  baselineFile?: string;
  updateBaseline?: boolean;
  caseFilters?: string[];
  onResult?: (result: Readonly<SizeResult>) => void;
  renderFilters?: string[];
}

export function parseFilter(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.toLowerCase());
}

export function collectSizeCases(
  fixturesDir: string,
  caseFilters: string[] = [],
  renderFilters: string[] = [],
): SizeCase[] {
  return existsSync(fixturesDir) ? collectSizeCasesFromDirectory(fixturesDir, caseFilters, renderFilters) : [];
}

function collectSizeCasesFromDirectory(directory: string, caseFilters: string[], renderFilters: string[]): SizeCase[] {
  const cases = readdirSync(directory, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(directory, d.name, 'package.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(({ name: directoryName }) => {
      const root = resolve(directory, directoryName);
      const metadata = readSizeFixtureMetadata(root);
      const name = metadata?.name ?? directoryName;
      const variant = metadata?.variant ?? null;
      return RENDERERS.filter((render) => existsSync(resolve(root, `src/render.${render}.ts`)))
        .map((render) => ({ name, render, root, variant }))
        .filter((tc) => {
          const normalizedName = `${tc.name}${tc.variant === null ? '' : `:${tc.variant}`}`.toLowerCase();
          const normalizedRender = tc.render.toLowerCase();
          const caseMatches = caseFilters.length === 0 || caseFilters.some((query) => normalizedName.includes(query));
          const renderMatches =
            renderFilters.length === 0 || renderFilters.some((query) => normalizedRender.includes(query));
          return caseMatches && renderMatches;
        });
    });
  return cases.sort((a, b) => {
    const nameOrder = a.name.localeCompare(b.name);
    if (nameOrder !== 0) return nameOrder;
    const renderOrder = RENDERERS.indexOf(a.render) - RENDERERS.indexOf(b.render);
    if (renderOrder !== 0) return renderOrder;
    if (a.variant === null) return b.variant === null ? 0 : -1;
    if (b.variant === null) return 1;
    return a.variant.localeCompare(b.variant);
  });
}

function readSizeFixtureMetadata(root: string): { name: string; variant?: string } | null {
  const contents = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as {
    flightSize?: { name?: unknown; variant?: unknown };
  };
  const name = contents.flightSize?.name;
  const variant = contents.flightSize?.variant;
  if (typeof name !== 'string' || name.length === 0) return null;
  return typeof variant === 'string' && variant.length !== 0 ? { name, variant } : { name };
}

export function readBaseline(baselineFile: string): Record<string, number> {
  if (!existsSync(baselineFile)) return {};
  return JSON.parse(readFileSync(baselineFile, 'utf-8')) as Record<string, number>;
}

export function writeBaseline(baselineFile: string, pendingBaseline: Record<string, number>): void {
  writeFileSync(baselineFile, JSON.stringify(pendingBaseline, null, 2) + '\n');
}

export async function buildSample(
  root: string,
  render: Render,
  pruneSdkImports = false,
  variant: string | null = null,
): Promise<string> {
  const sampleName = basename(root);
  const diagnosticsEnabled = variant === FLIGHT_DIAGNOSTICS_VARIANT;
  const preserveConsole = diagnosticsEnabled || sampleName === 'log-console';
  const plugins = [
    createSizeDebugStub(!diagnosticsEnabled),
    ...(pruneSdkImports ? [(await import('./size-import-pruner')).createSizeImportPruner()] : []),
  ];
  const result = await build(
    mergeConfig(createBaseConfig('production', render), {
      root,
      configFile: false,
      plugins,
      esbuild: {
        drop: preserveConsole ? ['debugger'] : ['console', 'debugger'],
      },
      build: {
        cssCodeSplit: false,
        minify: 'terser',
        modulePreload: false,
        sourcemap: false,
        target: 'esnext',
        write: false,
        rollupOptions: {
          output: {
            manualChunks: undefined,
          },
        },
        terserOptions: {
          compress: {
            arrows: true,
            drop_console: !preserveConsole,
            drop_debugger: true,
            inline: true,
            passes: 3,
            pure_getters: 'strict',
            reduce_vars: true,
            unsafe: true,
            unsafe_arrows: true,
          },
          ecma: 2020,
          format: {
            comments: false,
          },
          mangle: {
            properties: true,
          },
          module: true,
          toplevel: true,
        },
      },
      logLevel: 'silent',
    }),
  );

  type BuildOutputFile = { fileName: string; code?: string };
  const output = (result as unknown as { output?: BuildOutputFile[] }).output ?? [];
  const jsFiles = output.filter((f) => f.fileName.endsWith('.js'));
  if (jsFiles.length === 0) throw new Error(`No JS output found for ${root}`);

  const mainChunk = jsFiles.find((f) => f.fileName.includes('main')) || jsFiles[0];
  if (!mainChunk.code) throw new Error(`No code found in main chunk for ${root}`);
  return mainChunk.code;
}

export async function buildSamples(
  cases: Readonly<SizeCase>[],
  onBuilt?: (index: number, code: string) => void,
): Promise<string[]> {
  const codeByCase = new Array<string>(cases.length);
  let nextIndex = 0;
  const pruneSdkImports = cases.length >= MIN_PRUNED_BUILD_COUNT;
  const workerCount = Math.min(cases.length, Math.max(1, Math.min(availableParallelism(), MAX_PARALLEL_BUILDS)));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < cases.length) {
        const index = nextIndex++;
        const sizeCase = cases[index];
        const code = await buildSample(sizeCase.root, sizeCase.render, pruneSdkImports, sizeCase.variant);
        codeByCase[index] = code;
        onBuilt?.(index, code);
      }
    }),
  );

  return codeByCase;
}

export function getGzipSize(code: string): number {
  return gzipSync(code).length;
}

export function parseSizeBaselineOrigins(blame: string): Record<string, SizeBaselineOrigin> {
  const origins: Record<string, SizeBaselineOrigin> = {};
  let commit: string | null = null;
  let authorTime: number | null = null;
  let authorTimezoneOffset: number | null = null;

  for (const line of blame.split('\n')) {
    const header = /^([0-9a-f]{40}) \d+ \d+(?: \d+)?$/.exec(line);
    if (header) {
      commit = /^0+$/.test(header[1]) ? null : header[1];
      authorTime = null;
      authorTimezoneOffset = null;
      continue;
    }

    if (line.startsWith('author-time ')) {
      const seconds = Number.parseInt(line.slice('author-time '.length), 10);
      authorTime = Number.isFinite(seconds) ? seconds : null;
      continue;
    }

    if (line.startsWith('author-tz ')) {
      const match = /^([+-])(\d{2})(\d{2})$/.exec(line.slice('author-tz '.length));
      if (match) {
        const magnitude = Number.parseInt(match[2], 10) * 60 + Number.parseInt(match[3], 10);
        authorTimezoneOffset = (match[1] === '-' ? -1 : 1) * magnitude * 60;
      }
      continue;
    }

    if (!line.startsWith('\t')) continue;
    const key = /^\s*"([^"]+)":/.exec(line.slice(1))?.[1];
    if (key !== undefined) {
      const commitDate =
        commit === null || authorTime === null
          ? null
          : new Date((authorTime + (authorTimezoneOffset ?? 0)) * 1000).toISOString().slice(0, 10);
      origins[key] = { commit, commitDate };
    }
  }

  return origins;
}

export function readSizeBaselineOrigins(root: string, baselineFile: string): Record<string, SizeBaselineOrigin> {
  const result = spawnSync('git', ['blame', '--line-porcelain', '--', relative(root, baselineFile)], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) return {};
  return parseSizeBaselineOrigins(result.stdout);
}

export function getFlightDiagnosticsSizeDelta(results: readonly Readonly<SizeResult>[]): number | null {
  const release = results.find((result) => result.key === FLIGHT_DIAGNOSTICS_BASE_KEY);
  const enabled = results.find(
    (result) => result.key === `${FLIGHT_DIAGNOSTICS_BASE_KEY}:${FLIGHT_DIAGNOSTICS_VARIANT}`,
  );
  return release === undefined || enabled === undefined ? null : enabled.gzipSize - release.gzipSize;
}

export function getSizeCaseKey(sizeCase: Readonly<Pick<SizeCase, 'name' | 'render' | 'variant'>>): string {
  const baseKey = `${sizeCase.name}:${sizeCase.render}`;
  return sizeCase.variant === null ? baseKey : `${baseKey}:${sizeCase.variant}`;
}

export function formatSizeResult(
  gzipSize: number,
  baselineSize: number | null,
): {
  gzipKB: string;
  baselineKB: number | null;
  baselineKBStr: string | null;
  delta: string | null;
  passed: boolean;
  threshold: number | null;
} {
  const gzipKB = (gzipSize / 1024).toFixed(2);
  const baselineKB = baselineSize != null ? baselineSize / 1024 : null;
  const baselineKBStr = baselineKB != null ? baselineKB.toFixed(2) : null;
  const rawDelta = baselineSize != null ? (((gzipSize - baselineSize) / baselineSize) * 100).toFixed(1) : null;
  const delta = rawDelta != null ? (parseFloat(rawDelta) >= 0 ? `+${rawDelta}%` : `${rawDelta}%`) : null;
  const threshold = baselineSize != null ? Math.ceil(baselineSize * 1.05) : null;
  const passed = threshold !== null && gzipSize < threshold;

  return { gzipKB, baselineKB, baselineKBStr, delta, passed, threshold };
}

export function didSizeChecksPass(results: readonly Readonly<Pick<SizeResult, 'passed'>>[]): boolean {
  return results.length > 0 && results.every((result) => result.passed);
}

export async function runSizeChecks({
  root = process.cwd(),
  fixturesDir = resolve(root, 'tools', 'size', 'fixtures'),
  baselineFile = resolve(root, 'tools', 'size', 'size.baseline.json'),
  updateBaseline = false,
  caseFilters = [],
  onResult,
  renderFilters = [],
}: RunSizeOptions): Promise<{ results: SizeResult[]; pendingBaseline: Record<string, number>; baselineFile: string }> {
  const cases = collectSizeCases(fixturesDir, caseFilters, renderFilters);
  const baseline = readBaseline(baselineFile);
  const baselineOrigins = readSizeBaselineOrigins(root, baselineFile);
  const pendingBaseline = { ...baseline };

  const results = new Array<SizeResult>(cases.length);
  let nextResultIndex = 0;
  await buildSamples(cases, (index, code) => {
    const { name, render, variant } = cases[index];
    const gzipSize = getGzipSize(code);
    const key = getSizeCaseKey(cases[index]);
    const baselineSize = baseline[key] ?? null;
    const baselineOrigin = baselineOrigins[key];
    const { gzipKB, baselineKB, baselineKBStr, delta, passed, threshold } = formatSizeResult(gzipSize, baselineSize);

    const adjustedPassed = updateBaseline || passed;
    pendingBaseline[key] = gzipSize;
    const result = {
      name,
      render,
      variant,
      gzipSize,
      gzipKB,
      baselineCommit: baselineOrigin?.commit ?? null,
      baselineCommitDate: baselineOrigin?.commitDate ?? null,
      baselineKB,
      baselineKBStr,
      delta,
      passed: adjustedPassed,
      threshold,
      key,
    };
    results[index] = result;
    while (results[nextResultIndex]) {
      onResult?.(results[nextResultIndex]);
      nextResultIndex++;
    }
  });

  return { results, pendingBaseline, baselineFile };
}

const MAX_PARALLEL_BUILDS = 2;
const FLIGHT_DIAGNOSTICS_BASE_KEY = 'flight-diagnostics:canvas';
const FLIGHT_DIAGNOSTICS_VARIANT = 'diagnostics';
// Building only one or two filtered cases is faster than initializing the SDK export map.
const MIN_PRUNED_BUILD_COUNT = 3;
