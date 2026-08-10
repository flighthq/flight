import { describe, expect, it } from 'vitest';

import {
  captureRegistrarPairs,
  classifyPairDerivation,
  collectRegistrarTableNames,
  describeRuntimeValue,
  explainPairDerivationScope,
  findRegistrarPairCollisions,
} from './registrar-runtime-core';

describe('runtime registrar provenance', () => {
  it('attributes only writes made through a named registration door', async () => {
    const registry = new Map<string, object>();
    const implementation = {};
    const pairs = await captureRegistrarPairs(new Set(['registerDoor']), () => {
      new Map<string, object>().set('scratch', {});
      registerDoor(registry, 'Fixture.Kind', implementation);
    });

    expect(pairs).toMatchObject([
      { door: 'registerDoor', hadPrevious: false, key: 'Fixture.Kind', previous: undefined, value: implementation },
    ]);
  });

  it('retains overwrite evidence from the table before the call', async () => {
    const prior = {};
    const replacement = {};
    const registry = new Map<string, object>([['Fixture.Kind', prior]]);
    const pairs = await captureRegistrarPairs(new Set(['registerDoor']), () => {
      registerDoor(registry, 'Fixture.Kind', replacement);
    });

    expect(pairs).toMatchObject([
      { door: 'registerDoor', hadPrevious: true, key: 'Fixture.Kind', previous: prior, value: replacement },
    ]);
  });

  it('attributes an ordered-table insertion through a named door', async () => {
    const entries: unknown[] = [];
    const matches = () => true;
    const pairs = await captureRegistrarPairs(new Set(['registerOrderedDoor']), () => {
      registerOrderedDoor(entries, 'Fixture.Document', matches);
    });

    expect(pairs).toMatchObject([
      { door: 'registerOrderedDoor', hadPrevious: false, key: 'Fixture.Document', value: matches },
    ]);
  });

  it('distinguishes a surviving copied pair from a lost or non-state pair', async () => {
    const sourceRegistry = new Map<string, object>();
    const implementation = {};
    const [pair] = await captureRegistrarPairs(new Set(['registerDoor']), () => {
      registerDoor(sourceRegistry, 'Fixture.Kind', implementation);
    });
    const source = { registry: sourceRegistry };

    expect(classifyPairDerivation(pair!, source, { registry: new Map(sourceRegistry) })).toBe('survived');
    expect(classifyPairDerivation(pair!, source, { registry: new Map() })).toBe('lost');
    expect(classifyPairDerivation(pair!, null, null)).toBe('not-comparable');
    expect(explainPairDerivationScope(pair!, null, null)).toBe('module-global-no-source-state');
    expect(explainPairDerivationScope(pair!, source, null)).toBe('no-derived-state-adapter');
    expect(explainPairDerivationScope(pair!, source, { registry: new Map() })).toBeNull();
  });

  it('identifies ordered tables as exact but not derivation-comparable', async () => {
    const entries: unknown[] = [];
    const [pair] = await captureRegistrarPairs(new Set(['registerOrderedDoor']), () => {
      registerOrderedDoor(entries, 'Fixture.Document', () => true);
    });

    expect(classifyPairDerivation(pair!, { entries }, { entries: [...entries] })).toBe('not-comparable');
    expect(explainPairDerivationScope(pair!, { entries }, { entries: [...entries] })).toBe('ordered-table');
  });

  it('describes runtime identities without serializing implementation bodies', () => {
    function implementation(): void {}

    expect(describeRuntimeValue('Fixture.Kind')).toBe('Fixture.Kind');
    expect(describeRuntimeValue(implementation)).toBe('implementation');
    expect(describeRuntimeValue({ kind: 'Fixture.Object' })).toBe('{kind:Fixture.Object}');
  });

  it('names every Map and ordered table reachable from a probe root', () => {
    const direct = new Map();
    const nested = new Map();
    const ordered: unknown[] = [];

    expect([
      ...collectRegistrarTableNames([{ label: 'state', value: { direct, ordered, runtime: { nested } } }]).values(),
    ]).toEqual(['state.runtime.nested', 'state.ordered', 'state.direct']);
  });

  it('finds order-independent pair claims by different registrars', () => {
    expect(
      findRegistrarPairCollisions([
        {
          packageName: 'alpha',
          registrar: 'registerA',
          pairs: [{ door: 'registerDoor', implementation: 'a', kind: 'Shared.Kind' }],
        },
        {
          packageName: 'beta',
          registrar: 'registerB',
          pairs: [{ door: 'registerDoor', implementation: 'b', kind: 'Shared.Kind' }],
        },
      ]),
    ).toEqual([
      {
        claims: [
          { implementation: 'a', packageName: 'alpha', registrar: 'registerA' },
          { implementation: 'b', packageName: 'beta', registrar: 'registerB' },
        ],
        door: 'registerDoor',
        kind: 'Shared.Kind',
      },
    ]);
  });
});

function registerDoor(registry: Map<string, object>, kind: string, implementation: object): void {
  registry.set(kind, implementation);
}

function registerOrderedDoor(entries: unknown[], kind: string, matches: () => boolean): void {
  entries.push({ kind, matches });
}
