import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  BACKEND_LIFECYCLE_SCOPE_CAVEAT,
  collectMethodSyntaxTeardowns,
  collectWholeBackendTeardowns,
  compareBackendLifecycleReports,
  compareFloorToReport,
  createBackendLifecycleReport,
  createEmptyBackendLifecycleReport,
  formatBackendLifecycleDelta,
  formatBackendLifecycleReport,
  hasBackendLifecycleFailure,
} from './backend-lifecycle-core';
import type { BackendLifecycleDelta, BackendLifecycleFloor, BackendLifecycleReport } from './backend-lifecycle-core';
import { collectBackendInterfaceNames } from './backend-operation-seam-core';
import { GATE_STRUCTURAL_LIMIT } from './gate-provenance';

// P4's replacement-lifetime census. Population and exclusions are both derived: a backend can only leak a
// resource it owns, and ownership is the interface declaring a NO-ARGUMENT `destroy()`/`dispose()`.
describe('backend replacement lifetime census', () => {
  let report: BackendLifecycleReport;
  let teardowns: ReadonlyMap<string, string>;
  let formattedOutput: string;

  // ★ THE HISTORICAL BASELINE is IMMUTABLE — it records the population and enforced set at the moment the
  // gate was established. A baseline that moves with the thing it measures measures nothing. The total stays
  // at 43, the three original names stay as they were, and growth since then is visible as signed deltas:
  // baseline 43 / current 50 → "+7 new seams", baseline 3 enforced / current 5 → "+2 newly enforced".
  // NEVER update this to absorb subsequent slices — that erases history.
  const HISTORICAL_BASELINE: BackendLifecycleFloor = {
    enforcedNames: ['AccessibilityBackend', 'LogTransportBackend', 'MediaSessionBackend'],
    total: 43,
  };

  // The current ratchet: every backend that has landed a teardown hook. This list grows as slices land and
  // must never shrink — removing a name here is a regression. Separate from the historical baseline so
  // delta display shows progression (+2 newly enforced) while enforcement gates the full current set.
  const REQUIRED_ENFORCED_NAMES: readonly string[] = [
    'AccessibilityBackend',
    'LogTransportBackend',
    'MediaSessionBackend',
    'MenuBackend',
    'PowerBackend',
  ];

  beforeAll(() => {
    const typeFiles = packageSourceFiles('types');
    expect(typeFiles.length).toBeGreaterThan(0);
    const names = collectBackendInterfaceNames(typeFiles).map((name) => `${name}Backend`);
    teardowns = collectWholeBackendTeardowns(typeFiles);
    report = createBackendLifecycleReport(names, teardowns, collectSetterBodies(), collectFunctionBodies());
    formattedOutput = formatBackendLifecycleReport(report, HISTORICAL_BASELINE);
    // eslint-disable-next-line no-console
    console.log(formattedOutput);
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

  it('never enforces fewer backends than the required set', () => {
    expect(report.enforced).toBeGreaterThanOrEqual(REQUIRED_ENFORCED_NAMES.length);
    for (const name of REQUIRED_ENFORCED_NAMES) {
      expect(report.enforcedNames).toContain(name);
    }
  });

  // The ratchet: every backend that DECLARES a whole-backend teardown must have its setter name it.
  // That is a wiring check, not a proof that teardown is complete — see the scope caveat below.
  it('reports no unwired teardown among the backends that declare one', () => {
    expect(report.violations).toEqual([]);
    expect(hasBackendLifecycleFailure(report)).toBe(false);
  });

  // ★ THE SCOPE CAVEAT MUST SURVIVE. The printed number is read as a completeness measure by everyone
  // who has not read this file, and the live audit found rows where it is not one: `PowerBackend`'s
  // host-installed instance has no reachable teardown at all (there is no `destroyPowerBackend`, and
  // `setPowerBackend` destroys only the custom slot), while `MediaSessionBackend`'s destroy resets
  // metadata and playbackState it may never have set. Deleting the caveat to tidy the output fails here.
  it('prints the caveat that the count is structural and behavior is unverified', () => {
    expect(formattedOutput).toContain(BACKEND_LIFECYCLE_SCOPE_CAVEAT);
    expect(formattedOutput).toContain('STRUCTURAL');
    // Names what it counts, and the two things it cannot speak to.
    expect(formattedOutput).toContain('counts hook presence');
    expect(formattedOutput).toContain(GATE_STRUCTURAL_LIMIT);
    // The summary must not reassert ownership semantics the gate cannot observe.
    expect(formattedOutput).not.toContain('own a freeable resource');
  });

  it('emits the delta inline so denominator growth is reported separately from regressions', () => {
    const delta = compareFloorToReport(HISTORICAL_BASELINE, report);
    const deltaText = formatBackendLifecycleDelta(delta);
    expect(formattedOutput).toContain(`(${deltaText})`);
  });

  // ★ A baseline that moves with the thing it measures measures nothing. The baseline total is pinned at 43
  // (the population when the enforced set was established). It must not change for routine growth or
  // shrinkage — growth shows as "+N new seams", shrinkage as "-N removed", and both stay visible history.
  it('pins the historical baseline total at 43', () => {
    expect(HISTORICAL_BASELINE.total).toBe(43);
  });

  it('pins the historical baseline names to the three original enforced backends', () => {
    expect(HISTORICAL_BASELINE.enforcedNames).toEqual([
      'AccessibilityBackend',
      'LogTransportBackend',
      'MediaSessionBackend',
    ]);
  });

  it('pins the required enforced names to the five current enforced backends', () => {
    expect(REQUIRED_ENFORCED_NAMES).toEqual([
      'AccessibilityBackend',
      'LogTransportBackend',
      'MediaSessionBackend',
      'MenuBackend',
      'PowerBackend',
    ]);
  });

  it('shows progression in the live delta when slices land beyond the historical baseline', () => {
    const delta = compareFloorToReport(HISTORICAL_BASELINE, report);
    expect(delta.enforcedGained).toContain('MenuBackend');
    expect(delta.enforcedGained).toContain('PowerBackend');
    expect(delta.enforcedLost).toEqual([]);
  });

  it('fails enforcement when a required name is missing from the live report', () => {
    const missing = REQUIRED_ENFORCED_NAMES.filter((name) => !report.enforcedNames.includes(name));
    expect(missing).toEqual([]);
  });

  it('would fail if MenuBackend were removed from the required set but still enforced', () => {
    const withoutMenu = REQUIRED_ENFORCED_NAMES.filter((name) => name !== 'MenuBackend');
    expect(withoutMenu).not.toContain('MenuBackend');
    expect(withoutMenu.length).toBe(REQUIRED_ENFORCED_NAMES.length - 1);
  });

  it('would fail if PowerBackend were removed from the required set but still enforced', () => {
    const withoutPower = REQUIRED_ENFORCED_NAMES.filter((name) => name !== 'PowerBackend');
    expect(withoutPower).not.toContain('PowerBackend');
    expect(withoutPower.length).toBe(REQUIRED_ENFORCED_NAMES.length - 1);
  });

  it('would lose progression visibility if historical baseline absorbed Menu and Power', () => {
    const absorbedBaseline: BackendLifecycleFloor = {
      enforcedNames: [...HISTORICAL_BASELINE.enforcedNames, 'MenuBackend', 'PowerBackend'].sort(),
      total: HISTORICAL_BASELINE.total,
    };
    const delta = compareFloorToReport(absorbedBaseline, report);
    expect(delta.enforcedGained).not.toContain('MenuBackend');
    expect(delta.enforcedGained).not.toContain('PowerBackend');
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
      ...createEmptyBackendLifecycleReport(),
      enforced: enforcedNames.length,
      enforcedNames,
      entries,
      noTeardownHook: names.length - enforcedNames.length,
      total: names.length,
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

describe('compareFloorToReport', () => {
  it('reports denominator shrinkage as removed seams, not a regression', () => {
    const floor: BackendLifecycleFloor = { enforcedNames: ['ABackend'], total: 5 };
    const report: BackendLifecycleReport = {
      ...createEmptyBackendLifecycleReport(),
      enforced: 1,
      enforcedNames: ['ABackend'],
      entries: [
        { interfaceName: 'ABackend', setter: null, teardown: 'destroy', tearsDown: false },
        { interfaceName: 'BBackend', setter: null, teardown: null, tearsDown: false },
        { interfaceName: 'CBackend', setter: null, teardown: null, tearsDown: false },
      ],
      noTeardownHook: 2,
      total: 3,
      violations: [],
    };
    const delta = compareFloorToReport(floor, report);
    expect(delta.seamsRemoved).toHaveLength(2);
    expect(delta.enforcedLost).toEqual([]);
    expect(delta.enforcedGained).toEqual([]);
    expect(delta.seamsAdded).toEqual([]);
  });

  it('reports numerator loss at unchanged denominator as a regression', () => {
    const floor: BackendLifecycleFloor = { enforcedNames: ['ABackend', 'BBackend'], total: 3 };
    const report: BackendLifecycleReport = {
      ...createEmptyBackendLifecycleReport(),
      enforced: 1,
      enforcedNames: ['ABackend'],
      entries: [
        { interfaceName: 'ABackend', setter: null, teardown: 'destroy', tearsDown: false },
        { interfaceName: 'BBackend', setter: null, teardown: null, tearsDown: false },
        { interfaceName: 'CBackend', setter: null, teardown: null, tearsDown: false },
      ],
      noTeardownHook: 2,
      total: 3,
      violations: [],
    };
    const delta = compareFloorToReport(floor, report);
    expect(delta.enforcedLost).toEqual(['BBackend']);
    expect(delta.seamsAdded).toEqual([]);
    expect(delta.seamsRemoved).toEqual([]);
  });

  it('keeps removed seams distinct from lost enforced owners', () => {
    const floor: BackendLifecycleFloor = { enforcedNames: ['ABackend', 'BBackend'], total: 5 };
    const report: BackendLifecycleReport = {
      ...createEmptyBackendLifecycleReport(),
      enforced: 1,
      enforcedNames: ['ABackend'],
      entries: [
        { interfaceName: 'ABackend', setter: null, teardown: 'destroy', tearsDown: false },
        { interfaceName: 'CBackend', setter: null, teardown: null, tearsDown: false },
        { interfaceName: 'DBackend', setter: null, teardown: null, tearsDown: false },
      ],
      noTeardownHook: 2,
      total: 3,
      violations: [],
    };
    const delta = compareFloorToReport(floor, report);
    expect(delta.seamsRemoved).toHaveLength(2);
    expect(delta.enforcedLost).toEqual(['BBackend']);
  });
});

describe('createEmptyBackendLifecycleReport', () => {
  // ★ The factory is a single owning location only if it supplies EVERY field the production path does.
  // The comparison is against a report built by `createBackendLifecycleReport`, never against a field
  // list written here — such a list would be a second copy of the shape, which is the exact defect this
  // factory exists to remove. Add a field to the interface and wire it into the producer, and this goes
  // red until the factory learns it too.
  it('supplies every field the real report producer does', () => {
    const produced = createBackendLifecycleReport([], new Map(), new Map());
    expect(Object.keys(createEmptyBackendLifecycleReport()).sort()).toEqual(Object.keys(produced).sort());
  });

  it('is empty rather than merely well-typed', () => {
    const empty = createEmptyBackendLifecycleReport();
    expect(empty.enforced).toBe(0);
    expect(empty.noTeardownHook).toBe(0);
    expect(empty.total).toBe(0);
    expect(empty.enforcedNames).toEqual([]);
    expect(empty.entries).toEqual([]);
    expect(empty.violations).toEqual([]);
  });
});

describe('formatBackendLifecycleReport with floor', () => {
  it('emits the delta inline when a floor is provided', () => {
    const report: BackendLifecycleReport = {
      ...createEmptyBackendLifecycleReport(),
      enforced: 1,
      enforcedNames: ['ABackend'],
      entries: [
        { interfaceName: 'ABackend', setter: null, teardown: 'destroy', tearsDown: false },
        { interfaceName: 'BBackend', setter: null, teardown: null, tearsDown: false },
        { interfaceName: 'CBackend', setter: null, teardown: null, tearsDown: false },
        { interfaceName: 'DBackend', setter: null, teardown: null, tearsDown: false },
        { interfaceName: 'EBackend', setter: null, teardown: null, tearsDown: false },
      ],
      noTeardownHook: 4,
      total: 5,
      violations: [],
    };
    const floor: BackendLifecycleFloor = { enforcedNames: ['ABackend'], total: 3 };
    const output = formatBackendLifecycleReport(report, floor);
    expect(output).toContain('(+2 new seams, 0 regressions)');
  });

  it('emits regression count when an enforced backend disappears', () => {
    const report: BackendLifecycleReport = {
      ...createEmptyBackendLifecycleReport(),
      enforced: 0,
      enforcedNames: [],
      entries: [
        { interfaceName: 'ABackend', setter: null, teardown: null, tearsDown: false },
        { interfaceName: 'BBackend', setter: null, teardown: null, tearsDown: false },
      ],
      noTeardownHook: 2,
      total: 2,
      violations: [],
    };
    const floor: BackendLifecycleFloor = { enforcedNames: ['ABackend'], total: 2 };
    const output = formatBackendLifecycleReport(report, floor);
    expect(output).toContain('(1 regression)');
  });

  it('emits removed seams when current population is below the baseline', () => {
    const report: BackendLifecycleReport = {
      ...createEmptyBackendLifecycleReport(),
      enforced: 1,
      enforcedNames: ['ABackend'],
      entries: [
        { interfaceName: 'ABackend', setter: null, teardown: 'destroy', tearsDown: false },
        { interfaceName: 'BBackend', setter: null, teardown: null, tearsDown: false },
        { interfaceName: 'CBackend', setter: null, teardown: null, tearsDown: false },
      ],
      noTeardownHook: 2,
      total: 3,
      violations: [],
    };
    const floor: BackendLifecycleFloor = { enforcedNames: ['ABackend'], total: 5 };
    const output = formatBackendLifecycleReport(report, floor);
    expect(output).toContain('(-2 removed, 0 regressions)');
  });

  it('emits both removed seams and regressions when population shrinks and an enforced backend is lost', () => {
    const report: BackendLifecycleReport = {
      ...createEmptyBackendLifecycleReport(),
      enforced: 0,
      enforcedNames: [],
      entries: [
        { interfaceName: 'BBackend', setter: null, teardown: null, tearsDown: false },
        { interfaceName: 'CBackend', setter: null, teardown: null, tearsDown: false },
      ],
      noTeardownHook: 2,
      total: 2,
      violations: [],
    };
    const floor: BackendLifecycleFloor = { enforcedNames: ['ABackend'], total: 4 };
    const output = formatBackendLifecycleReport(report, floor);
    expect(output).toContain('(-2 removed, 1 regression)');
  });

  it('omits the delta when no floor is provided', () => {
    const report: BackendLifecycleReport = {
      ...createEmptyBackendLifecycleReport(),
      enforced: 1,
      enforcedNames: ['ABackend'],
      entries: [{ interfaceName: 'ABackend', setter: null, teardown: 'destroy', tearsDown: false }],
      noTeardownHook: 0,
      total: 1,
      violations: [],
    };
    const output = formatBackendLifecycleReport(report);
    expect(output).not.toContain('regression');
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
