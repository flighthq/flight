import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  auditEffectBackend,
  collectRegistrarKindConstants,
  collectRegistrarOwnership,
  collectRegistrarRuntimeDeclarations,
  collectReachabilityLanes,
  defaultCompositionSymbols,
  effectReachabilitySymbols,
} from './reachability-core';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('source-derived capability reachability', () => {
  it('records runtime registrar parameters including defaults and function-valued exports', () => {
    const fixture = entries(
      `
      export function registerDefault(state: FixtureState = createState(), enabled: boolean = true): void {}
      export const registerCallback = (kind: string, callback: FixtureCallback): void => {};
    `,
      [],
    );

    expect(collectRegistrarRuntimeDeclarations({ packageName: 'fixture', sourceFiles: fixture.sourceFiles })).toEqual([
      {
        packageName: 'fixture',
        parameters: [
          { defaulted: false, name: 'kind', typeNames: ['string'] },
          { defaulted: false, name: 'callback', typeNames: ['FixtureCallback'] },
        ],
        registrar: 'registerCallback',
        sourceFile: fixture.sourceFiles[0],
      },
      {
        packageName: 'fixture',
        parameters: [
          { defaulted: true, name: 'state', typeNames: ['FixtureState'] },
          { defaulted: true, name: 'enabled', typeNames: ['boolean'] },
        ],
        registrar: 'registerDefault',
        sourceFile: fixture.sourceFiles[0],
      },
    ]);
  });

  it('records every readable registrar mapping and reports every unreadable registrar', () => {
    const fixture = entries(
      `
      export const defaultGlBlurEffectRunner = () => {};
      export const defaultGlBloomEffectRunner = () => {};
      export function registerGlRenderEffect(state: object, kind: string, runner: Function): void {
        registry.set(kind, runner);
      }
      export function registerGlBlurEffect(state: object): void {
        registerGlRenderEffect(state, 'BlurEffect', defaultGlBlurEffectRunner);
      }
      export function registerGlPair(state: object): void {
        registerGlRenderEffect(state, 'BlurEffect', defaultGlBlurEffectRunner);
        registerGlRenderEffect(state, 'BloomEffect', defaultGlBloomEffectRunner);
      }
      export function registerGlBundle(state: object): void {
        registerGlBlurEffect(state);
      }
      function registerPrivateHelper(): void {}
    `,
      [],
    );

    expect(collectRegistrarOwnership({ packageName: 'fixture', sourceFiles: fixture.sourceFiles })).toEqual([
      {
        packageName: 'fixture',
        registrar: 'registerGlBlurEffect',
        status: 'catalogued',
        mechanismShape: null,
        uncataloguedBucket: null,
        door: 'registerGlRenderEffect',
        kind: 'BlurEffect',
        implementation: 'defaultGlBlurEffectRunner',
      },
      {
        packageName: 'fixture',
        registrar: 'registerGlBundle',
        status: 'UNCATALOGUED',
        mechanismShape: null,
        uncataloguedBucket: 'not-kind-registration',
        door: null,
        kind: null,
        implementation: null,
      },
      {
        packageName: 'fixture',
        registrar: 'registerGlPair',
        status: 'catalogued',
        mechanismShape: null,
        uncataloguedBucket: null,
        door: 'registerGlRenderEffect',
        kind: 'BloomEffect',
        implementation: 'defaultGlBloomEffectRunner',
      },
      {
        packageName: 'fixture',
        registrar: 'registerGlPair',
        status: 'catalogued',
        mechanismShape: null,
        uncataloguedBucket: null,
        door: 'registerGlRenderEffect',
        kind: 'BlurEffect',
        implementation: 'defaultGlBlurEffectRunner',
      },
      {
        packageName: 'fixture',
        registrar: 'registerGlRenderEffect',
        status: 'mechanism',
        mechanismShape: 'caller-supplied-kind',
        uncataloguedBucket: null,
        door: null,
        kind: null,
        implementation: null,
      },
    ]);
  });

  it('does not guess a mapping when the kind or implementation is not a readable literal-identifier pair', () => {
    const fixture = entries(
      `
      export function registerGlComputedKind(state: object): void {
        registerGlRenderEffect(state, BlurEffectKind, defaultGlBlurEffectRunner);
      }
      export function registerGlComputedImplementation(state: object): void {
        registerGlRenderEffect(state, 'BlurEffect', createBlurRunner());
      }
    `,
      [],
    );

    expect(collectRegistrarOwnership({ packageName: 'fixture', sourceFiles: fixture.sourceFiles })).toEqual([
      {
        packageName: 'fixture',
        registrar: 'registerGlComputedImplementation',
        status: 'UNCATALOGUED',
        mechanismShape: null,
        uncataloguedBucket: 'implementation-call-result',
        door: null,
        kind: null,
        implementation: null,
      },
      {
        packageName: 'fixture',
        registrar: 'registerGlComputedKind',
        status: 'UNCATALOGUED',
        mechanismShape: null,
        uncataloguedBucket: 'kind-identifier',
        door: null,
        kind: null,
        implementation: null,
      },
    ]);
  });

  it('folds unique exported string constants, object members, computed members, and import aliases', () => {
    const fixture = entries(
      [
        `
        import { FixtureKinds as AliasedKinds, FooKind as AliasedFooKind } from './kinds';
        export function registerAliasedIdentifier(state: object): void {
          registerDoor(state, AliasedFooKind, fooImplementation);
        }
        export function registerAliasedMember(state: object): void {
          registerDoor(state, AliasedKinds.Bar, barImplementation);
        }
        export function registerComputedMember(state: object): void {
          registerDoor(state, AliasedKinds['Baz'], bazImplementation);
        }
      `,
        `
        export const FooKind = 'Fixture.Foo';
        export const FixtureKinds = { Bar: 'Fixture.Bar', ['Baz']: 'Fixture.Baz' } as const;
      `,
      ],
      [],
    );
    const constants = collectRegistrarKindConstants(fixture.sourceFiles);

    expect(collectRegistrarOwnership({ constants, packageName: 'fixture', sourceFiles: fixture.sourceFiles })).toEqual([
      {
        packageName: 'fixture',
        registrar: 'registerAliasedIdentifier',
        status: 'catalogued',
        mechanismShape: null,
        uncataloguedBucket: null,
        door: 'registerDoor',
        kind: 'Fixture.Foo',
        implementation: 'fooImplementation',
      },
      {
        packageName: 'fixture',
        registrar: 'registerAliasedMember',
        status: 'catalogued',
        mechanismShape: null,
        uncataloguedBucket: null,
        door: 'registerDoor',
        kind: 'Fixture.Bar',
        implementation: 'barImplementation',
      },
      {
        packageName: 'fixture',
        registrar: 'registerComputedMember',
        status: 'catalogued',
        mechanismShape: null,
        uncataloguedBucket: null,
        door: 'registerDoor',
        kind: 'Fixture.Baz',
        implementation: 'bazImplementation',
      },
    ]);
  });

  it('reports caller-supplied direct and batch registrars separately from hidden arrays', () => {
    const fixture = entries(
      `
      export function registerDirect(kind: string, implementation: object): void {
        registry.set(kind, implementation);
      }
      export function registerNormalized(name: string, implementation: object): void {
        const normalized = name.toLowerCase();
        registry.set(normalized, implementation);
      }
      export function registerPersistent(state: object, kind: string, implementation: object): void {
        state.registries.renderers = withRegistryTableEntry(state.registries.renderers, kind, implementation);
      }
      export function registerBatch(entries: ReadonlyArray<readonly [string, object]>): void {
        for (const [kind, implementation] of entries) registry.set(kind, implementation);
      }
      export function registerHidden(): void {
        for (const [kind, implementation] of defaultEntries) registry.set(kind, implementation);
      }
    `,
      [],
    );

    expect(collectRegistrarOwnership({ packageName: 'fixture', sourceFiles: fixture.sourceFiles })).toMatchObject([
      {
        registrar: 'registerBatch',
        status: 'mechanism',
        mechanismShape: 'caller-supplied-batch',
        uncataloguedBucket: null,
      },
      {
        registrar: 'registerDirect',
        status: 'mechanism',
        mechanismShape: 'caller-supplied-kind',
        uncataloguedBucket: null,
      },
      {
        registrar: 'registerHidden',
        status: 'UNCATALOGUED',
        mechanismShape: null,
        uncataloguedBucket: 'hidden-loop-or-array',
      },
      {
        registrar: 'registerNormalized',
        status: 'mechanism',
        mechanismShape: 'caller-supplied-kind',
        uncataloguedBucket: null,
      },
      {
        registrar: 'registerPersistent',
        status: 'mechanism',
        mechanismShape: 'caller-supplied-kind',
        uncataloguedBucket: null,
      },
    ]);
  });

  it('partitions unreadable registrars by the ruled syntax taxonomy and precedence', () => {
    const fixture = entries(
      `
      export function registerKindIdentifier(state: object): void {
        registerDoor(state, FooKind, implementation);
      }
      export function registerKindMember(state: object): void {
        registerDoor(state, Kinds.Foo, implementation);
      }
      export function registerInlineImplementation(state: object): void {
        registerDoor(state, FooKind, () => {});
      }
      export function registerObjectImplementation(state: object): void {
        registerDoor(state, FooKind, { run() {} });
      }
      export function registerCallImplementation(state: object): void {
        registerDoor(state, FooKind, createImplementation());
      }
      export function registerMemberCallee(): void {
        registry.set(FooKind, implementation);
      }
      export function registerLoop(state: object): void {
        for (const [kind, implementation] of entries) registerDoor(state, kind, implementation);
      }
      export function registerArray(state: object): void {
        registerMany(state, [[FooKind, implementation]]);
      }
      export function registerBackends(backend: object): void {
        setBackend(backend);
      }
    `,
      [],
    );

    const buckets = collectRegistrarOwnership({ packageName: 'fixture', sourceFiles: fixture.sourceFiles }).map(
      ({ registrar, uncataloguedBucket }) => ({ registrar, uncataloguedBucket }),
    );
    expect(buckets).toEqual([
      { registrar: 'registerArray', uncataloguedBucket: 'hidden-loop-or-array' },
      { registrar: 'registerBackends', uncataloguedBucket: 'not-kind-registration' },
      { registrar: 'registerCallImplementation', uncataloguedBucket: 'implementation-call-result' },
      { registrar: 'registerInlineImplementation', uncataloguedBucket: 'implementation-inline' },
      { registrar: 'registerKindIdentifier', uncataloguedBucket: 'kind-identifier' },
      { registrar: 'registerKindMember', uncataloguedBucket: 'kind-member-or-computed' },
      { registrar: 'registerLoop', uncataloguedBucket: 'hidden-loop-or-array' },
      { registrar: 'registerMemberCallee', uncataloguedBucket: 'callee-expression' },
      { registrar: 'registerObjectImplementation', uncataloguedBucket: 'implementation-inline' },
    ]);
  });

  it('accepts a mapped public registrar and public raw runner', () => {
    const fixture = entries(
      `
      export const defaultGlBlurEffectRunner = () => {};
      export function registerGlRenderEffect(state: object, kind: string, runner: Function): void {}
      export function registerGlBlurEffect(state: object): void {
        registerGlRenderEffect(state, 'BlurEffect', defaultGlBlurEffectRunner);
      }
    `,
      ['registerGlRenderEffect', 'registerGlBlurEffect', 'defaultGlBlurEffectRunner'],
    );

    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toEqual([]);
  });

  it('rejects an unregistered passthrough runner as a false capability', () => {
    const fixture = entries('export const defaultGlTaaEffectRunner = () => {};', ['defaultGlTaaEffectRunner']);
    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toMatchObject([
      { symbol: 'defaultGlTaaEffectRunner', rule: 'missing-registration' },
    ]);
  });

  it('rejects a registrar without a real runner as a false capability claim', () => {
    const fixture = entries(
      `
      export function registerGlRenderEffect(state: object, kind: string, runner: Function): void {}
      export function registerGlTaaEffect(state: object): void {
        registerGlRenderEffect(state, 'TaaEffect', defaultGlTaaEffectRunner);
      }
    `,
      ['registerGlRenderEffect', 'registerGlTaaEffect'],
    );
    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toMatchObject([
      { symbol: 'registerGlTaaEffect', rule: 'missing-runner' },
    ]);
  });

  it('rejects a register declaration that maps the wrong kind', () => {
    const fixture = entries(
      `
      export const defaultGlBlurEffectRunner = () => {};
      export function registerGlRenderEffect(state: object, kind: string, runner: Function): void {}
      export function registerGlBlurEffect(state: object): void {
        registerGlRenderEffect(state, 'BloomEffect', defaultGlBlurEffectRunner);
      }
    `,
      ['registerGlRenderEffect', 'registerGlBlurEffect', 'defaultGlBlurEffectRunner'],
    );
    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toMatchObject([
      { symbol: 'registerGlBlurEffect', rule: 'registration-mapping' },
    ]);
  });

  it('tracks lane placement without treating it as a hard invariant', () => {
    const fixture = entries(
      `
      export const defaultGlBitmapTextRenderer = {};
      export const defaultGlBlurEffectRunner = () => {};
      export function registerGlRenderEffect(): void {}
      export function registerGlBlurEffect(): void {}
    `,
      ['registerGlRenderEffect', 'registerGlBlurEffect'],
    );
    const symbols = new Set([
      ...effectReachabilitySymbols('gl', fixture.sourceFiles),
      ...defaultCompositionSymbols(fixture.sourceFiles),
    ]);

    expect(collectReachabilityLanes({ packageName: 'fixture', ...fixture, symbols })).toEqual([
      { packageName: 'fixture', symbol: 'defaultGlBitmapTextRenderer', dot: false, contract: true },
      { packageName: 'fixture', symbol: 'defaultGlBlurEffectRunner', dot: false, contract: true },
      { packageName: 'fixture', symbol: 'registerGlBlurEffect', dot: true, contract: true },
      { packageName: 'fixture', symbol: 'registerGlRenderEffect', dot: true, contract: true },
    ]);
  });
});

function entries(sourceText: string | readonly string[], publicValues: readonly string[]) {
  const directory = mkdtempSync(join(tmpdir(), 'flight-reachability-'));
  temporaryDirectories.push(directory);
  const sourceTexts = typeof sourceText === 'string' ? [sourceText] : sourceText;
  const sourceFiles = sourceTexts.map((text, index) => {
    const source = join(directory, index === 0 ? 'source.ts' : `source-${index}.ts`);
    writeFileSync(source, text);
    return source;
  });
  const contractEntry = join(directory, 'contract.ts');
  const publicEntry = join(directory, 'index.ts');
  writeFileSync(contractEntry, "export * from './source';");
  writeFileSync(publicEntry, `export { ${publicValues.join(', ')} } from './contract';`);
  return { contractEntry, publicEntry, sourceFiles };
}
