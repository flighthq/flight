import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import type { OutputChunk, RollupOutput } from 'rollup';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'zlib';

const ROOT = resolve(__dirname, '../../..');
const EVIDENCE_DIR = resolve(__dirname, '../evidence');

interface CapabilityEntry {
  readonly fixture: string;
  readonly modulePattern: string;
}

const CAPABILITIES: readonly CapabilityEntry[] = [
  { fixture: 'cursor', modulePattern: 'webCursor' },
  { fixture: 'glyph', modulePattern: 'webGlyphRasterizer' },
  { fixture: 'loop', modulePattern: 'webLoop' },
];

interface FixtureResult {
  modules: string[];
  rawBytes: number;
  gzipBytes: number;
  code: string;
}

function resolveWorkspaceAliases(): Record<string, string> {
  const packagesDir = resolve(ROOT, 'packages');
  const alias: Record<string, string> = {};
  const entries = readdirSync(packagesDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = resolve(packagesDir, entry.name, 'package.json');
    if (!existsSync(pkgJsonPath)) continue;
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
    if (typeof pkgJson.name === 'string') {
      alias[pkgJson.name] = resolve(packagesDir, entry.name, 'src');
    }
  }
  return alias;
}

async function buildFixture(name: string): Promise<FixtureResult> {
  const entry = resolve(EVIDENCE_DIR, `${name}.ts`);
  const alias = resolveWorkspaceAliases();

  const result = (await build({
    configFile: false,
    root: EVIDENCE_DIR,
    logLevel: 'silent',
    resolve: { alias },
    build: {
      write: false,
      minify: false,
      target: 'esnext',
      sourcemap: false,
      rollupOptions: {
        input: entry,
        output: { format: 'es' },
      },
    },
  })) as RollupOutput;

  const chunks = result.output.filter((o): o is OutputChunk => o.type === 'chunk');
  const mainChunk = chunks.find((c) => c.isEntry) ?? chunks[0];
  const allModules = new Set<string>();
  for (const chunk of chunks) {
    for (const id of Object.keys(chunk.modules)) {
      allModules.add(id);
    }
  }

  const code = mainChunk.code;
  const rawBytes = Buffer.byteLength(code, 'utf-8');
  const gzipBytes = gzipSync(code).byteLength;

  return {
    code,
    gzipBytes,
    modules: [...allModules].map((id) => id.replace(ROOT + '/', '')),
    rawBytes,
  };
}

function sourceModules(modules: readonly string[]): string[] {
  return modules.filter((m) => !m.includes('/evidence/'));
}

function hasHostWebModule(modules: readonly string[]): boolean {
  return sourceModules(modules).some((m) => m.includes('packages/host-web/'));
}

function hasCapabilityModule(modules: readonly string[], pattern: string): boolean {
  return sourceModules(modules).some((m) => m.includes(pattern));
}

describe('evidence: tree-shaking isolation', () => {
  const results = new Map<string, FixtureResult>();

  async function getFixture(name: string): Promise<FixtureResult> {
    let result = results.get(name);
    if (result === undefined) {
      result = await buildFixture(name);
      results.set(name, result);
    }
    return result;
  }

  it('control fixture contains zero host-web modules', async () => {
    const { modules } = await getFixture('control');
    expect(hasHostWebModule(modules)).toBe(false);
  });

  it('capability fixture contains zero host-web modules', async () => {
    const { modules } = await getFixture('capability');
    expect(sourceModules(modules).length).toBeGreaterThan(0);
    expect(hasHostWebModule(modules)).toBe(false);
  });

  for (const cap of CAPABILITIES) {
    for (const other of CAPABILITIES) {
      if (other === cap) continue;
      it(`${cap.fixture} fixture excludes ${other.fixture} modules`, async () => {
        const { modules } = await getFixture(cap.fixture);
        expect(sourceModules(modules).length).toBeGreaterThan(0);
        expect(hasHostWebModule(modules)).toBe(true);
        expect(hasCapabilityModule(modules, other.modulePattern)).toBe(false);
      });
    }
  }

  it('combined module set is within the union of individual capabilities', async () => {
    const individualResults = await Promise.all(CAPABILITIES.map((cap) => getFixture(cap.fixture)));
    const combinedResult = await getFixture('combined');
    const union = new Set(individualResults.flatMap((r) => sourceModules(r.modules)));
    const outsideUnion = sourceModules(combinedResult.modules).filter((m) => !union.has(m));
    expect(outsideUnion).toEqual([]);
  });

  it('normalized subadditivity: S(combined) + (N-1)*S(control) <= sum(S(individual))', async () => {
    const control = await getFixture('control');
    const combined = await getFixture('combined');
    const individualResults = await Promise.all(CAPABILITIES.map((cap) => getFixture(cap.fixture)));
    const n = CAPABILITIES.length;

    for (const [name, fixture] of CAPABILITIES.map((cap, i) => [cap.fixture, individualResults[i]] as const)) {
      const rawDelta = fixture.rawBytes - control.rawBytes;
      const gzipDelta = fixture.gzipBytes - control.gzipBytes;
      console.log(
        `${name}: raw=${fixture.rawBytes} (${rawDelta >= 0 ? '+' : ''}${rawDelta}), ` +
          `gzip=${fixture.gzipBytes} (${gzipDelta >= 0 ? '+' : ''}${gzipDelta})`,
      );
    }
    console.log(`combined: raw=${combined.rawBytes}, gzip=${combined.gzipBytes}`);
    console.log(`control: raw=${control.rawBytes}, gzip=${control.gzipBytes}`);

    const sumRaw = individualResults.reduce((s, r) => s + r.rawBytes, 0);
    const sumGzip = individualResults.reduce((s, r) => s + r.gzipBytes, 0);

    for (const cap of CAPABILITIES) {
      const individual = individualResults[CAPABILITIES.indexOf(cap)];
      expect(individual.rawBytes).toBeGreaterThan(control.rawBytes);
    }

    expect(combined.rawBytes).toBeGreaterThan(Math.max(...individualResults.map((r) => r.rawBytes)));

    expect(combined.rawBytes + (n - 1) * control.rawBytes).toBeLessThanOrEqual(sumRaw);
    expect(combined.gzipBytes + (n - 1) * control.gzipBytes).toBeLessThanOrEqual(sumGzip);
  });
});
