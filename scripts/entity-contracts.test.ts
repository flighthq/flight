import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import {
  checkEntityContracts,
  createExportedCreateRemediationReport,
  formatEntityContractReport,
} from './entity-contracts';

describe('checkEntityContracts', () => {
  it('accepts intentional Entity intersections and closed discriminated refinements', () => {
    const report = checkFixture({
      'packages/example/src/example.ts': [
        "import { createEntity } from '../../entity/src/entity';",
        "import type { Entity } from '../../types/src/Entity';",
        'interface Shader { program: object }',
        'type BitmapShader = Entity & Shader & { readonly location: number };',
        'export function createBitmapShader(): BitmapShader {',
        '  return createEntity({ program: {}, location: 1 });',
        '}',
      ].join('\n'),
      'packages/types/src/Variant.ts': [
        "interface Common { readonly kind: 'a' | 'b' }",
        'export type Variant =',
        "  | (Common & { readonly kind: 'a'; a: number })",
        "  | (Common & { readonly kind: 'b'; b: string });",
      ].join('\n'),
    });

    expect(report.candidateIntersections).toBe(3);
    expect(report.issues).toEqual([]);
  });

  it('classifies the exported EntityRuntime second root semantically', () => {
    const report = checkFixture({
      'packages/example/src/contract.ts': "export * from './runtime';",
      'packages/example/src/runtime.ts': [
        "import type { ExampleRuntime } from '../../types/src/ExampleRuntime';",
        'declare function allocateRuntime(): ExampleRuntime;',
        'export function createExampleRuntime(): ExampleRuntime {',
        '  return allocateRuntime();',
        '}',
      ].join('\n'),
      'packages/types/src/ExampleRuntime.ts': [
        "import type { EntityRuntime } from './Entity';",
        'export interface ExampleRuntime extends EntityRuntime { cache: number }',
      ].join('\n'),
    });

    expect(report.runtimeCreateExceptions).toEqual(['@flighthq/example createExampleRuntime']);
    expect(report.exportedCreateRuntimeReturns).toBe(1);
    expect(report.issues).toEqual([]);
  });

  it('reports exported create candidates for classification and excludes clone functions', () => {
    const files = {
      'packages/example/src/contract.ts': "export { clonePlain, createPlain } from './example';",
      'packages/example/src/example.ts': [
        'interface Plain { value: number }',
        'export function clonePlain(): Plain { return { value: 1 }; }',
        'export declare function createPlain(): Promise<Plain | undefined>;',
      ].join('\n'),
    };
    const report = checkFixture(files);

    expect(report.exportedCreateFunctions).toBe(1);
    expect(report.issues).toEqual([]);
    expect(report.advisories).toHaveLength(1);
    expect(report.advisories[0]).toMatchObject({
      name: '@flighthq/example createPlain',
      returnTypes: ['Plain'],
      rule: 'exported-create-return',
    });
  });

  it('automatically excludes arrays, callable values, and external native objects', () => {
    const report = checkFixture({
      'packages/example/src/contract.ts': "export * from './example';",
      'packages/example/src/example.ts': [
        'type RandomSource = () => number;',
        'export declare function createValues(): number[];',
        'export declare function createRandomSource(): RandomSource;',
        'export declare function createCanvas(): HTMLCanvasElement;',
        'export declare function createLookup(): Map<string, string>;',
      ].join('\n'),
    });

    expect(report.exportedCreateCandidates).toEqual([]);
    expect(report.exportedCreateExclusions).toHaveLength(4);
    expect(Object.fromEntries(report.exportedCreateExclusions.map(({ name, reasons }) => [name, reasons]))).toEqual({
      '@flighthq/example createCanvas': ['external-native'],
      '@flighthq/example createLookup': ['external-native'],
      '@flighthq/example createRandomSource': ['callable'],
      '@flighthq/example createValues': ['array-or-tuple'],
    });
  });

  it('keeps repository structures wrapped in external utility aliases as candidates', () => {
    const report = checkFixture({
      'packages/example/src/contract.ts': "export * from './example';",
      'packages/example/src/example.ts': [
        'interface Capabilities { readonly query?: object }',
        'type Baseline = Record<string, number>;',
        'export declare function createBaseline(): Baseline;',
        'export declare function createCapabilities(): Required<Pick<Capabilities, "query">>;',
        'export declare function createOutcome(): Readonly<{ readonly reason: "created" }>;',
        'export declare function createReadonlyCanvas(): Readonly<HTMLCanvasElement>;',
      ].join('\n'),
    });

    expect(report.exportedCreateCandidates.map(({ name }) => name).sort()).toEqual([
      '@flighthq/example createBaseline',
      '@flighthq/example createCapabilities',
      '@flighthq/example createOutcome',
    ]);
    expect(report.exportedCreateExclusions).toHaveLength(1);
    expect(report.exportedCreateExclusions[0]).toMatchObject({
      name: '@flighthq/example createReadonlyCanvas',
      reasons: ['external-native'],
    });
  });

  it('excludes exported create helpers by semantic source role', () => {
    const report = checkFixture({
      'packages/example/src/contract.ts': "export * from './exampleTestSupport';",
      'packages/example/src/exampleTestSupport.ts': [
        'interface Fixture { value: number }',
        'export declare function createFixture(): Fixture;',
      ].join('\n'),
    });

    expect(report.exportedCreateFunctions).toBe(0);
    expect(report.exportedCreateCandidates).toEqual([]);
    expect(report.exportedCreateExclusions).toEqual([]);
  });

  it('requires a direct public marker for repository-owned non-SDK create results', () => {
    const report = checkFixture({
      'packages/example/src/contract.ts': "export * from './example';",
      'packages/example/src/example.ts': [
        "import type { NonEntityCreateResult } from '../../types/src/NonEntityCreateResult';",
        'interface Descriptor { readonly value: number }',
        "type IndirectDescriptor = NonEntityCreateResult<Descriptor, 'descriptor'>;",
        "export declare function createDescriptor(): Promise<NonEntityCreateResult<Descriptor, 'descriptor'> | null>;",
        'export declare function createIndirectDescriptor(): IndirectDescriptor;',
      ].join('\n'),
    });

    expect(report.exportedCreateExclusions).toHaveLength(1);
    expect(report.exportedCreateExclusions[0]).toMatchObject({
      name: '@flighthq/example createDescriptor',
      reasons: ['descriptor'],
      source: 'marker',
    });
    expect(report.exportedCreateCandidates).toHaveLength(1);
    expect(report.exportedCreateCandidates[0]?.name).toBe('@flighthq/example createIndirectDescriptor');
  });

  it('rejects unknown marker tags and wrappers around Entity roots', () => {
    const report = checkFixture({
      'packages/example/src/contract.ts': "export * from './example';",
      'packages/example/src/example.ts': [
        "import type { Entity, EntityRuntime } from '../../types/src/Entity';",
        "import type { NonEntityCreateResult } from '../../types/src/NonEntityCreateResult';",
        'interface Descriptor { readonly value: number }',
        "export declare function createUnknown(): NonEntityCreateResult<Descriptor, 'escape'>;",
        "export declare function createMarkedEntity(): NonEntityCreateResult<Entity, 'descriptor'>;",
        "export declare function createMarkedRuntime(): NonEntityCreateResult<Promise<EntityRuntime>, 'options'>;",
        "export declare function createMixed(): NonEntityCreateResult<Entity | Descriptor, 'type-only'>;",
      ].join('\n'),
    });

    expect(report.issues).toHaveLength(4);
    expect(report.issues.every(({ rule }) => rule === 'invalid-non-entity-create-result')).toBe(true);
    expect(report.issues.map(({ detail }) => detail)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('cannot wrap Entity or EntityRuntime'),
        expect.stringContaining('reason must be exactly descriptor, options, or type-only'),
      ]),
    );
  });

  it('partitions the complete exported create remediation census by package', () => {
    const report = checkFixture({
      'packages/alpha/src/contract.ts': "export { createZulu, createAlpha } from './values';",
      'packages/alpha/src/values.ts': [
        'interface Plain { value: number }',
        'export declare function createZulu(): Plain;',
        'export declare function createAlpha(): Plain;',
      ].join('\n'),
      'packages/beta/src/index.ts': "export { createBeta } from './value';",
      'packages/beta/src/value.ts': [
        'interface Plain { value: number }',
        'export declare function createBeta(): Plain;',
      ].join('\n'),
    });
    const remediation = createExportedCreateRemediationReport(report);

    expect(remediation).toMatchObject({
      candidates: 3,
      excludedFactoryPrefixes: ['clone'],
      mode: 'report-only',
      semanticSecondRoots: ['EntityRuntime'],
      total: 3,
    });
    expect(remediation.packages.map(({ packageName, candidates }) => [packageName, candidates.length])).toEqual([
      ['@flighthq/alpha', 2],
      ['@flighthq/beta', 1],
    ]);
    expect(remediation.packages[0]?.candidates.map(({ name }) => name)).toEqual([
      '@flighthq/alpha createAlpha',
      '@flighthq/alpha createZulu',
    ]);
    const formatted = formatEntityContractReport(report, process.cwd());
    expect(formatted).toContain('3 report-only exported create-return classification candidates');
    expect(formatted).toContain('@flighthq/alpha (2):');
    expect(formatted).toContain('@flighthq/alpha createZulu');
    expect(formatted).toContain('@flighthq/beta (1):');
  });

  it('checks exported create declarations independently of construction flow', () => {
    const report = checkFixture({
      'packages/example/src/contract.ts': "export * from './example';",
      'packages/example/src/example.ts': [
        "import type { Entity } from '../../types/src/Entity';",
        'interface Base extends Entity { value: number }',
        'type EntityAlias = Base;',
        'type TransitiveEntityAlias = EntityAlias;',
        'export function createSpecialized(): TransitiveEntityAlias {',
        '  return { value: 1 } as TransitiveEntityAlias;',
        '}',
        'export declare function createMaybe(): Promise<TransitiveEntityAlias | null | false>;',
      ].join('\n'),
    });

    expect(report.exportedCreateEntityReturns).toBe(2);
    expect(report.issues).toEqual([]);
    expect(report.advisories).toEqual([]);
  });

  it('rejects optional and writable inline redeclarations of stronger base properties', () => {
    const report = checkFixture({
      'packages/example/src/example.ts': [
        'interface Base { readonly required: number }',
        'type Specialized = Base & { required?: number };',
      ].join('\n'),
    });

    expect(rules(report)).toEqual(['readonly-redeclaration', 'redundant-optional-property']);
  });

  it('rejects exact redundant members but accepts discriminant narrowing', () => {
    const report = checkFixture({
      'packages/example/src/example.ts': [
        "interface Base { readonly kind: 'a' | 'b'; value: number }",
        "type Narrowed = Base & { readonly kind: 'a' };",
        'type Repeated = Base & { value: number };',
      ].join('\n'),
    });

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({ name: 'value', rule: 'redundant-inline-member' });
  });

  it('rejects writable index redeclarations of readonly base indexes', () => {
    const report = checkFixture({
      'packages/example/src/example.ts': [
        'interface Values { readonly [index: number]: number }',
        'type MutableView = Values & { [index: number]: number };',
      ].join('\n'),
    });

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({ name: '[number]', rule: 'readonly-redeclaration' });
  });

  it('resolves readonly members through mapped type aliases', () => {
    const report = checkFixture({
      'packages/example/src/example.ts': [
        'interface Base { value: number }',
        'type MutableView = Readonly<Base> & { value: number };',
      ].join('\n'),
    });

    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toMatchObject({ name: 'value', rule: 'readonly-redeclaration' });
  });

  it('reports implementation-local structural aliases exposed by package lanes', () => {
    const report = checkFixture({
      'packages/example/src/contract.ts': "export * from './example';",
      'packages/example/src/example.ts': [
        'interface Base { value: number }',
        'type HiddenResult = Base & { extra: number };',
        'export declare function getHiddenResult(): Promise<HiddenResult>;',
      ].join('\n'),
    });

    expect(report.issues).toEqual([]);
    expect(report.advisories).toHaveLength(1);
    expect(report.advisories[0]).toMatchObject({ name: 'HiddenResult', rule: 'exported-local-alias' });
  });

  it('reports createEntity fields hidden outside the declared Entity without failing the gate', () => {
    const report = checkFixture({
      'packages/example/src/example.ts': [
        "import { createEntity } from '../../entity/src/entity';",
        "import type { Entity } from '../../types/src/Entity';",
        'interface PublicData extends Entity { visible: number }',
        'type PublicDataWithHidden = PublicData & { hidden: number };',
        'export function createPublicData(): PublicData {',
        '  return createEntity({ visible: 1, hidden: 2 });',
        '}',
      ].join('\n'),
    });

    expect(report.issues).toEqual([]);
    expect(report.advisories).toHaveLength(1);
    expect(report.advisories[0]).toMatchObject({ name: 'createPublicData', rule: 'hidden-entity-field' });
  });
});

describe('formatEntityContractReport', () => {
  it('reports the derived populations, exceptions, and exact failures', () => {
    const report = checkFixture({
      'packages/example/src/example.ts': [
        'interface Base { value: number }',
        'type Specialized = Base & { value?: number };',
      ].join('\n'),
    });
    const text = formatEntityContractReport(report, process.cwd());

    expect(text).toContain('1 specializations');
    expect(text).toContain('Exported create-return candidate census: 0/0');
    expect(text).toContain('[redundant-optional-property]');
  });
});

function checkFixture(files: Readonly<Record<string, string>>) {
  const project = new Project({
    compilerOptions: { strict: true },
    useInMemoryFileSystem: true,
  });
  const entitySource = project.createSourceFile(
    '/packages/types/src/Entity.ts',
    [
      "export interface EntityRuntime { readonly __runtime: 'runtime' }",
      "export interface Entity { readonly __entity: 'entity'; readonly runtime: EntityRuntime }",
    ].join('\n'),
  );
  const markerSource = project.createSourceFile(
    '/packages/types/src/NonEntityCreateResult.ts',
    [
      "export type NonEntityCreateResult<Type, Kind extends 'descriptor' | 'options' | 'type-only'> =",
      "  Kind extends 'descriptor' | 'options' | 'type-only' ? Type : never;",
    ].join('\n'),
  );
  const createEntitySource = project.createSourceFile(
    '/packages/entity/src/entity.ts',
    [
      "import type { Entity } from '../../types/src/Entity';",
      'export declare function createEntity<Type extends object>(obj: Type): Type & Entity;',
    ].join('\n'),
  );
  const sourceFiles = [
    entitySource,
    markerSource,
    createEntitySource,
    ...Object.entries(files).map(([path, text]) => project.createSourceFile(`/${path}`, text)),
  ];
  project.resolveSourceFileDependencies();
  return checkEntityContracts({ project, root: '/', sourceFiles });
}

function rules(report: ReturnType<typeof checkFixture>): string[] {
  return report.issues.map((entry) => entry.rule).sort();
}
