import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { Node } from 'oxc-parser';
import { beforeAll, describe, expect, it } from 'vitest';

import { GATE_PROVENANCE_FIELDS } from './gate-provenance';
import { getParsedOxcSource } from './oxc-source';
import {
  createEmptyTeardownRejectionReport,
  createTeardownRejectionReport,
  formatTeardownRejectionReport,
  hasValidAssertSyncVoidDeclaration,
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
  'type IsAny<T> = 0 extends 1 & T ? true : false;',
  'function assertSyncVoid<T>(value: T & (IsAny<T> extends true ? never : T extends void ? unknown : never)): void {',
  '  void value;',
  '}',
  'export function makeBackend() {',
  '  return {',
  '    destroy() {',
  '      try { flagged1(); } catch { /* the guard cannot fire */ }',
  '      try { const r = flagged2(); return r; } catch { /* assigned, still uncatchable */ }',
  '      try { ok1().catch(() => {}); } catch { /* carries its own handler */ }',
  '      try { ok2().then(fine, bad); } catch { /* two-argument then handles rejection */ }',
  '      try { assertSyncVoid(okWrapped()); } catch { /* sync-void proven */ }',
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

// Same teardown shape but assertSyncVoid is weakened — missing the IsAny guard. The scanner must NOT
// recognize it, so the wrapped call remains a candidate.
const WEAKENED_FIXTURE = [
  'function assertSyncVoid<T>(value: T): void {',
  '  void value;',
  '}',
  'export function makeBackend() {',
  '  return {',
  '    destroy() {',
  '      try { assertSyncVoid(weakenedFlagged()); } catch { /* sync-void NOT proven */ }',
  '    },',
  '  };',
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

  it('labels the all-packages assertion so the gate scope is visible', () => {
    const text = formatTeardownRejectionReport(createTeardownRejectionReport([fixturePath]));
    expect(text).toContain('asserted empty across all packages');
    expect(text).toContain('structural sync-void proof');
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
  // accident: awaited calls, calls carrying their own handler, calls outside a try, calls in a
  // non-teardown body, and calls wrapped in a validated assertSyncVoid must all stay out.
  it('excludes awaited calls, handled chains, assertSyncVoid-wrapped calls, calls outside a try, and non-teardown bodies', () => {
    const callees = scanTeardownRejections(fixturePath).candidates.map((candidate) => candidate.callee);
    for (const excluded of ['ok1', 'ok2', 'ok3', 'okWrapped', 'notInTry', 'notATeardown', 'notATeardownEither']) {
      expect(callees).not.toContain(excluded);
    }
  });

  it('finds object-literal methods, whose body oxc puts on value rather than on the node', () => {
    expect(scanTeardownRejections(fixturePath).teardowns).toBe(3);
  });

  // ★ A weakened assertSyncVoid — missing the IsAny guard — must NOT exclude calls. The scanner
  // validates the full AST shape, so an arbitrary same-name function with a different signature is
  // not recognized and its wrapped calls remain candidates.
  it('flags calls wrapped in a weakened assertSyncVoid that the scanner does not recognize', () => {
    const { candidates } = scanTeardownRejections(weakenedFixturePath);
    const callees = candidates.map((candidate) => candidate.callee).sort();
    expect(callees).toEqual(['assertSyncVoid', 'weakenedFlagged']);
  });

  it('propagates a sync throw through assertSyncVoid argument evaluation', () => {
    const assertSyncVoidRuntime = <T>(value: T): void => {
      void value;
    };
    let caught = false;
    try {
      assertSyncVoidRuntime(
        (() => {
          throw new Error('sync');
        })(),
      );
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
  });
});

describe('hasValidAssertSyncVoidDeclaration', () => {
  it('recognizes the canonical declaration with the IsAny guard', () => {
    expect(hasValidAssertSyncVoidDeclaration(parseFixture(FIXTURE), FIXTURE)).toBe(true);
  });

  it('rejects a weakened declaration missing the IsAny guard', () => {
    expect(hasValidAssertSyncVoidDeclaration(parseFixture(WEAKENED_FIXTURE), WEAKENED_FIXTURE)).toBe(false);
  });

  it('rejects an arbitrary same-name function without throwing', () => {
    const weakened = 'function assertSyncVoid(value) {}';
    expect(hasValidAssertSyncVoidDeclaration(parseFixture(weakened), weakened)).toBe(false);
  });

  it('rejects a helper whose IsAny alias is weakened', () => {
    const weakened = FIXTURE.replace('0 extends 1 & T', '0 extends T');
    expect(hasValidAssertSyncVoidDeclaration(parseFixture(weakened), weakened)).toBe(false);
  });

  it('rejects a helper whose conditional parameter proof is weakened', () => {
    const weakened = FIXTURE.replace('value: T & (', 'value: T | (');
    expect(hasValidAssertSyncVoidDeclaration(parseFixture(weakened), weakened)).toBe(false);
  });

  it('rejects a helper whose declared return is not void', () => {
    const weakened = FIXTURE.replace(')): void {', ')): unknown {');
    expect(hasValidAssertSyncVoidDeclaration(parseFixture(weakened), weakened)).toBe(false);
  });

  it('rejects a helper whose body does more than discard the value', () => {
    const weakened = FIXTURE.replace('  void value;\n}', '  void value;\n  sideEffect();\n}');
    expect(hasValidAssertSyncVoidDeclaration(parseFixture(weakened), weakened)).toBe(false);
  });

  it('rejects code with no assertSyncVoid at all', () => {
    const bare = 'export function destroy() { try { foo(); } catch {} }';
    expect(hasValidAssertSyncVoidDeclaration(parseFixture(bare), bare)).toBe(false);
  });
});

// The live population. This is a census rather than a ratchet: it reports, and the judgement of whether
// a candidate's callee actually returns a promise is made by reading the API and recorded in
// `agents/backend-lifecycle-ownership.md`, because that is not syntactically decidable.
//
// ★ Census anchored to integration a24504404 (2026-08-28): 72 teardown bodies, 241 CallExpressions,
// 0 unhandled Promise-returning calls outside try blocks. The only Promise call (AudioContext.close)
// is .catch-handled. Outside-try calls are NOT continuously gated — the scanner examines only try
// blocks, so a Promise-returning call placed outside a try would not be reported.
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

  // ★ EVERY PACKAGE TEARDOWN IS CLEAN. The two try-wrapped calls that existed (AudioBufferSourceNode.stop
  // in media and MediaSession.setActionHandler in mediasession) are wrapped in a validated assertSyncVoid,
  // proving their return type is void at compile time. The four async releases in host code attach their
  // own .catch. Everything else is either awaited or not in a try.
  it('finds no uncatchable-rejection candidate in any package', () => {
    expect(report.candidates).toEqual([]);
  });
});

const ROOT = resolve(__dirname, '..');
const fixturePath = writeFixture(FIXTURE, 'TeardownFixture.ts');
const weakenedFixturePath = writeFixture(WEAKENED_FIXTURE, 'WeakenedFixture.ts');

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

function parseFixture(source: string): Node {
  const path = writeFixture(source, 'ParseFixture.ts');
  return getParsedOxcSource(path).program as unknown as Node;
}

function writeFixture(source: string, name: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'teardown-rejection-')), name);
  writeFileSync(path, source, 'utf-8');
  return path;
}
