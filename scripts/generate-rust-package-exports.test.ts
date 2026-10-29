import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import {
  collectCompanionFileNames,
  compilerAliasArguments,
  compilerVisibilityArguments,
  collectContractModuleNames,
  collectExportSymbols,
  collectFlightDependencyCrates,
  collectReferencedExportNames,
  collectPublicRootNames,
  collectRustExportNames,
  collectRustPublicUses,
  collectStaleGeneratedFileNames,
  collectTypeScriptExportSymbols,
  dependencyAliasArguments,
  hasGeneratedProvenanceHeader,
  hasRustConstGroup,
  hasRustGenerationSemantics,
  hasRustPublicRecordDeclaration,
  mergeRustExportNames,
  renderCompanionContractExports,
  renderGeneratedImports,
  renderPublicExports,
  resolveExternalContractExports,
  resolveRustExportName,
} from './generate-rust-package-exports.ts';

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
    expect(compilerVisibilityArguments('generate-tests', crate, ['ease.rs'], 'ease.rs')).toEqual([]);
    expect(compilerVisibilityArguments('source-mode', crate, [], 'ease.rs')).toEqual([]);
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

describe('hasRustGenerationSemantics', () => {
  it('selects cross-module unions without selecting target-native surface directives', () => {
    expect(hasRustGenerationSemantics('//! flight-compiler: data-union MarkupResult=reserved-key\n')).toBe(true);
    expect(hasRustGenerationSemantics('//! flight-compiler: string-union-value Kind Ready "ready"\n')).toBe(true);
    expect(
      hasRustGenerationSemantics('//! flight-compiler: target-native\n//! flight-compiler: contract Value\n'),
    ).toBe(false);
    expect(hasRustGenerationSemantics('pub static VALUE: usize = 1;\n')).toBe(false);
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
