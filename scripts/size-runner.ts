import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { build } from 'vite';
import { gzipSync } from 'zlib';

export const RENDERERS = ['dom', 'canvas', 'webgl'] as const;
export type Render = (typeof RENDERERS)[number];

export interface SizeCase {
  name: string;
  render: Render;
  root: string;
}

export interface SizeResult {
  name: string;
  render: Render;
  gzipSize: number;
  gzipKB: string;
  baselineKB: number | null;
  baselineKBStr: string | null;
  delta: string | null;
  passed: boolean;
  threshold: number | null;
  key: string;
}

export interface RunSizeOptions {
  root?: string;
  examplesDir?: string;
  baselineFile?: string;
  updateBaseline?: boolean;
  exampleFilters?: string[];
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
  examplesDir: string,
  exampleFilters: string[] = [],
  renderFilters: string[] = [],
): SizeCase[] {
  return readdirSync(examplesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(resolve(examplesDir, d.name, 'package.json')))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(({ name }) =>
      RENDERERS.filter((render) => existsSync(resolve(examplesDir, name, `src/render.${render}.ts`)))
        .map((render) => ({ name, render, root: resolve(examplesDir, name) as SizeCase['root'] }))
        .filter((tc) => {
          const normalizedName = tc.name.toLowerCase();
          const normalizedRender = tc.render.toLowerCase();
          const exampleMatches = exampleFilters.length === 0 || exampleFilters.some((query) => normalizedName.includes(query));
          const renderMatches = renderFilters.length === 0 || renderFilters.some((query) => normalizedRender.includes(query));
          return exampleMatches && renderMatches;
        }),
    );
}

export function readBaseline(baselineFile: string): Record<string, number> {
  if (!existsSync(baselineFile)) return {};
  return JSON.parse(readFileSync(baselineFile, 'utf-8')) as Record<string, number>;
}

export function writeBaseline(baselineFile: string, pendingBaseline: Record<string, number>): void {
  writeFileSync(baselineFile, JSON.stringify(pendingBaseline, null, 2) + '\n');
}

export async function buildSample(root: string, render: Render): Promise<string> {
  const prev = process.env.RENDER;
  process.env.RENDER = render;

  try {
    const result = await build({
      root,
      configFile: resolve(root, 'vite.config.ts'),
      build: {
        write: true,
        emptyOutDir: true,
        outDir: resolve(root, 'dist'),
      },
      logLevel: 'silent',
    });

    const jsFiles = (result as any).output.filter((f: any) => f.fileName.endsWith('.js'));
    if (jsFiles.length === 0) throw new Error(`No JS output found for ${root}`);

    const mainChunk = jsFiles.find((f: any) => f.fileName.includes('main')) || jsFiles[0];
    return mainChunk.code;
  } finally {
    if (prev === undefined) {
      delete process.env.RENDER;
    } else {
      process.env.RENDER = prev;
    }
  }
}

export function getGzipSize(code: string): number {
  return gzipSync(code).length;
}

export function formatSizeResult(gzipSize: number, baselineSize: number | null): {
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
  const passed = threshold == null || gzipSize < threshold;

  return { gzipKB, baselineKB, baselineKBStr, delta, passed, threshold };
}

export async function runSizeChecks({
  root = process.cwd(),
  examplesDir = resolve(root, 'examples'),
  baselineFile = resolve(root, 'tests', 'size', 'size.baseline.json'),
  updateBaseline = false,
  exampleFilters = [],
  renderFilters = [],
}: RunSizeOptions): Promise<{ results: SizeResult[]; pendingBaseline: Record<string, number>; baselineFile: string }> {
  const cases = collectSizeCases(examplesDir, exampleFilters, renderFilters);
  const baseline = readBaseline(baselineFile);
  const pendingBaseline = { ...baseline };

  const results: SizeResult[] = [];

  for (const { name, render, root: exampleRoot } of cases) {
    const code = await buildSample(exampleRoot, render);
    const gzipSize = getGzipSize(code);
    const key = `${name}:${render}`;
    const baselineSize = baseline[key] ?? null;
    const { gzipKB, baselineKB, baselineKBStr, delta, passed, threshold } = formatSizeResult(gzipSize, baselineSize);

    pendingBaseline[key] = gzipSize;
    results.push({ name, render, gzipSize, gzipKB, baselineKB, baselineKBStr, delta, passed, threshold, key });
  }

  return { results, pendingBaseline, baselineFile };
}
