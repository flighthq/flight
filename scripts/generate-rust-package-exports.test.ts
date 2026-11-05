import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import {
  canonicalizeGeneratedContractImports,
  collectCompanionFileNames,
  collectCrateExportSymbols,
  compilerAliasArguments,
  compilerVisibilityArguments,
  collectContractModuleNames,
  collectExportSymbols,
  collectFlightDependencyCrates,
  collectReferencedExportNames,
  collectPublicRootNames,
  collectRustExportNames,
  collectRustPublicTypeAliasNames,
  collectRustPublicUses,
  collectStaleGeneratedFileNames,
  collectTypeScriptExportSymbols,
  collectTypeScriptNullableCallableReturns,
  collectTypeScriptNullableOptionFields,
  collectTypeScriptReferencedTypes,
  collectTypeScriptStringUnions,
  dependencyAliasArguments,
  hasGeneratedProvenanceHeader,
  hasRustConstGroup,
  hasRustGenerationSemantics,
  hasRustPublicRecordDeclaration,
  hasRustPublicTypeAlias,
  hasRustSiblingGenerationSemantics,
  hasTypeScriptNullableOptionFunctionBoundary,
  mergeRustExportNames,
  renderCompanionContractExports,
  renderGeneratedImports,
  renderPublicExports,
  renderReferencedConstants,
  renderReferencedExports,
  renderReferencedImports,
  resolveCrateExportSymbols,
  resolveExternalContractExports,
  resolveRustExportName,
  typeScriptDefaultNullOptionParameterArguments,
  typeScriptArrayParameterArguments,
  typeScriptInlineStringUnionArguments,
  typeScriptInternalTypeExportArguments,
  typeScriptNullableOptionFieldArguments,
  typeScriptNullableOptionParameterArguments,
  typeScriptNullableOptionReturnArguments,
  typeScriptNullableOptionReturnMetadata,
  typeScriptStringUnionArguments,
  typeScriptTestTypeAliasArguments,
  typeScriptTypeAliasArguments,
} from './generate-rust-package-exports.ts';

describe('canonicalizeGeneratedContractImports', () => {
  it('reuses established contract owners and keeps unrelated Rust-owner imports', () => {
    const existing = `import type {
  BackendOperationExplanation,
  NativeSurfaceHandle as SurfaceHandle,
} from '@flighthq/types/contract';
import { createHost } from '@flighthq/host/contract';
`;
    const generated = `import type {
  BackendOperationExplanation,
  Host,
  NativeSurfaceHandle as SurfaceHandle,
} from '@flighthq/host/contract';
import { createHost } from '@flighthq/host/contract';

export function useHost(
  host: Host,
  explanation: BackendOperationExplanation,
  handle: SurfaceHandle,
): void {
  createHost(host, explanation, handle);
}
`;

    expect(canonicalizeGeneratedContractImports(existing, generated)).toBe(
      `import type { Host } from '@flighthq/host/contract';
import type { BackendOperationExplanation, NativeSurfaceHandle as SurfaceHandle } from '@flighthq/types/contract';
import { createHost } from '@flighthq/host/contract';

export function useHost(
  host: Host,
  explanation: BackendOperationExplanation,
  handle: SurfaceHandle,
): void {
  createHost(host, explanation, handle);
}
`,
    );
  });

  it('keeps each import declaration separate when a non-contract import precedes a contract import', () => {
    const existing = `import { describe, expect, it } from 'vitest';

import type { UnpackedRectangle } from '@flighthq/types/contract';
import { packRectangles } from './contract.ts';
`;
    const generated = `import { describe, expect, it } from 'vitest';

import {
  explainUnpackedRectangles,
  getUnpackedRectangleReasonString,
  packRectangles,
} from './contract.ts';

import type {
  UnpackedRectangle,
} from './contract.ts';

describe('explainUnpackedRectangles', () => {
  it('explains', () => {
    const rectangle: UnpackedRectangle = packRectangles();
    expect(explainUnpackedRectangles(rectangle)).toEqual(getUnpackedRectangleReasonString(rectangle));
  });
});
`;

    const canonical = canonicalizeGeneratedContractImports(existing, generated);

    // vitest helpers stay from vitest; contract values keep their module; the type keeps its
    // established canonical owner.
    expect(canonical).toBe(`import { describe, expect, it } from 'vitest';

import { explainUnpackedRectangles, getUnpackedRectangleReasonString, packRectangles } from './contract.ts';

import type { UnpackedRectangle } from '@flighthq/types/contract';

describe('explainUnpackedRectangles', () => {
  it('explains', () => {
    const rectangle: UnpackedRectangle = packRectangles();
    expect(explainUnpackedRectangles(rectangle)).toEqual(getUnpackedRectangleReasonString(rectangle));
  });
});
`);
    // Repeated generation is stable: canonicalizing the canonical output changes nothing.
    expect(canonicalizeGeneratedContractImports(existing, canonical)).toBe(canonical);
    expect(canonical).not.toMatch(/explainUnpackedRectangles[^;]*from 'vitest'/);
  });

  it('reads canonical owners only from contract import declarations', () => {
    const existing = `import { describe, it } from 'vitest';
import { packRectangles } from '@flighthq/binpack/contract';
`;
    const generated = `import { packRectangles } from './contract.ts';
`;

    // describe and it are never contract owners; packRectangles keeps its owner.
    expect(canonicalizeGeneratedContractImports(existing, generated)).toBe(
      `import { packRectangles } from '@flighthq/binpack/contract';
`,
    );
  });

  it('does not guess when the existing implementation has ambiguous owners', () => {
    const existing = `import type { Shared } from '@flighthq/alpha/contract';
import type { Shared } from '@flighthq/beta/contract';
`;
    const generated = `import type { Shared } from '@flighthq/rust-owner/contract';
export type Result = Shared;
`;

    expect(canonicalizeGeneratedContractImports(existing, generated)).toBe(generated);
  });

  it('moves generated local-contract test types back to their canonical owner', () => {
    const existing = `import type { ShellExternalReason } from '@flighthq/types/contract';
import { blockedReason } from './contract.ts';
`;
    const generated = `import { blockedReason } from './contract.ts';
import type { ShellExternalReason } from './contract.ts';

const reason: ShellExternalReason = blockedReason();
`;

    expect(canonicalizeGeneratedContractImports(existing, generated)).toBe(
      `import { blockedReason } from './contract.ts';
import type { ShellExternalReason } from '@flighthq/types/contract';

const reason: ShellExternalReason = blockedReason();
`,
    );
  });
});

describe('collectCrateExportSymbols', () => {
  it('reads export lists as crate-internal symbols that the public scan ignores', () => {
    const modules = [
      {
        fileName: 'owner.ts',
        mode: 'generate' as const,
        typescript:
          'interface Registry {}\nfunction createRegistry(): Registry {}\nexport function publicValue(): number {}\n\nexport { createRegistry };\nexport type { Registry };\n',
      },
    ];
    expect([...collectCrateExportSymbols(modules)]).toEqual([
      ['createRegistry', [{ fileName: 'owner.ts', hasType: false, hasValue: true }]],
      ['Registry', [{ fileName: 'owner.ts', hasType: true, hasValue: false }]],
    ]);
    expect([...collectExportSymbols(modules).keys()]).toEqual(['publicValue']);
  });

  it('collects async function exports as values', () => {
    const modules = [
      {
        fileName: 'owner.ts',
        mode: 'generate' as const,
        typescript: 'export async function readValue(): Promise<number> {}\n',
      },
    ];
    expect([...collectExportSymbols(modules)]).toEqual([
      ['readValue', { fileName: 'owner.ts', hasType: false, hasValue: true, isClass: false }],
    ]);
    expect([...collectTypeScriptExportSymbols('export async function readValue(): Promise<number> {}\n')]).toEqual([
      ['readValue', { hasType: false, hasValue: true, isClass: false }],
    ]);
  });

  it('rejects a sibling forwarding re-export as a second owner of a declared symbol', () => {
    const modules = [
      {
        fileName: 'texelScale.ts',
        mode: 'target-native' as const,
        typescript: 'export function getTexelScale(width: number): number {}\n',
      },
      {
        fileName: 'blurEffect.ts',
        mode: 'target-native' as const,
        typescript: "export { getTexelScale } from './texelScale.ts';\nexport function runBlurEffect(): void {}\n",
      },
    ];
    expect(() => collectExportSymbols(modules)).toThrow(
      'duplicate generated symbol getTexelScale in texelScale.ts and blurEffect.ts',
    );
    expect([
      ...collectExportSymbols([
        modules[0],
        { ...modules[1], typescript: 'export function runBlurEffect(): void {}\n' },
      ]),
    ]).toEqual([
      ['getTexelScale', { fileName: 'texelScale.ts', hasType: false, hasValue: true, isClass: false }],
      ['runBlurEffect', { fileName: 'blurEffect.ts', hasType: false, hasValue: true, isClass: false }],
    ]);
  });
});

describe('dependency contract exports', () => {
  it('classifies direct declarations and named re-exports', () => {
    expect([
      ...collectTypeScriptExportSymbols(`export interface WidgetRaw {}
export class Widget {}
export function createWidget(): WidgetRaw { return {}; }
export type { Format, Source as Renamed } from '@flighthq/types/contract';
export { RuntimeValue, type RuntimeType } from './runtime.ts';
`),
    ]).toEqual([
      ['WidgetRaw', { hasType: true, hasValue: false, isClass: false }],
      ['Widget', { hasType: true, hasValue: true, isClass: true }],
      ['createWidget', { hasType: false, hasValue: true, isClass: false }],
      ['Format', { hasType: true, hasValue: false, isClass: false }],
      ['Renamed', { hasType: true, hasValue: false, isClass: false }],
      ['RuntimeValue', { hasType: false, hasValue: true, isClass: false }],
      ['RuntimeType', { hasType: true, hasValue: false, isClass: false }],
    ]);
  });

  it('collects only exported type-only string-literal unions as representation metadata', () => {
    expect(
      collectTypeScriptStringUnions(`
export type AccessibilityLiveness = 'polite' | 'assertive';
export type Mixed = 'known' | string;
type Private = 'private-a' | 'private-b';
export enum RuntimeLiveness { Polite = 'polite', Assertive = 'assertive' }
`),
    ).toEqual(new Map([['AccessibilityLiveness', ['polite', 'assertive']]]));
  });

  it('collects required-null fields without widening optional or undefined fields', () => {
    expect(
      collectTypeScriptNullableOptionFields(`
export interface AnimationStateMachine {
  transitionFromStateIndex: number | null;
  transitionToStateIndex: number | null;
  optionalIndex?: number | null;
  undefinedIndex: number | undefined;
}
interface PrivateState { index: number | null; }
`),
    ).toEqual(new Map([['AnimationStateMachine', ['transitionFromStateIndex', 'transitionToStateIndex']]]));
  });

  it('passes only explicitly imported type-only string unions to the compiler', () => {
    const symbols = new Map([
      [
        '@flighthq/types/contract',
        new Map([
          [
            'AccessibilityLiveness',
            {
              hasType: true,
              hasValue: false,
              stringUnionValues: ['polite', 'assertive'],
            },
          ],
          ['AccessibilityNode', { hasType: true, hasValue: false }],
          [
            'RuntimeLiveness',
            {
              hasType: true,
              hasValue: true,
              stringUnionValues: ['polite', 'assertive'],
            },
          ],
          [
            'UnimportedStringUnion',
            {
              hasType: true,
              hasValue: false,
              stringUnionValues: ['first', 'second'],
            },
          ],
        ]),
      ],
    ]);

    expect(
      typeScriptStringUnionArguments(
        `import type {
  AccessibilityLiveness as Liveness,
  AccessibilityNode,
} from '@flighthq/types/contract';
import { RuntimeLiveness } from '@flighthq/types/contract';
`,
        symbols,
      ),
    ).toEqual(['--typescript-string-union', '@flighthq/types/contract#Liveness=["polite","assertive"]']);
  });

  it('carries exact Layout string-union owners without accepting runtime enums', () => {
    const symbols = new Map([
      [
        '@flighthq/types/contract',
        new Map([
          [
            'ViewportAlign',
            {
              hasType: true,
              hasValue: false,
              stringUnionValues: ['bottom', 'bottomleft', 'bottomright', 'left', 'right', 'top', 'topleft', 'topright'],
            },
          ],
          [
            'FlexLayoutWrap',
            {
              hasType: true,
              hasValue: false,
              stringUnionValues: ['nowrap', 'wrap', 'wrap-reverse'],
            },
          ],
          [
            'RuntimeWrap',
            {
              hasType: true,
              hasValue: true,
              stringUnionValues: ['nowrap', 'wrap'],
            },
          ],
        ]),
      ],
    ]);

    expect(
      typeScriptStringUnionArguments(
        `import type { FlexLayoutWrap, RuntimeWrap, ViewportAlign } from '@flighthq/types/contract';`,
        symbols,
      ),
    ).toEqual([
      '--typescript-string-union',
      '@flighthq/types/contract#FlexLayoutWrap=["nowrap","wrap","wrap-reverse"]',
      '--typescript-string-union',
      '@flighthq/types/contract#ViewportAlign=["bottom","bottomleft","bottomright","left","right","top","topleft","topright"]',
    ]);
  });

  it('refuses one string-union spelling claimed by multiple contract owners', () => {
    const symbols = new Map([
      [
        '@flighthq/first/contract',
        new Map([['ViewportAlign', { hasType: true, hasValue: false, stringUnionValues: ['left', 'right'] }]]),
      ],
      [
        '@flighthq/second/contract',
        new Map([['ViewportAlign', { hasType: true, hasValue: false, stringUnionValues: ['left', 'right'] }]]),
      ],
    ]);

    expect(() =>
      typeScriptStringUnionArguments(
        `import type { ViewportAlign } from '@flighthq/first/contract';
import type { ViewportAlign } from '@flighthq/second/contract';`,
        symbols,
      ),
    ).toThrow(/ViewportAlign is imported from both/);
  });

  it('derives inline string-union representations from matching exported signatures', () => {
    const existing = `export function clearAccessibilityTree(reason: 'detached' | 'hidden'): AccessibilityOperationOutcome<'destroyed' | 'no-dom'> { throw 0; }
export function removeAccessibilityNode(): AccessibilityOperationOutcome<'destroyed' | 'no-dom' | 'node-not-found'> { throw 0; }
export function unrelated(): Promise<'unchanged'> { throw 0; }
`;
    const generated = `export function clearAccessibilityTree(reason: AccessibilityTreeReason): AccessibilityOperationOutcome<AccessibilityTreeBlockReason> { throw 0; }
export function removeAccessibilityNode(): AccessibilityOperationOutcome<AccessibilityRemoveNodeBlockReason> { throw 0; }
export function unrelated(): AccessibilityTreeBlockReason { throw 0; }
`;

    expect(typeScriptInlineStringUnionArguments(existing, generated)).toEqual([
      '--typescript-inline-string-union',
      'AccessibilityRemoveNodeBlockReason=["destroyed","no-dom","node-not-found"]',
      '--typescript-inline-string-union',
      'AccessibilityTreeBlockReason=["destroyed","no-dom"]',
      '--typescript-inline-string-union',
      'AccessibilityTreeReason=["detached","hidden"]',
    ]);
  });

  it('derives explicit reference-alias metadata from matching exported signatures', () => {
    const symbols = new Map([
      [
        '@flighthq/types/contract',
        new Map([
          ['AnimationPlayer', { hasType: true, hasValue: false }],
          ['Unrelated', { hasType: true, hasValue: false }],
        ]),
      ],
    ]);
    const existing = `import type { AnimationPlayer } from '@flighthq/types/contract';
import type { DebugState } from './debug.ts';
export function advance(players: readonly AnimationPlayer[], target: unknown, state: Readonly<DebugState>): AnimationPlayer[] { return []; }
export function isReady(): Promise<boolean> { throw 0; }
export function incompatible(value: string | null): void {}
`;
    const generated = `export function advance(players: readonly AnimationPlayerRef[], target: TargetRef, state: Readonly<DebugStateRef>): AnimationPlayerRef[] { return []; }
export function isReady(): Promise<ReadyResult> { throw 0; }
export function incompatible(value: RealAlias | undefined): void {}
`;

    expect(typeScriptTypeAliasArguments(existing, generated, symbols)).toEqual([
      '--typescript-type-alias',
      'AnimationPlayerRef=@flighthq/types/contract#AnimationPlayer',
      '--typescript-type-alias',
      'DebugStateRef=./debug.ts#DebugState',
      '--typescript-type-alias',
      'ReadyResult=boolean',
      '--typescript-type-alias',
      'TargetRef=unknown',
    ]);
  });

  it('derives exact numeric-array parameter representations by exported parameter identity', () => {
    const existing = `export function resolveLayoutTree(out: Float32Array, nodeCount: number, intrinsicSizes: ArrayLike<number>): void {}
export function unchanged(values: number[]): void {}
`;
    const generated = `export function resolveLayoutTree(intrinsicSizes: Readonly<number[]>, nodeCount: number, out: number[]): void {}
export function unchanged(values: number[]): void {}
`;

    expect(typeScriptArrayParameterArguments(existing, generated)).toEqual([
      '--typescript-array-parameter',
      'resolveLayoutTree.intrinsicSizes=ArrayLike<number>',
      '--typescript-array-parameter',
      'resolveLayoutTree.out=Float32Array',
    ]);
  });

  it('refuses numeric-array parameter metadata from wrapped, ambiguous, or unmatched signatures', () => {
    const existing = `export function wrapped(out: Readonly<Float32Array>): void {}
export function union(values: ArrayLike<number> | null): void {}
export function generic(values: ArrayLike<string>): void {}
export function duplicate(values: Float32Array, values: Float32Array): void {}
export function renamed(out: Float32Array): void {}
export function overloaded(out: Float32Array): void {}
export function overloaded(out: number, extra: number): void {}
`;
    const generated = `export function wrapped(out: number[]): void {}
export function union(values: Readonly<number[]>): void {}
export function generic(values: Readonly<number[]>): void {}
export function duplicate(values: number[], values: number[]): void {}
export function renamed(target: number[]): void {}
export function overloaded(out: number[]): void {}
`;

    expect(typeScriptArrayParameterArguments(existing, generated)).toEqual([]);
  });

  it('does not infer type aliases from names or unmatched signatures', () => {
    const symbols = new Map([
      ['@flighthq/types/contract', new Map([['AnimationPlayer', { hasType: true, hasValue: false }]])],
    ]);
    const existing = `import type { AnimationPlayer } from '@flighthq/types/contract';
export function established(player: AnimationPlayer): void {}
`;
    const generated = `export function other(player: AnimationPlayerRef): void {}
export type AnimationPlayerRef = number;
`;

    expect(typeScriptTypeAliasArguments(existing, generated, symbols)).toEqual([]);
  });

  it('retains owner-proven canonical types for generated test-local records', () => {
    const symbols = new Map([
      [
        '@flighthq/types/contract',
        new Map([
          ['FlightDocumentLayoutBinding', { hasType: true, hasValue: false }],
          ['NodeAny', { hasType: true, hasValue: false }],
        ]),
      ],
    ]);
    const existing = `import type { FlightDocumentLayoutBinding, NodeAny } from '@flighthq/types/contract';
const node = {} as NodeAny;
const binding: FlightDocumentLayoutBinding = { targets: [node], tree: { nodes: [] } };
`;
    const generated = `interface NodeAny { name: string; }
interface FlightDocumentLayoutBinding { targets: NodeAny[]; tree: LayoutTree; }
`;

    expect(typeScriptTestTypeAliasArguments(existing, generated, symbols)).toEqual([
      '--typescript-type-alias',
      'FlightDocumentLayoutBinding=@flighthq/types/contract#FlightDocumentLayoutBinding',
      '--typescript-type-alias',
      'NodeAny=@flighthq/types/contract#NodeAny',
    ]);
  });

  it('refuses ambiguous, locally shadowed, unavailable, and unused test type owners', () => {
    const symbols = new Map([
      ['@flighthq/first/contract', new Map([['Ambiguous', { hasType: true, hasValue: false }]])],
      ['@flighthq/second/contract', new Map([['Ambiguous', { hasType: true, hasValue: false }]])],
      [
        '@flighthq/types/contract',
        new Map([
          ['Shadowed', { hasType: true, hasValue: false }],
          ['Unavailable', { hasType: false, hasValue: true }],
          ['Unused', { hasType: true, hasValue: false }],
        ]),
      ],
    ]);
    const existing = `import type { Ambiguous } from '@flighthq/first/contract';
import type { Ambiguous } from '@flighthq/second/contract';
import type { Shadowed, Unavailable, Unused } from '@flighthq/types/contract';
interface Shadowed { local: true; }
const ambiguous: Ambiguous = {} as Ambiguous;
const shadowed: Shadowed = { local: true };
const unavailable: Unavailable = {} as Unavailable;
`;
    const generated = `interface Ambiguous { value: number; }
interface Shadowed { value: number; }
interface Unavailable { value: number; }
interface Unused { value: number; }
`;

    expect(typeScriptTestTypeAliasArguments(existing, generated, symbols)).toEqual([]);
  });

  it('matches alias owners by parameter identity when target-native out-parameters are reordered', () => {
    const symbols = new Map([
      [
        '@flighthq/types/contract',
        new Map([
          ['Matrix', { hasType: true, hasValue: false }],
          ['Surface', { hasType: true, hasValue: false }],
        ]),
      ],
    ]);
    const existing = `import type { Matrix, Surface } from '@flighthq/types/contract';
import type { AppWindow, WindowBounds } from './types/contract.ts';
export function computeWindowDeviceTransform(win: Readonly<AppWindow>, out: Matrix): void {}
export function getWindowBounds(surface: Surface, win: Readonly<AppWindow>, out: WindowBounds): void {}
`;
    const generated = `export function computeWindowDeviceTransform(out: Matrix, win: AppWindow): void {}
export function getWindowBounds(out: WindowBounds, surface: Surface, win: AppWindow): void {}
`;

    expect(typeScriptTypeAliasArguments(existing, generated, symbols)).toEqual([]);
  });

  it('reads ownership signatures through unparenthesized lenient-probe arrow invocations', () => {
    const symbols = new Map([
      ['@flighthq/types/contract', new Map([['AnimationPlayer', { hasType: true, hasValue: false }]])],
    ]);
    const existing = `import type { AnimationPlayer } from '@flighthq/types/contract';
export function advance(player: AnimationPlayer): void {}
`;
    const generated = `export function advance(player: AnimationPlayerRef): void {
  const result = (): void => {}();
  return result;
}
`;

    expect(typeScriptTypeAliasArguments(existing, generated, symbols)).toEqual([
      '--typescript-type-alias',
      'AnimationPlayerRef=@flighthq/types/contract#AnimationPlayer',
    ]);
  });

  it('refuses ownership inference from malformed generated signatures', () => {
    const existing = `export function advance(player: unknown): void {}`;
    const generated = `export function advance(player AnimationPlayerRef): void {}`;

    expect(() => typeScriptTypeAliasArguments(existing, generated, new Map())).toThrow(
      /could not parse generated TypeScript contract while resolving type aliases/,
    );
  });

  it('refuses ownership inference from unrelated malformed probe bodies', () => {
    const existing = `export function advance(player: unknown): void {}`;
    const generated = `export function advance(player: AnimationPlayerRef): void { const broken = ; }`;

    expect(() => typeScriptTypeAliasArguments(existing, generated, new Map())).toThrow(
      /could not parse generated TypeScript contract while resolving type aliases/,
    );
  });

  it('derives only established crate-internal type owners used through their Rust module', () => {
    const existing = `export type PlatformEndianness = 'big' | 'little' | 'unknown';
export type PlatformEngine = 'gecko' | 'blink' | 'webkit' | 'unknown';
export type UserAgentRuntimeWindow = Record<unknown> | null | undefined;
export type Unknown = unknown;
export interface Record<T> { readonly [key: string]: T }
`;
    const rust = `pub(crate) use flight_entity::{Record, Unknown};
pub(crate) use flight_platform::{PlatformEndianness, PlatformEngine};
pub(crate) type UserAgentRuntimeWindow<'a> = Option<&'a Record<Unknown>>;
`;
    const siblings = [
      `use crate::user_agent_native::{PlatformEndianness, Unknown};
use crate::user_agent_native::PlatformEngine as Engine;
`,
    ];

    const expected = {
      inlineStringUnionArguments: [
        '--typescript-inline-string-union',
        'PlatformEndianness=["big","little","unknown"]',
        '--typescript-inline-string-union',
        'PlatformEngine=["gecko","blink","webkit","unknown"]',
      ],
      typeAliasArguments: ['--typescript-type-alias', 'Unknown=unknown'],
      typeExportArguments: [
        '--typescript-internal-type-export',
        'PlatformEndianness',
        '--typescript-internal-type-export',
        'PlatformEngine',
        '--typescript-internal-type-export',
        'Unknown',
      ],
    };

    expect(typeScriptInternalTypeExportArguments(existing, rust, 'user_agent_native', siblings)).toEqual(expected);
    expect(
      typeScriptInternalTypeExportArguments(
        `type PlatformEndianness = 'big' | 'little' | 'unknown';
type PlatformEngine = 'gecko' | 'blink' | 'webkit' | 'unknown';
type Unknown = unknown;
export type { PlatformEndianness, PlatformEngine, Unknown };
`,
        rust,
        'user_agent_native',
        siblings,
      ),
    ).toEqual(expected);
  });

  it('derives nullable field metadata from canonical owner positions used by generated functions', () => {
    const symbols = new Map([
      [
        '@flighthq/types/contract',
        new Map([
          [
            'AnimationStateMachine',
            {
              hasType: true,
              hasValue: false,
              nullableFields: ['transitionFromStateIndex', 'transitionToStateIndex'],
            },
          ],
        ]),
      ],
    ]);
    const existing = `import type { AnimationStateMachine } from '@flighthq/types/contract';
export function advance(machine: AnimationStateMachine): void {}
`;
    const generated = `export function advance(machine: AnimationStateMachine): void {
  if (machine.transitionToStateIndex === undefined) return;
  machine.transitionToStateIndex = undefined;
}
function clear(machine: Readonly<AnimationStateMachine>): void {
  if (machine.transitionFromStateIndex !== undefined) return;
}
export function unrelated(machine: AnimationStateMachine): void {
  machine.transitionWeight = 0;
}
`;

    expect(typeScriptNullableOptionFieldArguments(existing, generated, symbols)).toEqual([
      '--typescript-nullable-option-field',
      '@flighthq/types/contract#AnimationStateMachine.transitionFromStateIndex',
      '--typescript-nullable-option-field',
      '@flighthq/types/contract#AnimationStateMachine.transitionToStateIndex',
    ]);
  });

  it('refuses nullable field metadata for wrapped or locally shadowed owners', () => {
    const symbols = new Map([
      [
        '@flighthq/types/contract',
        new Map([
          [
            'LayoutState',
            {
              hasType: true,
              hasValue: false,
              nullableFields: ['guard'],
            },
          ],
        ]),
      ],
    ]);
    const existing = `import type { LayoutState } from '@flighthq/types/contract';`;

    expect(
      typeScriptNullableOptionFieldArguments(
        existing,
        `export function inspect(state: Box<LayoutState>): void { state.guard = undefined; }`,
        symbols,
      ),
    ).toEqual([]);
    expect(
      typeScriptNullableOptionFieldArguments(
        existing,
        `interface LayoutState { guard?: number; }
export function inspect(state: LayoutState): void { state.guard = undefined; }`,
        symbols,
      ),
    ).toEqual([]);
  });

  it('derives nullable return metadata only from exact exported function positions', () => {
    const existing = `export function createSvgGeometryPath(channel: string | null = null): PathRaw | null { return null; }
export function findOrdinaryPath(): PathRaw | undefined { return undefined; }
export function findMixedPath(): PathRaw | null | undefined { return undefined; }
`;
    const generated = `export function createSvgGeometryPath(channel?: string): Path | undefined { return undefined; }
export function findOrdinaryPath(): Path | undefined { return undefined; }
export function renamedPath(): Path | undefined { return undefined; }
`;

    expect(typeScriptNullableOptionReturnArguments(existing, generated)).toEqual([
      '--typescript-nullable-option-return',
      'createSvgGeometryPath',
    ]);
  });

  it('derives nullable callable returns from exact aliases and canonical owner references', () => {
    const existing = `import type { LayoutState } from '@flighthq/types/contract';
export type LocalResolver = () => Failure | null;
export type OrdinaryResolver = () => Failure | undefined;
export type MixedResolver = () => Failure | null | undefined;
export function resolve(state: LayoutState): void {}
`;
    const generated = `export type LocalResolver = () => Failure | undefined;
export type OrdinaryResolver = () => Failure | undefined;
export type MixedResolver = () => Failure | undefined;
`;
    const symbols = new Map([
      [
        '@flighthq/types/contract',
        new Map([
          ['LayoutState', { hasType: true, hasValue: false, referencedTypes: ['LayoutResolver', 'UnrelatedResolver'] }],
          ['LayoutResolver', { hasType: true, hasValue: false, nullableCallableReturn: true }],
          ['UnrelatedResolver', { hasType: true, hasValue: false, nullableCallableReturn: false }],
        ]),
      ],
    ]);

    expect(typeScriptNullableOptionReturnArguments(existing, generated, symbols)).toEqual([
      '--typescript-nullable-option-return',
      'LayoutResolver',
      '--typescript-nullable-option-return',
      'LocalResolver',
    ]);
    expect(collectTypeScriptNullableCallableReturns(existing)).toEqual(new Set(['LocalResolver']));
    expect(
      collectTypeScriptReferencedTypes(`export interface LayoutState {
  resolvers: Map<string, LayoutResolver>;
  failure: Failure | null;
}`),
    ).toEqual(new Map([['LayoutState', ['Failure', 'LayoutResolver', 'Map']]]));
  });

  it('coalesces Effects-GL nullable callable paths at their canonical owner and isolates unrelated graphs', () => {
    const existing = `import type { GlRenderState } from '@flighthq/types/contract';
import type { GlRenderStateOptions } from '@flighthq/types/contract';`;
    const symbols = new Map([
      [
        '@flighthq/types/contract',
        new Map([
          [
            'GlRenderState',
            { hasType: true, hasValue: false, referencedTypes: ['GlCompressedTextureDecoder', 'GlRenderStateOptions'] },
          ],
          ['GlRenderStateOptions', { hasType: true, hasValue: false, referencedTypes: ['GlCompressedTextureDecoder'] }],
          ['GlCompressedTextureDecoder', { hasType: true, hasValue: false, nullableCallableReturn: true }],
          ['IsolatedState', { hasType: true, hasValue: false, referencedTypes: ['IsolatedResolver'] }],
          ['IsolatedResolver', { hasType: true, hasValue: false, nullableCallableReturn: true }],
        ]),
      ],
    ]);

    const metadata = typeScriptNullableOptionReturnMetadata(
      existing,
      '',
      symbols,
      new Set(['GlCompressedTextureDecoder']),
    );

    expect(metadata.arguments).toEqual(['--typescript-nullable-option-return', 'GlCompressedTextureDecoder']);
    expect(metadata.owners).toEqual(new Map([['GlCompressedTextureDecoder', '@flighthq/types/contract']]));
    expect(typeScriptNullableOptionReturnMetadata(existing, '', symbols, new Set()).arguments).toEqual([]);
  });

  it('refuses conflicting nullable callable return owners', () => {
    const existing = `import type { FirstState } from '@flighthq/first/contract';
import type { SecondState } from '@flighthq/second/contract';`;
    const symbols = new Map([
      [
        '@flighthq/first/contract',
        new Map([
          ['FirstState', { hasType: true, hasValue: false, referencedTypes: ['Resolver'] }],
          ['Resolver', { hasType: true, hasValue: false, nullableCallableReturn: true }],
        ]),
      ],
      [
        '@flighthq/second/contract',
        new Map([
          ['SecondState', { hasType: true, hasValue: false, referencedTypes: ['Resolver'] }],
          ['Resolver', { hasType: true, hasValue: false, nullableCallableReturn: true }],
        ]),
      ],
    ]);

    expect(() => typeScriptNullableOptionReturnArguments(existing, '', symbols)).toThrow(
      /nullable Option return Resolver has conflicting owners/,
    );
  });

  it('discovers only exported null-represented function boundaries', () => {
    expect(
      hasTypeScriptNullableOptionFunctionBoundary(`export function findValue(): string | null { return null; }
export function setValue(value: string | null): void {}
`),
    ).toBe(true);
    expect(
      hasTypeScriptNullableOptionFunctionBoundary(`export function findValue(): string | undefined { return undefined; }
export function findMixed(): string | null | undefined { return undefined; }
export function setOptional(value?: string | null): void {}
export function setDefault(value: string | null = 'value'): void {}
function privateValue(): string | null { return null; }
`),
    ).toBe(false);
    expect(hasTypeScriptNullableOptionFunctionBoundary(`export type Resolver = () => string | null;`)).toBe(true);
  });

  it('derives nullable parameter metadata only from exact exported function positions', () => {
    const existing = `export function beginDebugSpan(channel: string | null = null): void {}
export function endDebugSpan(timer: Readonly<LogTimer> | null): void {}
export function markDebugFrame(label?: string, channel: string | null = null): void {}
export function mixed(value: string | null | undefined): void {}
`;
    const generated = `export function beginDebugSpan(channel?: string): void {}
export function endDebugSpan(timer?: Readonly<LogTimer>): void {}
export function markDebugFrame(label?: string, channel?: string): void {}
export function renamed(value?: string): void {}
`;

    expect(typeScriptNullableOptionParameterArguments(existing, generated)).toEqual([
      '--typescript-nullable-option-parameter',
      'endDebugSpan.timer',
    ]);
    expect(typeScriptDefaultNullOptionParameterArguments(existing, generated)).toEqual([
      '--typescript-default-null-option-parameter',
      'beginDebugSpan.channel',
      '--typescript-default-null-option-parameter',
      'markDebugFrame.channel',
    ]);
  });

  it('rejects conflicting inline representations of one generated Rust type', () => {
    const existing = `export function first(): Outcome<'a' | 'b'> { throw 0; }
export function second(): Outcome<'a' | 'c'> { throw 0; }
`;
    const generated = `export function first(): Outcome<Reason> { throw 0; }
export function second(): Outcome<Reason> { throw 0; }
`;

    expect(() => typeScriptInlineStringUnionArguments(existing, generated)).toThrow(
      'inline TypeScript string union Reason has conflicting contract signatures',
    );
  });

  it('renders dependency-owned Rust uses from the dependency contract', () => {
    const uses = collectRustPublicUses(`pub use flight_widget::{Widget, WidgetConfig, create_widget};`);
    const contracts = new Map([
      [
        'flight_widget',
        {
          exportNames: new Map<string, string>(),
          module: '@flighthq/widget/contract',
          symbols: new Map([
            ['WidgetRaw', { hasType: true, hasValue: false, isClass: false }],
            ['Widget', { hasType: true, hasValue: true, isClass: true }],
            ['WidgetConfig', { hasType: true, hasValue: false, isClass: false }],
            ['createWidget', { hasType: false, hasValue: true, isClass: false }],
          ]),
        },
      ],
    ]);

    expect(resolveExternalContractExports(uses, contracts)).toEqual({
      output:
        "export { createWidget } from '@flighthq/widget/contract';\n" +
        "export type { WidgetConfig, WidgetRaw } from '@flighthq/widget/contract';\n",
      symbols: new Map([
        ['WidgetRaw', { fileName: 'contract.ts', hasType: true, hasValue: false, isClass: false }],
        ['WidgetConfig', { fileName: 'contract.ts', hasType: true, hasValue: false, isClass: false }],
        ['createWidget', { fileName: 'contract.ts', hasType: false, hasValue: true, isClass: false }],
      ]),
    });
  });
});

describe('collectFlightDependencyCrates', () => {
  const manifest = [
    '[package]',
    'name = "flight-consumer"',
    '',
    '[dependencies]',
    'flight-entity = { workspace = true }',
    'flight-encoding.workspace = true',
    'serde = "1"',
    '',
    '[dev-dependencies]',
    'flight-geometry = { workspace = true }',
    'flight-entity = { workspace = true }',
  ].join('\n');

  it('reads flight dependencies, adding dev-dependencies only for tests', () => {
    expect(collectFlightDependencyCrates(manifest, false)).toEqual(['flight-encoding', 'flight-entity']);
    expect(collectFlightDependencyCrates(manifest, true)).toEqual([
      'flight-encoding',
      'flight-entity',
      'flight-geometry',
    ]);
  });
});

describe('collectRustExportNames', () => {
  it('reads export-name directives and ignores other directives', () => {
    const rust = [
      '//! flight-compiler: export-name decode_utf8 decodeUTF8',
      '//! flight-compiler: frozen-object PRESET Preset',
      '//! flight-compiler: export-name encode_utf8 encodeUTF8',
      'pub fn decode_utf8() {}',
    ].join('\n');
    expect([...collectRustExportNames(rust)]).toEqual([
      ['decode_utf8', 'decodeUTF8'],
      ['encode_utf8', 'encodeUTF8'],
    ]);
    expect(collectRustExportNames('pub fn decode_utf8() {}\n').size).toBe(0);
  });
});

describe('compilerVisibilityArguments', () => {
  it('passes every other crate source to module generation as visibility-only input', () => {
    const crate = ['lib.rs', 'pool.rs', 'ease.rs', 'ease_steps.rs', 'nested/mod.rs'];
    expect(compilerVisibilityArguments('generate', crate, ['ease.rs', 'ease_steps.rs'], 'ease.rs')).toEqual([
      '--visibility-source',
      'lib.rs',
      '--visibility-source',
      'pool.rs',
      '--visibility-source',
      'nested/mod.rs',
    ]);
    expect(compilerVisibilityArguments('generate-tests', crate, ['ease.rs'], 'ease.rs')).toEqual([
      '--visibility-source',
      'lib.rs',
      '--visibility-source',
      'pool.rs',
      '--visibility-source',
      'ease_steps.rs',
      '--visibility-source',
      'nested/mod.rs',
    ]);
    expect(compilerVisibilityArguments('source-mode', crate, [], 'ease.rs')).toEqual([]);
  });

  it('keeps target-native sources visible when they are also alias inputs to test generation', () => {
    const crate = ['lib.rs', 'pool.rs', 'ease.rs', 'ease_compat.rs'];
    expect(
      compilerVisibilityArguments('generate-tests', crate, ['ease.rs', 'ease_compat.rs'], 'tests/ease_test.rs', [
        'ease_compat.rs',
      ]),
    ).toEqual([
      '--visibility-source',
      'lib.rs',
      '--visibility-source',
      'pool.rs',
      '--visibility-source',
      'ease_compat.rs',
    ]);
    expect(compilerVisibilityArguments('source-mode', crate, [], 'ease.rs', ['ease_compat.rs'])).toEqual([]);
  });
});

describe('dependencyAliasArguments', () => {
  it('passes each dependency source with its contract module', () => {
    expect(
      dependencyAliasArguments([{ module: '@flighthq/encoding/contract', path: 'crates/flight-encoding/src/utf8.rs' }]),
    ).toEqual([
      '--external-alias-source',
      'crates/flight-encoding/src/utf8.rs',
      '--external-alias-module',
      '@flighthq/encoding/contract',
    ]);
    expect(dependencyAliasArguments([])).toEqual([]);
  });
});

describe('hasRustConstGroup', () => {
  it('detects a const-group directive only', () => {
    expect(
      hasRustConstGroup('//! flight-compiler: const-group KeyCode KEY_CODE_\npub const KEY_CODE_A: i32 = 1;\n'),
    ).toBe(true);
    expect(hasRustConstGroup('//! flight-compiler: export-name decode_utf8 decodeUTF8\n')).toBe(false);
    expect(hasRustConstGroup('// flight-compiler: const-group KeyCode KEY_CODE_\n')).toBe(false);
  });
});

describe('hasRustPublicRecordDeclaration', () => {
  it('selects public dependency records without treating private storage as semantic API', () => {
    expect(hasRustPublicRecordDeclaration('pub struct TextFormat {\n    pub bold: Option<bool>,\n}\n')).toBe(true);
    expect(hasRustPublicRecordDeclaration('pub struct Generic<T> { pub value: T }\n')).toBe(true);
    expect(hasRustPublicRecordDeclaration('struct Private { value: i32 }\n')).toBe(false);
    expect(hasRustPublicRecordDeclaration('pub(crate) struct Internal { value: i32 }\n')).toBe(false);
  });
});

describe('hasRustPublicTypeAlias', () => {
  it('selects public type aliases but not private or crate-visible ones', () => {
    expect(hasRustPublicTypeAlias('pub type ProviderRef = Arc<dyn Any + Send + Sync>;\n')).toBe(true);
    expect(hasRustPublicTypeAlias('type Local = i32;\n')).toBe(false);
    expect(hasRustPublicTypeAlias('pub(crate) type Internal = i32;\n')).toBe(false);
    expect(
      collectRustPublicTypeAliasNames(
        'pub type AnimationPlayerRef = Ref<AnimationPlayer>;\npub type TargetRef = Unknown;',
      ),
    ).toEqual(['AnimationPlayerRef', 'TargetRef']);
  });
});

describe('hasRustGenerationSemantics', () => {
  it('selects cross-package nullable boundaries in addition to ordinary alias semantics', () => {
    expect(hasRustGenerationSemantics('//! flight-compiler: data-union MarkupResult=reserved-key\n')).toBe(true);
    expect(hasRustGenerationSemantics('//! flight-compiler: string-union-value Kind Ready "ready"\n')).toBe(true);
    expect(hasRustGenerationSemantics('//! flight-compiler: nullable-option get_value\n')).toBe(true);
    expect(hasRustGenerationSemantics('//! flight-compiler: nullable-options\n')).toBe(true);
    expect(
      hasRustGenerationSemantics('//! flight-compiler: target-native\n//! flight-compiler: contract Value\n'),
    ).toBe(false);
    expect(hasRustGenerationSemantics('pub static VALUE: usize = 1;\n')).toBe(false);
  });
});

describe('hasRustSiblingGenerationSemantics', () => {
  it('keeps lightweight nullable metadata out of the full intra-package alias lane', () => {
    expect(hasRustSiblingGenerationSemantics('//! flight-compiler: data-union MarkupResult=reserved-key\n')).toBe(true);
    expect(hasRustSiblingGenerationSemantics('//! flight-compiler: string-union-value Kind Ready "ready"\n')).toBe(
      true,
    );
    expect(hasRustSiblingGenerationSemantics('//! flight-compiler: nullable-option get_value\n')).toBe(false);
    expect(hasRustSiblingGenerationSemantics('//! flight-compiler: nullable-options\n')).toBe(false);
  });
});

describe('mergeRustExportNames', () => {
  it('merges agreeing mappings and rejects one item named twice', () => {
    const utf8 = new Map([['decode_utf8', 'decodeUTF8']]);
    expect([
      ...mergeRustExportNames(
        new Map([
          ['utf8.ts', utf8],
          ['other.ts', utf8],
        ]),
      ),
    ]).toEqual([['decode_utf8', 'decodeUTF8']]);
    expect(() =>
      mergeRustExportNames(
        new Map([
          ['utf8.ts', utf8],
          ['text.ts', new Map([['decode_utf8', 'decodeUtf8Text']])],
        ]),
      ),
    ).toThrow('export-name decode_utf8 is decodeUtf8Text in text.ts and decodeUTF8 in utf8.ts');
  });
});

describe('resolveCrateExportSymbols', () => {
  it('resolves same-named crate symbols through the module the Rust source names', () => {
    const owners = collectCrateExportSymbols([
      {
        fileName: 'alpha.ts',
        mode: 'generate',
        typescript: 'const LIMIT = 1;\ninterface State {}\n\nexport { LIMIT };\nexport type { State };\n',
      },
      {
        fileName: 'beta.ts',
        mode: 'generate',
        typescript: 'const LIMIT = 2;\ninterface State {}\n\nexport { LIMIT };\nexport type { State };\n',
      },
      { fileName: 'gamma.ts', mode: 'generate', typescript: 'const ONLY = 3;\n\nexport { ONLY };\n' },
    ]);
    const viaUse = resolveCrateExportSymbols('use crate::beta::{LIMIT, State as BetaState};\n', 'user.ts', owners);
    expect(viaUse.get('LIMIT')?.fileName).toBe('beta.ts');
    expect(viaUse.get('State')?.fileName).toBe('beta.ts');
    expect(viaUse.has('ONLY')).toBe(false);
    expect(
      resolveCrateExportSymbols('fn f() -> i32 { return gamma::ONLY; }\n', 'user.ts', owners).get('ONLY')?.fileName,
    ).toBe('gamma.ts');
    const viaGlob = resolveCrateExportSymbols('use crate::alpha::*;\n', 'user.ts', owners);
    expect(viaGlob.get('LIMIT')?.fileName).toBe('alpha.ts');
    const unqualified = resolveCrateExportSymbols('', 'user.ts', owners);
    expect(unqualified.has('LIMIT')).toBe(false);
    expect(resolveCrateExportSymbols('use crate::beta::LIMIT;\n', 'alpha.ts', owners).has('LIMIT')).toBe(false);
  });
});

describe('renderGeneratedImports crate-internal symbols', () => {
  it('imports a sibling crate-internal symbol once and skips names the module already imports', () => {
    const symbols = new Map([
      ['createRegistry', { fileName: 'owner.ts', hasType: false, hasValue: true }],
      ['Registry', { fileName: 'owner.ts', hasType: true, hasValue: false }],
      ['registryStore', { fileName: 'owner.ts', hasType: false, hasValue: true }],
    ]);
    const typescript =
      "import { registryStore } from './owner.ts';\n\nexport function count(): number {\n  const registry: Registry = createRegistry();\n  return registryStore.size + registry.size;\n}\n";
    expect(renderGeneratedImports('', typescript, 'user.ts', symbols)).toBe(
      "import type { Registry } from './owner.ts';\nimport { createRegistry } from './owner.ts';\n\n",
    );
  });

  it('keeps intrinsic Record global unless Rust explicitly imports a sibling Record', () => {
    const symbols = new Map([['Record', { fileName: 'userAgentNative.ts', hasType: true, hasValue: false }]]);
    const typescript = 'export function parse(win?: Readonly<Record<string, unknown>>): void { void win; }\n';

    expect(renderGeneratedImports('use flight_entity::Record;\n', typescript, 'userAgent.ts', symbols)).toBe('');
    expect(renderGeneratedImports('use crate::user_agent_native::Record;\n', typescript, 'userAgent.ts', symbols)).toBe(
      "import type { Record } from './userAgentNative.ts';\n\n",
    );
    expect(renderGeneratedImports('', typescript, 'userAgent.ts', symbols)).toBe(
      "import type { Record } from './userAgentNative.ts';\n\n",
    );
  });
});

describe('renderGeneratedImports', () => {
  const symbols = new Map([
    ['RequirementFacet', { fileName: 'types.ts', hasType: true, hasValue: true, isClass: false }],
    ['Requirement', { fileName: 'types.ts', hasType: true, hasValue: false, isClass: false }],
    ['getRequirementFacetString', { fileName: 'types.ts', hasType: false, hasValue: true, isClass: false }],
  ]);
  const render = (typescript: string): string => renderGeneratedImports('', typescript, 'requirementSet.ts', symbols);

  it('imports a dual const/type symbol as a type when only type positions reference it', () => {
    expect(
      render(
        'export function first(covers: Readonly<RequirementFacet[]>, out: Requirement[]): RequirementFacet {\n' +
          '  return covers[0] as RequirementFacet;\n}\n',
      ),
    ).toBe("import type { Requirement, RequirementFacet } from './types.ts';\n\n");
  });

  it('imports value-only symbols and value-referenced dual symbols as values', () => {
    expect(
      render(
        'export function name(): string {\n  return getRequirementFacetString(RequirementFacet.SceneNodeKind);\n}\n',
      ),
    ).toBe("import { RequirementFacet, getRequirementFacetString } from './types.ts';\n\n");
  });

  it('keeps a value import when a dual symbol has both type and value references', () => {
    expect(
      render(
        'export function node(): RequirementFacet {\n  const facet: RequirementFacet = RequirementFacet.SceneNodeKind;\n  return facet;\n}\n',
      ),
    ).toBe("import { RequirementFacet } from './types.ts';\n\n");
  });

  it('treats a typeof operand and property names as type-only uses', () => {
    expect(render('export type Facets = typeof RequirementFacet;\n')).toBe(
      "import type { RequirementFacet } from './types.ts';\n\n",
    );
    expect(
      render(
        'export function read(source: { RequirementFacet: number }, out: RequirementFacet): number {\n' +
          '  return source.RequirementFacet;\n}\n',
      ),
    ).toBe("import type { RequirementFacet } from './types.ts';\n\n");
  });

  it('keeps expression operands of as, satisfies, non-null and instantiation as value uses', () => {
    for (const expression of [
      'RequirementFacet as unknown',
      'RequirementFacet satisfies object',
      'RequirementFacet!',
      'RequirementFacet<string>',
    ]) {
      expect(render(`export const facets = ${expression};\n`), expression).toBe(
        "import { RequirementFacet } from './types.ts';\n\n",
      );
    }
  });
});

describe('renderReferencedImports', () => {
  it('retains only externally owned symbols referenced by the generated body', () => {
    const existing = `import type {
  AccessibilityLiveness,
  AccessibilityNode,
  AccessibilityOperationOutcome,
  HostAccessibilityCapability,
  StaleType,
} from '@flighthq/types/contract';
import { createHelper, staleHelper } from './helper.ts';

export function announceAccessibility(): void {}
`;
    const generated = `export function announceAccessibility(
  host: Readonly<HostAccessibilityCapability>,
  node: Readonly<AccessibilityNode>,
  liveness?: AccessibilityLiveness,
): AccessibilityOperationOutcome<AccessibilityTreeBlockReason> {
  createHelper(host, node, liveness);
}
`;
    const importedContracts = new Map([
      [
        '@flighthq/types/contract',
        collectTypeScriptExportSymbols(`export type AccessibilityTreeBlockReason = 'destroyed' | 'no-dom';
export type UnusedContractType = string;
`),
      ],
    ]);

    expect(renderReferencedImports(existing, generated, importedContracts)).toBe(
      `import { createHelper } from './helper.ts';
import type { AccessibilityLiveness, AccessibilityNode, AccessibilityOperationOutcome, AccessibilityTreeBlockReason, HostAccessibilityCapability } from '@flighthq/types/contract';

`,
    );
  });

  it('does not import a name declared or already imported by generated output', () => {
    const existing = `import type { LocalOptions, Widget } from '@flighthq/types/contract';
import { createWidget } from './widget.ts';
`;
    const generated = `import type { Widget } from './types.ts';
export interface LocalOptions { enabled: boolean; }
export function createWidget(): Widget { return {} as Widget; }
`;

    expect(renderReferencedImports(existing, generated)).toBe('');
  });
});

describe('renderReferencedExports', () => {
  it('retains named forwarding exports that generated declarations do not replace', () => {
    const existing = `export type { MissingType, ReplacedType } from './compat.ts';
export { ImageChannel, InternalName as PublicName } from '@flighthq/types/contract';
export { NativeFallback } from './value.native.ts';
export * from './wildcard.ts';
`;
    const generated = 'export interface ReplacedType { value: number; }\n';

    expect(renderReferencedExports(existing, generated)).toBe(
      `export type { MissingType } from './compat.ts';
export { ImageChannel, InternalName as PublicName } from '@flighthq/types/contract';
`,
    );
  });
});

describe('renderReferencedConstants', () => {
  it('retains exported constants not replaced by generated declarations', () => {
    const existing = `export const CAPTURE_PARITY_TOLERANCE = 15;
export const OPTIONS: Readonly<{ value: number }> = Object.freeze({
  value: 2,
});
export const replacedValue = 1;
`;
    const generated = 'export const replacedValue = 3;\n';

    expect(renderReferencedConstants(existing, generated)).toBe(
      `export const CAPTURE_PARITY_TOLERANCE = 15;
export const OPTIONS: Readonly<{ value: number }> = Object.freeze({
  value: 2,
});
`,
    );
  });
});

describe('renderPublicExports', () => {
  it('passes production source hints to contract and test generation', () => {
    expect(compilerAliasArguments('generate', ['ease_steps.rs'])).toEqual(['--alias-source', 'ease_steps.rs']);
    expect(compilerAliasArguments('generate-tests', ['ease_steps.rs'])).toEqual(['--alias-source', 'ease_steps.rs']);
    expect(compilerAliasArguments('source-mode', ['ease_steps.rs'])).toEqual([]);
    expect(compilerAliasArguments('generate', ['ease.rs', 'ease_steps.rs'], 'ease.rs')).toEqual([
      '--alias-source',
      'ease_steps.rs',
    ]);
  });

  it('discovers cross-module generated type references without matching comments', () => {
    const symbols = new Map([
      ['EasingFunction', { fileName: 'easingTypes.ts', hasType: true, hasValue: false }],
      ['LinearColorRaw', { fileName: 'linearColor.ts', hasType: true, hasValue: false }],
      ['getEasingDerivative', { fileName: 'getEasingDerivative.ts', hasType: false, hasValue: true }],
      ['mean', { fileName: 'statistics.ts', hasType: false, hasValue: true }],
      ['sign', { fileName: 'scalar.ts', hasType: false, hasValue: true }],
    ]);

    expect(
      collectReferencedExportNames(
        `// EasingFunction is documented here.
export function getEasingDerivative(ease: EasingFunction, mean: number): number {
  const local = mean;
  return ease(local) + Math.sign(local) + Number('getEasingDerivative and EasingFunction are string data');
}

export function allocateLinearColor(): LinearColorRaw {
  return allocateEntity<LinearColorRaw>();
}
`,
        'getEasingDerivative.ts',
        symbols,
      ),
    ).toEqual(['EasingFunction', 'LinearColorRaw']);
  });

  it('routes target-native OOP wrappers to companions and raw functions through the contract lane', () => {
    const source = `//! flight-compiler: companion widget.ts
`;
    const contract = `pub use crate::{
  support::{Helper},
  widget_raw::*,
};
`;
    const crateRoot = `pub use widget_raw::{
  create_widget,
  WidgetRaw,
};
pub use widget::RootOnly;
pub use contract::*;
`;
    const modules = [
      {
        fileName: 'widgetRaw.ts',
        mode: 'generate' as const,
        typescript: 'export interface WidgetRaw {}\nexport function createWidget(): WidgetRaw { return {}; }\n',
      },
      {
        directPublicExports: true,
        fileName: collectCompanionFileNames(source)[0],
        mode: 'target-native' as const,
        typescript: 'export class RootOnly {}\nexport class Widget {}\n',
      },
    ];
    const symbols = collectExportSymbols(modules);
    const output = renderPublicExports(modules, symbols, ['RootOnly', 'Widget', 'WidgetRaw', 'createWidget']);

    expect(symbols.get('Widget')).toEqual({ fileName: 'widget.ts', hasType: true, hasValue: true, isClass: true });
    expect(collectContractModuleNames(contract)).toEqual(new Set(['support', 'widget_raw']));
    expect(collectPublicRootNames(crateRoot)).toEqual(['RootOnly', 'WidgetRaw', 'createWidget']);
    expect(collectRustPublicUses(crateRoot)).toContainEqual({ moduleName: 'contract', wildcard: true });

    expect(renderCompanionContractExports(modules, symbols)).toBe("export { Widget } from './widget.ts';\n");

    expect(output).toBe(`export {
  createWidget,
} from './contract.ts';

export type { WidgetRaw } from './contract.ts';
export {
  RootOnly,
  Widget,
} from './widget.ts';
`);
  });

  it('routes target-native type aliases backed by raw types through the contract lane', () => {
    const modules = [
      {
        fileName: 'signalTypesRaw.ts',
        mode: 'generate' as const,
        typescript: 'export interface SignalRaw<T> { emit: (value: T) => void; }\n',
      },
      {
        directPublicExports: true,
        fileName: 'signalTypes.ts',
        mode: 'target-native' as const,
        typescript: 'export type Signal<T> = SignalRaw<T>;\nexport type CompanionOnly = string;\n',
      },
    ];
    const symbols = collectExportSymbols(modules);

    expect(renderCompanionContractExports(modules, symbols)).toBe("export type { Signal } from './signalTypes.ts';\n");
  });

  it('imports only emitted Raw consumers when Rust signatures name a companion wrapper', () => {
    const modules = [
      {
        fileName: 'packColor.ts',
        mode: 'generate' as const,
        typescript: `export interface LinearColorRaw {}
export function packLinearToColor(color: Readonly<LinearColorRaw>): number { return 0; }
`,
      },
      {
        directPublicExports: true,
        fileName: 'linearColor.ts',
        mode: 'target-native' as const,
        typescript: `export class LinearColor {}
`,
      },
    ];
    const symbols = collectExportSymbols(modules);
    const rust = `use crate::{pack_linear_to_color, LinearColor};
`;
    const typescript = `export function lerpLinearColor(
  out: LinearColorRaw,
  start: Readonly<LinearColorRaw>,
  end: Readonly<LinearColorRaw>,
): number {
  return packLinearToColor(out);
}
`;

    expect(renderGeneratedImports(rust, typescript, 'lerpColor.ts', symbols)).toBe(
      `import type { LinearColorRaw } from './packColor.ts';
import { packLinearToColor } from './packColor.ts';

`,
    );
  });

  it('keeps a companion wrapper out of a bundle that imports only a free function from the full contract lane', async () => {
    const modules = [
      {
        fileName: 'widgetRaw.ts',
        mode: 'generate' as const,
        typescript: `export interface WidgetRaw {}
export function createWidget(): WidgetRaw { console.log('FREE_FUNCTION_MARKER'); return {}; }
`,
      },
      {
        directPublicExports: true,
        fileName: 'widget.ts',
        mode: 'target-native' as const,
        typescript: `export class Widget { marker = 'WRAPPER_CLASS_MARKER'; }
`,
      },
    ];
    const symbols = collectExportSymbols(modules);
    const contract =
      `export { createWidget } from './widgetRaw.ts';\n` + renderCompanionContractExports(modules, symbols);
    const sources = new Map([
      ['entry.ts', `import { createWidget } from './contract.ts'; createWidget();`],
      ['contract.ts', contract],
      ...modules.map((module) => [module.fileName, module.typescript] as const),
    ]);

    const result = await build({
      bundle: true,
      entryPoints: ['entry.ts'],
      format: 'esm',
      logLevel: 'silent',
      plugins: [
        {
          name: 'virtual-companion-package',
          setup(buildApi) {
            buildApi.onResolve({ filter: /.*/ }, ({ path, importer }) => ({
              namespace: 'companion-test',
              path: path.startsWith('./') ? new URL(path, `file:///${importer}`).pathname.slice(1) : path,
            }));
            buildApi.onLoad({ filter: /.*/, namespace: 'companion-test' }, ({ path }) => ({
              contents: sources.get(path),
              loader: 'ts',
            }));
          },
        },
      ],
      treeShaking: true,
      write: false,
    });
    const output = result.outputFiles[0].text;

    expect(output).toContain('FREE_FUNCTION_MARKER');
    expect(output).not.toContain('WRAPPER_CLASS_MARKER');
  });

  it('identifies only header-owned obsolete generated artifacts', () => {
    const header = '// Generated from crates/flight-widget/';
    const stale = collectStaleGeneratedFileNames(
      new Map([
        ['current.ts', `${header}src/current.rs by flight-compiler.\n`],
        ['obsolete.test.ts', `${header}tests/obsolete_test.rs by flight-compiler.\n`],
        ['manual.ts', 'export const manual = true;\n'],
        ['other-crate.ts', '// Generated from crates/flight-other/src/value.rs by flight-compiler.\n'],
      ]),
      new Set(['current.ts']),
      header,
    );

    expect(stale).toEqual(['obsolete.test.ts']);
    expect(hasGeneratedProvenanceHeader(`${header}src/obsolete.rs by flight-compiler.\n`)).toBe(true);
    expect(hasGeneratedProvenanceHeader('export class Handwritten {}\n')).toBe(false);
  });
});

describe('resolveRustExportName', () => {
  const symbols = new Map([
    ['decodeUTF8', { fileName: 'utf8.ts', hasType: false, hasValue: true }],
    ['measureText', { fileName: 'text.ts', hasType: false, hasValue: true }],
    ['WidgetRaw', { fileName: 'widget.ts', hasType: true, hasValue: false }],
  ]);
  const exportNames = new Map([['decode_utf8', 'decodeUTF8']]);

  it('resolves explicit re-exports through export-name mappings and default names', () => {
    expect(resolveRustExportName('decode_utf8', symbols, exportNames)).toBe('decodeUTF8');
    expect(resolveRustExportName('decode_utf8', symbols, exportNames, 'utf8.ts')).toBe('decodeUTF8');
    expect(resolveRustExportName('measure_text', symbols, exportNames, 'text.ts')).toBe('measureText');
    expect(resolveRustExportName('Widget', symbols, exportNames)).toBe('WidgetRaw');
  });

  it('fails deterministically for missing or misowned mapped symbols', () => {
    expect(() => resolveRustExportName('decode_utf8', symbols, new Map())).toThrow(
      'Rust export decode_utf8 has no TypeScript symbol',
    );
    expect(() => resolveRustExportName('decode_utf8', symbols, exportNames, 'text.ts')).toThrow(
      'Rust export decode_utf8 (export-name decodeUTF8) has no TypeScript symbol in text.ts',
    );
    expect(() => resolveRustExportName('decode_utf8', symbols, new Map([['decode_utf8', 'decodeUtf8Text']]))).toThrow(
      'Rust export decode_utf8 (export-name decodeUtf8Text) has no TypeScript symbol',
    );
  });
});
