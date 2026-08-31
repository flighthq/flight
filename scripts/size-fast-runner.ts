import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

import * as esbuild from 'esbuild';

import type { SizeCase } from './size-runner';
import { getSizeCaseKey } from './size-runner';
import { workspacePackages } from './workspaces';

export interface FastSize {
  /** Bytes of the tree-shaken, unminified bundle as emitted. */
  raw: number;
  /** Those same bytes gzipped — the unit the baseline pins and the report prints. */
  gzip: number;
}

export interface FastSizeMeasurement {
  /** Tree-shaken, UNMINIFIED sizes keyed by size-case key. */
  sizes: Record<string, FastSize>;
  /** What tree this measured: a commit SHA, or a content hash when the tree is dirty. */
  treeId: string;
}

export interface FastSizeDelta {
  key: string;
  before: number | null;
  after: number | null;
  deltaBytes: number;
  deltaPercent: number | null;
}

/**
 * Cases are grouped into one esbuild invocation per distinct build configuration.
 * esbuild parses each input once per invocation no matter how many entry points
 * reach it, and the fixtures reach many of the same source modules — so grouping
 * is what removes the redundant parsing, not any per-case cleverness.
 *
 * The grouping axes mirror buildSample's per-case flags, which are build-wide in
 * esbuild and therefore cannot share an invocation: the renderer (the ./render
 * alias target), whether enableFlightDiagnostics is stubbed, and whether console
 * survives.
 */
export function getFastSizeGroupKey(sizeCase: Readonly<SizeCase>): string {
  const diagnostics = sizeCase.variant === FLIGHT_DIAGNOSTICS_VARIANT;
  const preserveConsole = diagnostics || basename(sizeCase.root) === LOG_CONSOLE_SAMPLE;
  return `${sizeCase.render}|${diagnostics ? 'diagnostics' : 'stubbed'}|${preserveConsole ? 'console' : 'dropped'}`;
}

export function groupFastSizeCases(cases: readonly Readonly<SizeCase>[]): Map<string, Readonly<SizeCase>[]> {
  const groups = new Map<string, Readonly<SizeCase>[]>();
  for (const sizeCase of cases) {
    const key = getFastSizeGroupKey(sizeCase);
    const group = groups.get(key);
    if (group) group.push(sizeCase);
    else groups.set(key, [sizeCase]);
  }
  return groups;
}

export function createFlightResolvePlugin(render: string, stubDiagnostics: boolean): esbuild.Plugin {
  const aliases = workspacePackages.map((pkg) => ({ name: pkg.name, dir: resolve(pkg.dir, 'src') }));

  return {
    name: 'flight-resolve',
    setup(build) {
      build.onResolve({ filter: /^@flighthq\// }, (args) => {
        const alias = aliases.find((entry) => args.path === entry.name || args.path.startsWith(`${entry.name}/`));
        if (!alias) return null;
        const subpath = args.path.slice(alias.name.length);
        return { path: subpath ? `${resolve(alias.dir, subpath.slice(1))}.ts` : resolve(alias.dir, 'index.ts') };
      });

      build.onResolve({ filter: /^\.\/render$/ }, (args) => ({
        path: resolve(dirname(args.importer), `render.${render}.ts`),
      }));

      build.onLoad({ filter: /\.ts$/ }, (args) => {
        const source = readFileSync(args.path, 'utf-8');
        if (!stubDiagnostics || !SIZE_RENDER_SOURCE.test(args.path)) return { contents: source, loader: 'ts' };
        return { contents: stubFlightDiagnostics(source), loader: 'ts' };
      });
    },
  };
}

export function stubFlightDiagnostics(source: string): string {
  if (!source.includes('enableFlightDiagnostics(')) return source;
  return source.replace(
    /\benableFlightDiagnostics\(([\s\S]*?)\n?\);/g,
    (_statement, state: string) => `void (${state.replace(/,\s*$/, '')});`,
  );
}

/**
 * Measures tree-shaken, unminified gzip size for every case, in one esbuild
 * invocation per group.
 *
 * Unminified on purpose. This number answers "how much code did this keep",
 * which is a tree-shaking question, and esbuild and Rollup agree on it far more
 * closely than their minifiers agree with each other. It is NOT a shipping size
 * and must never be reported as one — `npm run size:minified` owns that claim.
 */
export async function measureFastSizes(cases: readonly Readonly<SizeCase>[]): Promise<Record<string, FastSize>> {
  const sizes: Record<string, FastSize> = {};

  for (const [groupKey, groupCases] of groupFastSizeCases(cases)) {
    const [render, diagnostics, consoleMode] = groupKey.split('|');
    const result = await esbuild.build({
      entryPoints: groupCases.map((sizeCase, index) => ({
        in: resolve(sizeCase.root, 'src/app.ts'),
        out: `${FAST_SIZE_ENTRY_PREFIX}${index}`,
      })),
      bundle: true,
      minify: false,
      treeShaking: true,
      format: 'esm',
      target: 'esnext',
      outdir: 'flight-size-fast',
      splitting: false,
      write: false,
      drop: consoleMode === 'console' ? ['debugger'] : ['console', 'debugger'],
      logLevel: 'silent',
      plugins: [createFlightResolvePlugin(render, diagnostics === 'stubbed')],
    });

    for (const file of result.outputFiles) {
      const match = new RegExp(`${FAST_SIZE_ENTRY_PREFIX}(\\d+)\\.js$`).exec(file.path);
      if (!match) continue;
      sizes[getSizeCaseKey(groupCases[Number(match[1])])] = {
        raw: file.contents.byteLength,
        gzip: gzipSync(file.text).length,
      };
    }
  }

  return sizes;
}

/**
 * Projects a measurement onto one unit, so a comparison is always between two
 * plain byte maps and cannot accidentally put raw bytes on one side and gzipped
 * bytes on the other.
 */
export function selectFastSizeUnit(
  sizes: Readonly<Record<string, Readonly<FastSize>>>,
  unit: keyof FastSize,
): Record<string, number> {
  const selected: Record<string, number> = {};
  for (const [key, size] of Object.entries(sizes)) selected[key] = size[unit];
  return selected;
}

export function compareFastSizes(
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
): FastSizeDelta[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

  return keys.map((key) => {
    const beforeSize = before[key] ?? null;
    const afterSize = after[key] ?? null;
    const deltaBytes = (afterSize ?? 0) - (beforeSize ?? 0);
    const deltaPercent = beforeSize !== null && afterSize !== null ? (deltaBytes / beforeSize) * 100 : null;
    return { key, before: beforeSize, after: afterSize, deltaBytes, deltaPercent };
  });
}

/**
 * A delta this small is treated as noise rather than a finding.
 *
 * The pipeline is not byte-exact across runs: measuring an unchanged tree twice
 * moved individual cases by up to 10 bytes. The floor is 3x that largest
 * observed drift, and the percentage takes over once a bundle is big enough for
 * 32 bytes to be within its own drift.
 *
 * Both sit far below what this exists to catch. The signal is a function that
 * used to tree-shake out and now does not, which costs hundreds to thousands of
 * bytes — so the band buys quiet on unchanged trees at no cost to detection.
 */
export function getFastSizeNoiseThreshold(before: number): number {
  return Math.max(FAST_SIZE_NOISE_BYTES, (before * FAST_SIZE_NOISE_PERCENT) / 100);
}

export function isFastSizeNoise(delta: Readonly<FastSizeDelta>): boolean {
  // A case that appeared or disappeared is never noise, however few bytes it is.
  if (delta.before === null || delta.after === null) return false;
  return Math.abs(delta.deltaBytes) < getFastSizeNoiseThreshold(delta.before);
}

export function getChangedFastSizes(deltas: readonly Readonly<FastSizeDelta>[]): FastSizeDelta[] {
  return deltas.filter((delta) => delta.deltaBytes !== 0 && !isFastSizeNoise(delta));
}

export function readFastSizeCache(cacheDir: string, treeId: string): Record<string, FastSize> | null {
  const path = resolve(cacheDir, `${treeId}.json`);
  if (!existsSync(path)) return null;
  return (JSON.parse(readFileSync(path, 'utf-8')) as FastSizeMeasurement).sizes;
}

export function readFastSizeBaseline(baselineFile: string): Record<string, number> {
  if (!existsSync(baselineFile)) return {};
  return JSON.parse(readFileSync(baselineFile, 'utf-8')) as Record<string, number>;
}

/**
 * Writes one key per line. The per-key provenance the size report shows comes
 * from `git blame --line-porcelain` over this file, which can only attribute a
 * key to a commit while that key occupies its own line — so the formatting here
 * is load-bearing, not cosmetic, and rules out nesting more than one number
 * under a key.
 */
export function writeFastSizeBaseline(baselineFile: string, sizes: Readonly<Record<string, number>>): void {
  const lines = Object.entries(sizes).map(([key, size]) => `  ${JSON.stringify(key)}: ${size}`);
  writeFileSync(baselineFile, `{\n${lines.join(',\n')}\n}\n`);
}

export function writeFastSizeCache(cacheDir: string, measurement: Readonly<FastSizeMeasurement>): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(resolve(cacheDir, `${measurement.treeId}.json`), `${JSON.stringify(measurement, null, 2)}\n`);
}

export function hashFastSizeTree(entries: readonly string[]): string {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort()) hash.update(entry).update('\0');
  return hash.digest('hex').slice(0, 16);
}

const FAST_SIZE_ENTRY_PREFIX = 'fast-size-case-';
const FAST_SIZE_NOISE_BYTES = 32;
const FAST_SIZE_NOISE_PERCENT = 0.25;
const FLIGHT_DIAGNOSTICS_VARIANT = 'diagnostics';
const LOG_CONSOLE_SAMPLE = 'log-console';
const SIZE_RENDER_SOURCE = /[\\/]src[\\/]render\.(?:dom|canvas|webgl|webgpu)\.ts(?:$|\?)/;
