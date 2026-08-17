import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  captureProvenanceColumnKey,
  censusCaptureProvenance,
  formatCaptureProvenanceCensus,
  loadCaptureProvenanceColumns,
  readGatedValidationIdentities,
} from './capture-provenance-census';

// Formatted-output assertions test content, not whether this machine's terminal enables ANSI styling.
// eslint-disable-next-line no-control-regex -- ESC (0x1b) is required to strip ANSI color codes
const strip = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '');

describe('capture provenance census', () => {
  it('keeps exact matches as a visible control and names the cross-leg gap', () => {
    const census = censusCaptureProvenance(
      [
        column('one', { current: 'current', fingerprint: 'current', sha256: 'current' }, 'full'),
        column('two', { current: 'current', fingerprint: 'old', sha256: 'current' }, 'partial'),
        column('three', { current: 'current', fingerprint: null, sha256: null }, 'missing'),
        column('four', { current: null, fingerprint: 'old', sha256: 'old' }, 'partial'),
      ],
      ['functional'],
    );

    expect(census.total).toMatchObject({
      fingerprint: { currentUnavailable: 1, exact: 1, mismatched: 1, missing: 1 },
      fingerprintColumns: 4,
      fingerprintProvenanceFull: 1,
      fingerprintProvenancePartial: 2,
      freshnessGap: 1,
      mismatchedScenes: 1,
      sha256Provenance: { currentUnavailable: 1, exact: 2, mismatched: 0, missing: 1 },
    });
    const output = strip(formatCaptureProvenanceCensus(census, 'fixture'));
    expect(output).toContain('WARNING: A sourceHash mismatch means provenance is unverifiable');
    expect(output).toContain('fingerprint provenance       full=   1  PROVENANCE-PARTIAL=   2');
    expect(output).toContain('fingerprint sourceHash       exact=   1  mismatch=   1');
    expect(output).toContain(
      'Exact-vs-fingerprint freshness gap (sha256 exact - fingerprint exact): functional=+1  total=+1',
    );
  });

  it('slices to only regression columns an actual run passed or failed', () => {
    const identities = readGatedValidationIdentities(
      report([
        check('kept-pass', 'webgl', 'regression', 'passed'),
        check('kept-fail', 'webgpu', 'regression', 'failed'),
        check('not-gated-report', 'canvas', 'regression', 'reported'),
        check('not-regression', 'webgl', 'parity', 'passed'),
        check('not-loaded', 'canvas', 'load', 'failed'),
      ]),
    );

    expect([...identities].sort()).toEqual([
      captureProvenanceColumnKey('kept-fail', 'webgpu'),
      captureProvenanceColumnKey('kept-pass', 'webgl'),
    ]);
  });

  it('refuses a report that gated nothing instead of comparing it with the global census', () => {
    expect(() =>
      readGatedValidationIdentities(report([check('only-report', 'canvas', 'regression', 'reported')])),
    ).toThrow('validation report gated no regression columns');
  });

  it('uses canonical scene discovery/hash resolution and keeps unresolved committed columns visible', () => {
    const root = mkdtempSync(join(tmpdir(), 'capture-provenance-'));
    try {
      const scenes = join(root, 'functional', 'scenes');
      const baselines = join(root, 'functional', 'baselines');
      mkdirSync(scenes, { recursive: true });
      mkdirSync(baselines, { recursive: true });
      const source = 'export const scene = "backend-specific";\n';
      writeFileSync(join(scenes, 'sample.webgl.ts'), source);
      writeFileSync(
        join(baselines, 'sample.json'),
        JSON.stringify({ webgl: { fingerprint: 'varied', sourceHash: sha256(source) } }),
      );
      writeFileSync(
        join(baselines, 'orphan.json'),
        JSON.stringify({ webgl: { fingerprint: 'varied', sourceHash: 'old' } }),
      );

      expect(loadCaptureProvenanceColumns(root, 'functional')).toEqual([
        expect.objectContaining({ currentSourceHash: null, entry: 'orphan', renderer: 'webgl' }),
        expect.objectContaining({ currentSourceHash: sha256(source), entry: 'sample', renderer: 'webgl' }),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('prefers full fingerprintProvenance over a disagreeing legacy fallback in a mixed corpus', () => {
    const root = mkdtempSync(join(tmpdir(), 'capture-provenance-'));
    try {
      const scenes = join(root, 'functional', 'scenes');
      const baselines = join(root, 'functional', 'baselines');
      mkdirSync(scenes, { recursive: true });
      mkdirSync(baselines, { recursive: true });
      const source = 'export const scene = "full provenance wins";\n';
      const current = sha256(source);
      writeFileSync(join(scenes, 'sample.webgl.ts'), source);
      writeFileSync(
        join(baselines, 'sample.json'),
        JSON.stringify({
          webgl: {
            fingerprint: 'varied',
            sourceHash: 'disagreeing-legacy-value',
            fingerprintProvenance: provenance(current),
          },
        }),
      );

      expect(loadCaptureProvenanceColumns(root, 'functional')).toEqual([
        expect.objectContaining({
          entry: 'sample',
          fingerprintProvenanceStatus: 'full',
          fingerprintSourceHash: current,
          renderer: 'webgl',
        }),
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('refuses a gated identity that no longer resolves to a committed fingerprint', () => {
    const root = mkdtempSync(join(tmpdir(), 'capture-provenance-'));
    try {
      mkdirSync(join(root, 'functional', 'baselines'), { recursive: true });
      expect(() =>
        loadCaptureProvenanceColumns(root, 'functional', new Set([captureProvenanceColumnKey('missing', 'webgl')])),
      ).toThrow('with no committed fingerprint: missing/webgl');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

function column(
  entry: string,
  hashes: Readonly<{ current: string | null; fingerprint: string | null; sha256: string | null }>,
  fingerprintProvenanceStatus: 'full' | 'partial' | 'missing',
) {
  return {
    currentSourceHash: hashes.current,
    entry,
    fingerprintProvenanceStatus,
    fingerprintSourceHash: hashes.fingerprint,
    renderer: 'webgl',
    sha256SourceHash: hashes.sha256,
    subject: 'functional' as const,
  };
}

function provenance(sourceHash: string) {
  return { frames: 1, sourceHash, targetKind: 'webgl', verifyPublished: true, warmupFrames: 0 };
}

function check(entry: string, renderer: string, kind: string, status: string) {
  return { entry, kind, renderers: [renderer], status };
}

function report(checks: readonly unknown[]): string {
  return JSON.stringify({ kind: 'validation', protocolVersion: 1, reportVersion: 1, result: { checks } });
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
