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
} from './reachability-core.ts';

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
      export const glBlurEffectRunner = () => {};
      export const glBloomEffectRunner = () => {};
      export function registerGlEffect(state: object, kind: string, runner: Function): void {
        registry.set(kind, runner);
      }
      export function registerGlBlurEffect(state: object): void {
        registerGlEffect(state, 'BlurEffect', glBlurEffectRunner);
      }
      export function registerGlPair(state: object): void {
        registerGlEffect(state, 'BlurEffect', glBlurEffectRunner);
        registerGlEffect(state, 'BloomEffect', glBloomEffectRunner);
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
        door: 'registerGlEffect',
        kind: 'BlurEffect',
        implementation: 'glBlurEffectRunner',
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
        registrar: 'registerGlEffect',
        status: 'mechanism',
        mechanismShape: 'caller-supplied-kind',
        uncataloguedBucket: null,
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
        door: 'registerGlEffect',
        kind: 'BloomEffect',
        implementation: 'glBloomEffectRunner',
      },
      {
        packageName: 'fixture',
        registrar: 'registerGlPair',
        status: 'catalogued',
        mechanismShape: null,
        uncataloguedBucket: null,
        door: 'registerGlEffect',
        kind: 'BlurEffect',
        implementation: 'glBlurEffectRunner',
      },
    ]);
  });

  it('does not guess a mapping when the kind or implementation is not a readable literal-identifier pair', () => {
    const fixture = entries(
      `
      export function registerGlComputedKind(state: object): void {
        registerGlEffect(state, BlurEffectKind, glBlurEffectRunner);
      }
      export function registerGlComputedImplementation(state: object): void {
        registerGlEffect(state, 'BlurEffect', createBlurRunner());
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
        state.registries.renderers = withKindMapEntry(state.registries.renderers, kind, implementation);
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
      export const glBlurEffectRunner = () => {};
      export function registerGlEffect(state: object, kind: string, runner: Function): void {}
      export function registerGlBlurEffect(state: object): void {
        registerGlEffect(state, 'BlurEffect', glBlurEffectRunner);
      }
    `,
      ['registerGlEffect', 'registerGlBlurEffect', 'glBlurEffectRunner'],
    );

    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toEqual([]);
  });

  it('uses the WgpuEffect registration door after the backend naming cleanup', () => {
    const fixture = entries(
      `
      export const wgpuBlurEffectRunner = () => {};
      export function registerWgpuEffect(state: object, kind: string, runner: Function): void {}
      export function registerWgpuBlurEffect(state: object): void {
        registerWgpuEffect(state, 'BlurEffect', wgpuBlurEffectRunner);
      }
    `,
      ['registerWgpuEffect', 'registerWgpuBlurEffect', 'wgpuBlurEffectRunner'],
    );

    expect(auditEffectBackend({ backend: 'wgpu', ...fixture })).toEqual([]);
    expect(effectReachabilitySymbols('wgpu', fixture.sourceFiles)).toEqual(
      new Set(['registerWgpuEffect', 'wgpuBlurEffectRunner', 'registerWgpuBlurEffect']),
    );
  });

  it('rejects an unregistered passthrough runner as a false capability', () => {
    const fixture = entries('export const glTaaEffectRunner = () => {};', ['glTaaEffectRunner']);
    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toMatchObject([
      { symbol: 'glTaaEffectRunner', rule: 'missing-registration' },
    ]);
  });

  it('rejects a registrar without a real runner as a false capability claim', () => {
    const fixture = entries(
      `
      export function registerGlEffect(state: object, kind: string, runner: Function): void {}
      export function registerGlTaaEffect(state: object): void {
        registerGlEffect(state, 'TaaEffect', glTaaEffectRunner);
      }
    `,
      ['registerGlEffect', 'registerGlTaaEffect'],
    );
    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toMatchObject([
      { symbol: 'registerGlTaaEffect', rule: 'missing-runner' },
    ]);
  });

  it('rejects a register declaration that maps the wrong kind', () => {
    const fixture = entries(
      `
      export const glBlurEffectRunner = () => {};
      export function registerGlEffect(state: object, kind: string, runner: Function): void {}
      export function registerGlBlurEffect(state: object): void {
        registerGlEffect(state, 'BloomEffect', glBlurEffectRunner);
      }
    `,
      ['registerGlEffect', 'registerGlBlurEffect', 'glBlurEffectRunner'],
    );
    expect(auditEffectBackend({ backend: 'gl', ...fixture })).toMatchObject([
      { symbol: 'registerGlBlurEffect', rule: 'registration-mapping' },
    ]);
  });

  it('tracks lane placement without treating it as a hard invariant', () => {
    const fixture = entries(
      `
      export const glBitmapTextRenderer = {};
      export const glBlurEffectRunner = () => {};
      export function registerGlEffect(): void {}
      export function registerGlBlurEffect(): void {}
    `,
      ['registerGlEffect', 'registerGlBlurEffect'],
    );
    const symbols = new Set([
      ...effectReachabilitySymbols('gl', fixture.sourceFiles),
      ...defaultCompositionSymbols(fixture.sourceFiles),
    ]);

    expect(collectReachabilityLanes({ packageName: 'fixture', ...fixture, symbols })).toEqual([
      { packageName: 'fixture', symbol: 'glBitmapTextRenderer', dot: false, contract: true },
      { packageName: 'fixture', symbol: 'glBlurEffectRunner', dot: false, contract: true },
      { packageName: 'fixture', symbol: 'registerGlBlurEffect', dot: true, contract: true },
      { packageName: 'fixture', symbol: 'registerGlEffect', dot: true, contract: true },
    ]);
  });
});

describe('defaultCompositionSymbols', () => {
  it('matches concrete renderers ending in Renderer, not only NodeRenderer', () => {
    const fixture = entries(
      `
      export const glBitmapTextRenderer = {};
      export const canvasSpriteRenderer = {};
      export const wgpuShapeRenderer = {};
      export const domTextLabelRenderer = {};
    `,
      [],
    );
    const symbols = defaultCompositionSymbols(fixture.sourceFiles);
    expect(symbols).toEqual(
      new Set(['glBitmapTextRenderer', 'canvasSpriteRenderer', 'wgpuShapeRenderer', 'domTextLabelRenderer']),
    );
  });

  it('excludes EffectRunners while including other runners', () => {
    const fixture = entries(
      `
      export const glBlurEffectRunner = {};
      export const glScene2DRunner = {};
    `,
      [],
    );
    const symbols = defaultCompositionSymbols(fixture.sourceFiles);
    expect(symbols).toEqual(new Set(['glScene2DRunner']));
  });

  it('excludes exports without a backend prefix', () => {
    const fixture = entries(
      `
      export const spriteRenderer = {};
      export const NodeRenderer = {};
    `,
      [],
    );
    const symbols = defaultCompositionSymbols(fixture.sourceFiles);
    expect(symbols.size).toBe(0);
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
