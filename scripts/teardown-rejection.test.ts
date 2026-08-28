import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { GATE_PROVENANCE_FIELDS } from './gate-provenance';
import {
  createEmptyTeardownRejectionReport,
  createTeardownRejectionReport,
  formatTeardownRejectionReport,
  isTeardownFunctionName,
  scanTeardownRejections,
} from './teardown-rejection-core';
import type { TeardownRejectionReport } from './teardown-rejection-core';

// ★ THE CONTROL FIXTURE, and it is the reason this scanner is trustworthy. Both of its bugs were found
// here rather than in review: object-literal methods were skipped entirely (oxc puts their body on
// `value`, not on the node — so it silently scanned nothing, since every backend in the repo is an
// object literal), and every correctly-handled call was reported as a finding (oxc names the node
// `MemberExpression`, not `StaticMemberExpression`). Both produced plausible output. A fixture with
// known answers on BOTH axes — what must be flagged and what must not — is what separated them.
const FIXTURE = [
  'export function makeBackend() {',
  '  return {',
  '    destroy() {',
  '      try { flagged1(); } catch { /* the guard cannot fire */ }',
  '      try { const r = flagged2(); return r; } catch { /* assigned, still uncatchable */ }',
  '      try { ok1().catch(() => {}); } catch { /* carries its own handler */ }',
  '      try { ok2().then(fine, bad); } catch { /* two-argument then handles rejection */ }',
  '      notInTry();',
  '    },',
  '    async dispose() {',
  '      try { await ok3(); } catch { /* awaited, so the guard does fire */ }',
  '      try { flagged3(); } catch { /* the guard cannot fire */ }',
  '    },',
  '    other() {',
  '      try { notATeardown(); } catch { /* not a teardown body */ }',
  '    },',
  '  };',
  '}',
  'export function destroyThingBackend() {',
  '  try { flagged4(); } catch { /* the guard cannot fire */ }',
  '}',
  'export function releaseSingleInstanceLock() {',
  '  try { notATeardownEither(); } catch { /* an ordinary release* operation, not a teardown */ }',
  '}',
].join('\n');

describe('createEmptyTeardownRejectionReport', () => {
  it('supplies every field the real report producer does', () => {
    const produced = createTeardownRejectionReport([]);
    expect(Object.keys(createEmptyTeardownRejectionReport()).sort()).toEqual(Object.keys(produced).sort());
  });

  it('is empty rather than merely well-typed', () => {
    const empty = createEmptyTeardownRejectionReport();
    expect(empty.candidates).toEqual([]);
    expect(empty.scannedFiles).toBe(0);
    expect(empty.teardownsScanned).toBe(0);
  });
});

describe('createTeardownRejectionReport', () => {
  it('aggregates candidates and counts across files', () => {
    const report = createTeardownRejectionReport([fixturePath, fixturePath]);
    expect(report.scannedFiles).toBe(2);
    expect(report.teardownsScanned).toBe(6);
    expect(report.candidates).toHaveLength(8);
  });
});

describe('formatTeardownRejectionReport', () => {
  it('carries the four provenance fields and the population', () => {
    const text = formatTeardownRejectionReport(createEmptyTeardownRejectionReport());
    for (const field of GATE_PROVENANCE_FIELDS) expect(text).toContain(field);
    expect(text).toContain('0 uncatchable-rejection candidates across 0 teardown bodies');
  });

  it('names each candidate with its file, teardown and callee', () => {
    const text = formatTeardownRejectionReport(createTeardownRejectionReport([fixturePath]));
    expect(text).toContain('destroy() → flagged1');
    expect(text).toContain('destroyThingBackend() → flagged4');
  });

  it('labels the host/non-host split so the ungated scope is visible', () => {
    const text = formatTeardownRejectionReport(createTeardownRejectionReport([fixturePath]));
    expect(text).toContain('0 host candidates (asserted)');
    expect(text).toContain('non-host candidates (not asserted');
  });

  it('would fail if the non-host caveat were removed or weakened', () => {
    const text = formatTeardownRejectionReport(createTeardownRejectionReport([fixturePath]));
    expect(text).toMatch(/not asserted/);
  });
});

describe('isTeardownFunctionName', () => {
  it('accepts the teardown members and the backend-release helpers', () => {
    expect(isTeardownFunctionName('destroy')).toBe(true);
    expect(isTeardownFunctionName('dispose')).toBe(true);
    expect(isTeardownFunctionName('destroySource')).toBe(true);
    expect(isTeardownFunctionName('destroyMediaSessionBackend')).toBe(true);
    expect(isTeardownFunctionName('releaseMediaSessionBackends')).toBe(true);
  });

  // ★ `release` is an ordinary operation verb in this SDK, so a bare `release*` arm swept in plain API
  // methods. `releaseSingleInstanceLock` is an `AppBackend` operation present in all four hosts, and
  // counting it inflated the teardown denominator by functions that tear nothing down.
  it('rejects ordinary release* operations, which tear nothing down', () => {
    expect(isTeardownFunctionName('releaseSingleInstanceLock')).toBe(false);
    expect(isTeardownFunctionName('releaseInputPointerCapture')).toBe(false);
    expect(isTeardownFunctionName('setKeepAwake')).toBe(false);
  });
});

describe('scanTeardownRejections', () => {
  it('flags exactly the calls whose guard cannot fire', () => {
    const { candidates } = scanTeardownRejections(fixturePath);
    expect(candidates.map((candidate) => candidate.callee).sort()).toEqual([
      'flagged1',
      'flagged2',
      'flagged3',
      'flagged4',
    ]);
  });

  // The negative half, stated separately so a scanner that flagged everything could not pass by
  // accident: awaited calls, calls carrying their own handler, calls outside a try, and calls in a
  // non-teardown body must all stay out.
  it('excludes awaited calls, handled chains, calls outside a try, and non-teardown bodies', () => {
    const callees = scanTeardownRejections(fixturePath).candidates.map((candidate) => candidate.callee);
    for (const excluded of ['ok1', 'ok2', 'ok3', 'notInTry', 'notATeardown', 'notATeardownEither']) {
      expect(callees).not.toContain(excluded);
    }
  });

  it('finds object-literal methods, whose body oxc puts on value rather than on the node', () => {
    expect(scanTeardownRejections(fixturePath).teardowns).toBe(3);
  });
});

// The live population. This is a census rather than a ratchet: it reports, and the judgement of whether
// a candidate's callee actually returns a promise is made by reading the API and recorded in
// `agents/backend-lifecycle-ownership.md`, because that is not syntactically decidable.
describe('teardown rejection census of the live tree', () => {
  let report: TeardownRejectionReport;

  beforeAll(() => {
    report = createTeardownRejectionReport(livePackageSources());
    // eslint-disable-next-line no-console
    console.log(formatTeardownRejectionReport(report));
  });

  it('scans a non-empty population', () => {
    expect(report.scannedFiles).toBeGreaterThan(1_000);
    expect(report.teardownsScanned).toBeGreaterThan(50);
  });

  // ★ EVERY HOST TEARDOWN IS CLEAN, and that is the finding rather than an absence of one. The four
  // async releases in host code — the web wake-lock release, the Tauri tray close, window close and
  // shortcut unregisterAll — all attach their own `.catch`, so none sits inside a try it could escape.
  // Each now has an explicit rejection-axis test beside its implementation.
  it('finds no uncatchable-rejection candidate in any host package', () => {
    const hostCandidates = report.candidates.filter((candidate) => candidate.path.includes('/packages/host-'));
    expect(hostCandidates).toEqual([]);
  });
});

const ROOT = resolve(__dirname, '..');
const fixturePath = writeFixture();

function livePackageSources(): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(ROOT, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(join(ROOT, 'packages', entry.name, 'package.json'))) continue;
    const sourceDir = join(ROOT, 'packages', entry.name, 'src');
    if (!existsSync(sourceDir)) continue;
    for (const file of readdirSync(sourceDir)) {
      if (file.endsWith('.ts') && !file.endsWith('.test.ts')) files.push(join(sourceDir, file));
    }
  }
  return files;
}

function writeFixture(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'teardown-rejection-')), 'TeardownFixture.ts');
  writeFileSync(path, FIXTURE, 'utf-8');
  return path;
}
