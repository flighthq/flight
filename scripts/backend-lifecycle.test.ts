import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  collectMethodSyntaxTeardowns,
  collectWholeBackendTeardowns,
  compareBackendLifecycleReports,
  createBackendLifecycleReport,
  formatBackendLifecycleDelta,
  formatBackendLifecycleReport,
  hasBackendLifecycleFailure,
} from './backend-lifecycle-core';
import type { BackendLifecycleDelta, BackendLifecycleReport } from './backend-lifecycle-core';
import { collectBackendInterfaceNames } from './backend-operation-seam-core';

// P4's replacement-lifetime census. Population and exclusions are both derived: a backend can only leak a
// resource it owns, and ownership is the interface declaring a NO-ARGUMENT `destroy()`/`dispose()`.
describe('backend replacement lifetime census', () => {
  let report: BackendLifecycleReport;
  let teardowns: ReadonlyMap<string, string>;

  beforeAll(() => {
    const typeFiles = packageSourceFiles('types');
    expect(typeFiles.length).toBeGreaterThan(0);
    const names = collectBackendInterfaceNames(typeFiles).map((name) => `${name}Backend`);
    teardowns = collectWholeBackendTeardowns(typeFiles);
    report = createBackendLifecycleReport(names, teardowns, collectSetterBodies(), collectFunctionBodies());
    // eslint-disable-next-line no-console
    console.log(formatBackendLifecycleReport(report));
  });

  it('prints both counts and holds the partition', () => {
    expect(report.total).toBeGreaterThan(0);
    expect(report.enforced + report.noTeardownHook).toBe(report.total);
  });

  // ★ The exclusion, asserted rather than assumed. A per-object teardown frees one item, not the backend,
  // so these must NOT be counted as owning a freeable resource — otherwise the census reports leaks for
  // backends that have nothing to free and the gate is noise from its first run.
  it('excludes per-object teardowns, which free an item rather than the backend', () => {
    expect(teardowns.has('TrayBackend')).toBe(false);
    expect(teardowns.has('WindowBackend')).toBe(false);
    expect(teardowns.has('NotificationBackend')).toBe(false);
  });

  it('includes the whole-backend teardowns that exist', () => {
    expect(teardowns.get('LogTransportBackend')).toBe('destroy');
    expect(teardowns.get('MediaSessionBackend')).toBe('destroy');
  });

  // ★ WHY WIDENING THE PARSER LEFT THE LIVE COUNT WHERE IT WAS — stated executably, because a number
  // explained only in prose drifts from the code that produced it.
  //
  // The gate accepts a zero-arity teardown in either declaration syntax. Comparing that against the old
  // method-only reader answers, from the live tree, whether accepting property form changed WHICH backends
  // are counted. It does not: no interface currently declares a callable property named `destroy` or
  // `dispose` — the six property-form members that exist are all `TextShaperBackend` operations
  // (`shapeRun?` and five siblings). So the population is unchanged for that reason, not by luck.
  //
  // The next property-form teardown someone writes IS caught — the specimen below proves that — and on
  // that day these two readers disagree and this test fails, which is exactly when the recorded count
  // should be updated rather than quietly discovered to be stale.
  it('is unchanged by accepting property syntax, because no callable property is named destroy or dispose', () => {
    const methodOnly = collectMethodSyntaxTeardowns(packageSourceFiles('types'));
    expect([...teardowns.keys()].sort()).toEqual([...methodOnly.keys()].sort());
    expect(report.enforced).toBe(methodOnly.size);
  });

  // ★ THE FLOOR, named rather than counted. A number-only floor lets a deletion go unnoticed as long as
  // an addition lands in the same slice. A named set makes every disappearance individually visible.
  // Raise this set by adding the name whenever a slice lands a teardown hook.
  const ENFORCED_FLOOR = ['AccessibilityBackend', 'LogTransportBackend', 'MediaSessionBackend'];

  it('never enforces fewer backends than the slices already landed', () => {
    expect(report.enforced).toBeGreaterThanOrEqual(ENFORCED_FLOOR.length);
    for (const name of ENFORCED_FLOOR) {
      expect(report.enforcedNames).toContain(name);
    }
  });

  // The ratchet: replacement must free what the outgoing backend held, for every backend that owns
  // anything. Green today because one backend does; it tightens by itself as teardown hooks are added.
  it('reports no leak among the backends that own a freeable resource', () => {
    expect(report.violations).toEqual([]);
    expect(hasBackendLifecycleFailure(report)).toBe(false);
  });
});

// ★ THE SYNTAX BLIND SPOT, pinned with a fixture. A backend member may be declared as a METHOD
// (`destroy(): void`) or as a PROPERTY with a function type (`destroy?: () => void`), and the two are
// different AST nodes. Reading only method signatures is not hypothetical — `TextShaperBackend` already
// declares all six of its optional operations in property form, so a method-only reader misses them
// while still printing a confident green. Both forms must be found, and arity must still decide.
describe('collectWholeBackendTeardowns member syntax', () => {
  it('finds a zero-parameter teardown in either declaration syntax, and rejects a parameterised one', () => {
    const fixture = join(mkdtempSync(join(tmpdir(), 'backend-lifecycle-')), 'BackendSyntaxFixture.ts');
    writeFileSync(
      fixture,
      [
        'export interface MethodFormBackend { destroy(): void; }',
        'export interface OptionalMethodFormBackend { destroy?(): void; }',
        'export interface PropertyFormBackend { destroy?: () => void; }',
        'export interface RequiredPropertyFormBackend { destroy: () => void; }',
        'export interface DisposePropertyFormBackend { dispose?: () => void; }',
        'export interface PerObjectMethodBackend { destroy(id: number): void; }',
        'export interface PerObjectPropertyBackend { destroy?: (id: number) => void; }',
        'export interface NoTeardownBackend { write(line: string): void; }',
      ].join('\n'),
      'utf-8',
    );

    const found = collectWholeBackendTeardowns([fixture]);
    expect(found.get('MethodFormBackend')).toBe('destroy');
    expect(found.get('OptionalMethodFormBackend')).toBe('destroy');
    expect(found.get('PropertyFormBackend')).toBe('destroy');
    expect(found.get('RequiredPropertyFormBackend')).toBe('destroy');
    expect(found.get('DisposePropertyFormBackend')).toBe('dispose');
    expect(found.has('PerObjectMethodBackend')).toBe(false);
    expect(found.has('PerObjectPropertyBackend')).toBe(false);
    expect(found.has('NoTeardownBackend')).toBe(false);
  });
});

describe('compareBackendLifecycleReports', () => {
  function syntheticReport(names: readonly string[], teardownNames: readonly string[]): BackendLifecycleReport {
    const entries = names.map((interfaceName) => ({
      interfaceName,
      setter: null,
      teardown: teardownNames.includes(interfaceName) ? 'destroy' : null,
      tearsDown: false,
    }));
    const enforcedNames = teardownNames.slice().sort();
    return {
      enforced: enforcedNames.length,
      enforcedNames,
      entries,
      noTeardownHook: names.length - enforcedNames.length,
      total: names.length,
      violations: [],
    };
  }

  it('reports denominator growth as new seams, not as a regression', () => {
    const prior = syntheticReport(['A', 'B', 'C'], ['A']);
    const current = syntheticReport(['A', 'B', 'C', 'D', 'E'], ['A']);
    const delta = compareBackendLifecycleReports(prior, current);
    expect(delta.seamsAdded).toEqual(['D', 'E']);
    expect(delta.enforcedLost).toEqual([]);
    expect(delta.enforcedGained).toEqual([]);
    expect(delta.seamsRemoved).toEqual([]);
  });

  it('reports a lost enforced backend as a regression', () => {
    const prior = syntheticReport(['A', 'B', 'C'], ['A', 'B']);
    const current = syntheticReport(['A', 'B', 'C'], ['A']);
    const delta = compareBackendLifecycleReports(prior, current);
    expect(delta.enforcedLost).toEqual(['B']);
    expect(delta.seamsAdded).toEqual([]);
    expect(delta.seamsRemoved).toEqual([]);
  });

  it('distinguishes a removed interface from a regression', () => {
    const prior = syntheticReport(['A', 'B', 'C'], ['A']);
    const current = syntheticReport(['A', 'C'], ['A']);
    const delta = compareBackendLifecycleReports(prior, current);
    expect(delta.seamsRemoved).toEqual(['B']);
    expect(delta.enforcedLost).toEqual([]);
  });

  it('reports newly enforced backends as progressions', () => {
    const prior = syntheticReport(['A', 'B'], ['A']);
    const current = syntheticReport(['A', 'B'], ['A', 'B']);
    const delta = compareBackendLifecycleReports(prior, current);
    expect(delta.enforcedGained).toEqual(['B']);
    expect(delta.enforcedLost).toEqual([]);
  });

  it('handles simultaneous growth and regression', () => {
    const prior = syntheticReport(['A', 'B', 'C'], ['A', 'B']);
    const current = syntheticReport(['A', 'B', 'C', 'D'], ['A']);
    const delta = compareBackendLifecycleReports(prior, current);
    expect(delta.seamsAdded).toEqual(['D']);
    expect(delta.enforcedLost).toEqual(['B']);
    expect(delta.enforcedGained).toEqual([]);
  });
});

describe('formatBackendLifecycleDelta', () => {
  it('reports zero regressions when nothing changed', () => {
    const delta: BackendLifecycleDelta = { enforcedGained: [], enforcedLost: [], seamsAdded: [], seamsRemoved: [] };
    expect(formatBackendLifecycleDelta(delta)).toBe('0 regressions');
  });

  it('separates denominator growth from regression count', () => {
    const delta: BackendLifecycleDelta = {
      enforcedGained: [],
      enforcedLost: [],
      seamsAdded: ['D', 'E'],
      seamsRemoved: [],
    };
    expect(formatBackendLifecycleDelta(delta)).toBe('+2 new seams, 0 regressions');
  });

  it('reports regressions distinctly from growth', () => {
    const delta: BackendLifecycleDelta = {
      enforcedGained: [],
      enforcedLost: ['B'],
      seamsAdded: ['D', 'E'],
      seamsRemoved: [],
    };
    expect(formatBackendLifecycleDelta(delta)).toBe('+2 new seams, 1 regression');
  });

  it('includes progressions and removals', () => {
    const delta: BackendLifecycleDelta = {
      enforcedGained: ['C'],
      enforcedLost: [],
      seamsAdded: [],
      seamsRemoved: ['X'],
    };
    expect(formatBackendLifecycleDelta(delta)).toBe('-1 removed, +1 newly enforced, 0 regressions');
  });
});

const ROOT = resolve(__dirname, '..');

// Every exported `set*Backend` in the repo, mapped to its body text.
function collectSetterBodies(): ReadonlyMap<string, string> {
  const bodies = new Map<string, string>();
  for (const packageName of packageNames()) {
    for (const file of packageSourceFiles(packageName)) {
      const text = readFileSync(file, 'utf-8');
      const pattern = /^export function (set\w*Backend)\([^)]*\)[^{]*\{/gm;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const open = text.indexOf('{', match.index);
        let depth = 0;
        let end = open;
        for (; end < text.length; end++) {
          if (text[end] === '{') depth++;
          else if (text[end] === '}' && --depth === 0) break;
        }
        bodies.set(match[1], text.slice(open + 1, end));
      }
    }
  }
  return bodies;
}

// Every top-level function body in the repo's package sources, so the census can follow a setter into the
// helper it delegates teardown to.
function collectFunctionBodies(): ReadonlyMap<string, string> {
  const bodies = new Map<string, string>();
  for (const packageName of packageNames()) {
    for (const file of packageSourceFiles(packageName)) {
      const text = readFileSync(file, 'utf-8');
      const pattern = /^(?:export )?function (\w+)\([^)]*\)[^{]*\{/gm;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const open = text.indexOf('{', match.index);
        let depth = 0;
        let end = open;
        for (; end < text.length; end++) {
          if (text[end] === '{') depth++;
          else if (text[end] === '}' && --depth === 0) break;
        }
        bodies.set(match[1], text.slice(open + 1, end));
      }
    }
  }
  return bodies;
}

function packageNames(): string[] {
  return readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, 'packages', entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();
}

function packageSourceFiles(packageName: string): string[] {
  const sourceDir = join(ROOT, 'packages', packageName, 'src');
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
    .map((entry) => join(sourceDir, entry.name));
}
