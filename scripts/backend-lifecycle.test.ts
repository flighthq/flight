import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { collectFunctionBodies, collectSetterBodies, packageSourceFiles } from './backend-lifecycle-collect';
import {
  BACKEND_LIFECYCLE_SCOPE_CAVEAT,
  collectExplicitHostDestroyOwners,
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
import { collectBackendInterfaceNames, collectExplicitHostLifecycleSlots } from './backend-operation-seam-core';
import { GATE_STRUCTURAL_LIMIT } from './gate-provenance';
import { runGates } from './gateRunner';

// P4's provider-lifetime census. Population and exclusions are both derived: a backend can only leak a
// resource it owns, and ownership is the interface declaring a NO-ARGUMENT `destroy()`/`dispose()`.
describe('backend provider lifetime census', () => {
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
  //
  // ★ 2026-08-30: MenuBackend and PowerBackend are gone as INTERFACES, not as obligations. Both domains
  // split into per-capability slots, and in each the whole-provider resource landed on exactly one of
  // them — the installed native menu, and the OS keep-awake lock. The other eleven slots declared no
  // teardown because they own nothing beyond per-subscription cleanup, so removing the two old names
  // while adding the two real owners is a rename of the obligation, not a shrink of it.
  // Explicitly retired interfaces stay in the immutable historical floor but do not masquerade as
  // lifecycle regressions after a ratified capability deletion. A name belongs here only when the
  // interface itself is gone; weakening or removing a live teardown still fails below.
  const RETIRED_HISTORICAL_NAMES: readonly string[] = ['LogTransportBackend'];

  const REQUIRED_ENFORCED_NAMES: readonly string[] = [
    'AccessibilityBackend',
    'ConnectivityChangeBackend',
    'MediaSessionActionBackend',
    'MediaSessionBackend',
    'MenuApplicationBackend',
    'PowerKeepAwakeBackend',
    'ScreenQueryBackend',
    'ShortcutTriggerBackend',
    'StorageChangeBackend',
    'UpdaterCommandBackend',
  ];

  beforeAll(() => {
    const typeFiles = packageSourceFiles('types');
    expect(typeFiles.length).toBeGreaterThan(0);
    const names = collectBackendInterfaceNames(typeFiles).map((name) => `${name}Backend`);
    teardowns = collectWholeBackendTeardowns(typeFiles);
    const explicitHostSlots = new Map([
      ['ScreenQueryBackend', 'Host.screen.query'],
      ...collectExplicitHostLifecycleSlots(typeFiles, allPackageSourceFiles()),
    ]);
    report = createBackendLifecycleReport(
      names,
      teardowns,
      collectSetterBodies(),
      collectFunctionBodies(),
      collectExplicitHostDestroyOwners(allPackageSourceFiles()),
      explicitHostSlots,
    );
    formattedOutput = formatBackendLifecycleReport(report, HISTORICAL_BASELINE, RETIRED_HISTORICAL_NAMES);
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
    expect(teardowns.get('AccessibilityBackend')).toBe('destroy');
    expect(teardowns.get('ConnectivityChangeBackend')).toBe('destroy');
    expect(teardowns.get('MediaSessionBackend')).toBe('destroy');
    expect(teardowns.get('StorageChangeBackend')).toBe('destroy');
  });

  it('keeps explicit Host-provider release separate from ambient setter replacement', () => {
    const accessibility = report.entries.find((entry) => entry.interfaceName === 'AccessibilityBackend');
    expect(accessibility).toMatchObject({
      owner: 'destroyAccessibility',
      ownerKind: 'explicit-host-destroy',
      tearsDown: true,
    });
    expect(collectSetterBodies().has('setAccessibilityBackend')).toBe(false);
  });

  it('recognizes Connectivity explicit Host release without reintroducing an ambient setter', () => {
    const connectivity = report.entries.find((entry) => entry.interfaceName === 'ConnectivityChangeBackend');
    expect(connectivity).toMatchObject({
      owner: 'destroyConnectivity',
      ownerKind: 'explicit-host-destroy',
      tearsDown: true,
    });
    expect(report.violations.map((violation) => violation.interfaceName)).not.toContain('ConnectivityChangeBackend');
  });

  it('recognizes Storage explicit Host release without reintroducing an ambient setter', () => {
    const storage = report.entries.find((entry) => entry.interfaceName === 'StorageChangeBackend');
    expect(storage).toMatchObject({
      owner: 'destroyStorage',
      ownerKind: 'explicit-host-destroy',
      tearsDown: true,
    });
    expect(report.violations.map((violation) => violation.interfaceName)).not.toContain('StorageChangeBackend');
  });

  it('keeps the retired Log transport as a directly owned Entity outside the Backend census', () => {
    const fileLogSinkTypes = readFileSync(resolve('packages/types/src/FileLogSink.ts'), 'utf8');
    const logTypes = readFileSync(resolve('packages/types/src/Log.ts'), 'utf8');

    expect(report.entries.some((entry) => entry.interfaceName === 'LogTransportBackend')).toBe(false);
    expect(RETIRED_HISTORICAL_NAMES).toEqual(['LogTransportBackend']);
    expect(logTypes).toContain('export interface LogTransport extends Entity');
    expect(logTypes).toContain('flush(): Promise<LogTransportFlushOutcome>');
    expect(logTypes).toContain('destroy(): Promise<LogTransportDestroyOutcome>');
    expect(fileLogSinkTypes).toContain('export interface FileLogSink extends Entity');
  });

  it('classifies all six bounded Shell providers without false teardown rows', () => {
    const shellNames = [
      'ShellBeepBackend',
      'ShellExternalBackend',
      'ShellPathOpenBackend',
      'ShellPathRevealBackend',
      'ShellShortcutLinkBackend',
      'ShellTrashBackend',
    ];
    const shellEntries = report.entries.filter((entry) => shellNames.includes(entry.interfaceName));
    expect(shellEntries.map((entry) => entry.interfaceName).sort()).toEqual(shellNames);
    expect(shellEntries.every((entry) => entry.teardown === null && entry.owner === null && !entry.tearsDown)).toBe(
      true,
    );
    expect(report.violations.filter((violation) => shellNames.includes(violation.interfaceName))).toEqual([]);
  });

  it('keeps explicit Host-provider release separate from ambient setter replacement', () => {
    const accessibility = report.entries.find((entry) => entry.interfaceName === 'AccessibilityBackend');
    expect(accessibility).toMatchObject({
      owner: 'destroyAccessibility',
      ownerKind: 'explicit-host-destroy',
      tearsDown: true,
    });
    expect(collectSetterBodies().has('setAccessibilityBackend')).toBe(false);
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

  // The ratchet: every backend that DECLARES a whole-backend teardown must have its lifecycle owner name it.
  // That is a wiring check, not a proof that teardown is complete — see the scope caveat below.
  it('reports no unwired teardown among the backends that declare one', () => {
    expect(report.violations).toEqual([]);
    expect(hasBackendLifecycleFailure(report)).toBe(false);
  });

  // ★ THE SCOPE CAVEAT MUST SURVIVE. The printed number is read as a completeness measure by everyone
  // who has not read this file, and the live audit found rows where it is not one: `PowerBackend`'s
  // host-installed instance has no reachable teardown at all (there is no `destroyPowerBackend`, and
  // `setPowerBackend` destroys only the custom slot). Deleting the caveat to tidy the output fails here.
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
    const delta = compareFloorToReport(HISTORICAL_BASELINE, report, RETIRED_HISTORICAL_NAMES);
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

  it('pins the required enforced names to the current teardown-bearing backends', () => {
    expect(REQUIRED_ENFORCED_NAMES).toEqual([
      'AccessibilityBackend',
      'ConnectivityChangeBackend',
      'MediaSessionActionBackend',
      'MediaSessionBackend',
      'MenuApplicationBackend',
      'PowerKeepAwakeBackend',
      'ScreenQueryBackend',
      'ShortcutTriggerBackend',
      'StorageChangeBackend',
      'UpdaterCommandBackend',
    ]);
  });

  it('shows progression in the live delta when slices land beyond the historical baseline', () => {
    const delta = compareFloorToReport(HISTORICAL_BASELINE, report, RETIRED_HISTORICAL_NAMES);
    expect(delta.enforcedGained).toContain('MenuApplicationBackend');
    expect(delta.enforcedGained).toContain('PowerKeepAwakeBackend');
    expect(delta.enforcedGained).toContain('ScreenQueryBackend');
    expect(delta.enforcedLost).toEqual([]);
  });

  it('fails enforcement when a required name is missing from the live report', () => {
    const missing = REQUIRED_ENFORCED_NAMES.filter((name) => !report.enforcedNames.includes(name));
    expect(missing).toEqual([]);
  });

  it('would fail if MenuApplicationBackend were removed from the required set but still enforced', () => {
    const withoutMenu = REQUIRED_ENFORCED_NAMES.filter((name) => name !== 'MenuApplicationBackend');
    expect(withoutMenu).not.toContain('MenuApplicationBackend');
    expect(withoutMenu.length).toBe(REQUIRED_ENFORCED_NAMES.length - 1);
  });

  it('would fail if PowerKeepAwakeBackend were removed from the required set but still enforced', () => {
    const withoutPower = REQUIRED_ENFORCED_NAMES.filter((name) => name !== 'PowerKeepAwakeBackend');
    expect(withoutPower).not.toContain('PowerKeepAwakeBackend');
    expect(withoutPower.length).toBe(REQUIRED_ENFORCED_NAMES.length - 1);
  });

  it('would lose progression visibility if historical baseline absorbed Menu and Power', () => {
    const absorbedBaseline: BackendLifecycleFloor = {
      enforcedNames: [...HISTORICAL_BASELINE.enforcedNames, 'MenuApplicationBackend', 'PowerKeepAwakeBackend'].sort(),
      total: HISTORICAL_BASELINE.total,
    };
    const delta = compareFloorToReport(absorbedBaseline, report, RETIRED_HISTORICAL_NAMES);
    expect(delta.enforcedGained).not.toContain('MenuApplicationBackend');
    expect(delta.enforcedGained).not.toContain('PowerKeepAwakeBackend');
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

describe('explicit Host-provider lifecycle owners', () => {
  it('derives destroyThing(host: HasThingProvider) and rejects names without the matching Host trait', () => {
    const fixture = join(mkdtempSync(join(tmpdir(), 'backend-lifecycle-host-')), 'ExplicitHostOwnerFixture.ts');
    writeFileSync(
      fixture,
      [
        'interface HasWidgetProvider { widget: { provider: { destroy(): void } } }',
        'interface HasOtherProvider { other: { provider: { destroy(): void } } }',
        'export function destroyWidget(host: HasWidgetProvider): void { host.widget.provider.destroy(); }',
        'export function destroyMismatched(host: HasOtherProvider): void { host.other.provider.destroy(); }',
        'export function destroyWidgetBackend(host: HasWidgetProvider): void { host.widget.provider.destroy(); }',
      ].join('\n'),
      'utf-8',
    );

    const owners = collectExplicitHostDestroyOwners([fixture]);
    expect([...owners.keys()]).toEqual(['WidgetBackend']);
    expect(owners.get('WidgetBackend')?.name).toBe('destroyWidget');

    const report = createBackendLifecycleReport(
      ['WidgetBackend'],
      new Map([['WidgetBackend', 'destroy']]),
      new Map(),
      new Map(),
      owners,
    );
    expect(report.entries[0]).toEqual({
      interfaceName: 'WidgetBackend',
      owner: 'destroyWidget',
      ownerKind: 'explicit-host-destroy',
      teardown: 'destroy',
      tearsDown: true,
    });
    expect(report.violations).toEqual([]);
  });

  it('fails an explicit Host owner that does not reach the provider teardown', () => {
    const report = createBackendLifecycleReport(
      ['WidgetBackend'],
      new Map([['WidgetBackend', 'destroy']]),
      new Map(),
      new Map(),
      new Map([['WidgetBackend', { body: 'void host.widget.provider;', name: 'destroyWidget' }]]),
    );

    expect(report.violations).toEqual([
      {
        detail: 'destroyWidget owns final release without calling destroy, so the provider leaks',
        interfaceName: 'WidgetBackend',
        rule: 'teardown-unwired',
      },
    ]);
  });
});

describe('compareBackendLifecycleReports', () => {
  function syntheticReport(names: readonly string[], teardownNames: readonly string[]): BackendLifecycleReport {
    const entries = names.map((interfaceName) => ({
      interfaceName,
      owner: null,
      ownerKind: null,
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
  it('preserves an explicitly retired enforced name in history without reporting a regression', () => {
    const floor: BackendLifecycleFloor = { enforcedNames: ['LogTransportBackend'], total: 1 };
    const report = createEmptyBackendLifecycleReport();

    const delta = compareFloorToReport(floor, report, ['LogTransportBackend']);

    expect(delta.enforcedLost).toEqual([]);
    expect(delta.seamsRemoved).toHaveLength(1);
  });

  it('reports denominator shrinkage as removed seams, not a regression', () => {
    const floor: BackendLifecycleFloor = { enforcedNames: ['ABackend'], total: 5 };
    const report: BackendLifecycleReport = {
      ...createEmptyBackendLifecycleReport(),
      enforced: 1,
      enforcedNames: ['ABackend'],
      entries: [
        { interfaceName: 'ABackend', owner: null, ownerKind: null, teardown: 'destroy', tearsDown: false },
        { interfaceName: 'BBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
        { interfaceName: 'CBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
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
        { interfaceName: 'ABackend', owner: null, ownerKind: null, teardown: 'destroy', tearsDown: false },
        { interfaceName: 'BBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
        { interfaceName: 'CBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
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
        { interfaceName: 'ABackend', owner: null, ownerKind: null, teardown: 'destroy', tearsDown: false },
        { interfaceName: 'CBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
        { interfaceName: 'DBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
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
        { interfaceName: 'ABackend', owner: null, ownerKind: null, teardown: 'destroy', tearsDown: false },
        { interfaceName: 'BBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
        { interfaceName: 'CBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
        { interfaceName: 'DBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
        { interfaceName: 'EBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
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
        { interfaceName: 'ABackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
        { interfaceName: 'BBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
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
        { interfaceName: 'ABackend', owner: null, ownerKind: null, teardown: 'destroy', tearsDown: false },
        { interfaceName: 'BBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
        { interfaceName: 'CBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
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
        { interfaceName: 'BBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
        { interfaceName: 'CBackend', owner: null, ownerKind: null, teardown: null, tearsDown: false },
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
      entries: [{ interfaceName: 'ABackend', owner: null, ownerKind: null, teardown: 'destroy', tearsDown: false }],
      noTeardownHook: 0,
      total: 1,
      violations: [],
    };
    const output = formatBackendLifecycleReport(report);
    expect(output).not.toContain('regression');
  });
});

const ROOT = resolve(__dirname, '..');

function allPackageSourceFiles(): string[] {
  return packageNames().flatMap(packageSourceFiles);
}

function packageNames(): string[] {
  return readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, 'packages', entry.name, 'package.json')))
    .map((entry) => entry.name)
    .sort();
}

// The census is only as good as its reachability. Before 2026-08-30 it existed ONLY as this test file,
// so it sat outside `npm run check` — a slice deleted every ambient setter, left twelve backends
// declaring a teardown nothing ran, passed the whole-repo check and was attested green.
//
// These assertions RUN THE REAL RUNNER against the REAL gate rather than reading source text, because a
// comment or a string match cannot tell you whether the standard check would actually go red.
describe('backend-lifecycle gate wiring', () => {
  it('is registered in the standard check runner, with the real command', async () => {
    const gates = await loadCheckGates();
    const gate = gates.find((entry) => entry.label === 'backend-lifecycle:check');
    expect(gate).toBeDefined();
    expect(gate?.args).toContain('scripts/backend-lifecycle.ts');
  });

  // ★ The gate PASSES today, executed through the same runner `npm run check` uses.
  it('passes when run through the standard gate runner', async () => {
    const [result] = await runGates(
      [{ args: ['scripts/backend-lifecycle.ts'], command: 'tsx', label: 'lifecycle' }],
      1,
    );
    expect(result?.passed).toBe(true);
    expect(result?.code).toBe(0);
  }, 120_000);

  // ★ And a lifecycle RED makes the runner fail. The census entry point is pointed at a types tree with a
  // planted violation — a backend declaring destroy() with no wiring — proving the standard check would
  // go red rather than merely printing a warning. This is not an expected-red gate: nothing is left
  // failing, the fixture is temporary and the real gate above still passes.
  it('makes the standard runner fail when a backend declares an unwired teardown', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lifecycle-red-'));
    writeFileSync(
      join(dir, 'gate.ts'),
      [
        "import { createBackendLifecycleReport, hasBackendLifecycleFailure } from '" +
          join(ROOT, 'scripts', 'backend-lifecycle-core').replaceAll('\\', '/') +
          "';",
        "const report = createBackendLifecycleReport(['OrphanBackend'], new Map([['OrphanBackend', 'destroy']]), new Map());",
        'if (hasBackendLifecycleFailure(report)) process.exit(1);',
      ].join('\n'),
      'utf-8',
    );
    const [result] = await runGates([{ args: [join(dir, 'gate.ts')], command: 'tsx', label: 'lifecycle-red' }], 1);
    expect(result?.passed).toBe(false);
    expect(result?.code).toBe(1);
  }, 120_000);
});

// Loads check.ts's registrations without running any gate, by stubbing the registry it imports.
async function loadCheckGates(): Promise<readonly { args: readonly string[]; label: string }[]> {
  const source = readFileSync(join(ROOT, 'scripts', 'check.ts'), 'utf-8');
  const collected: { args: readonly string[]; label: string }[] = [];
  for (const match of source.matchAll(/add\('([^']+)',\s*'([^']+)',\s*\[([^\]]*)\]/g)) {
    const args = [...match[3].matchAll(/'([^']*)'/g)].map((a) => a[1]);
    collected.push({ args, label: match[1] });
  }
  return collected;
}
