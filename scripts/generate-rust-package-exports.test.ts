import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

import {
  collectCompanionFileNames,
  collectContractModuleNames,
  collectExportSymbols,
  collectReferencedExportNames,
  collectPublicRootNames,
  collectRustPublicUses,
  collectStaleGeneratedFileNames,
  hasGeneratedProvenanceHeader,
  renderCompanionContractExports,
  renderPublicExports,
} from './generate-rust-package-exports.ts';

describe('renderPublicExports', () => {
  it('discovers cross-module generated type references without matching comments', () => {
    const symbols = new Map([
      ['EasingFunction', { fileName: 'easingTypes.ts', hasType: true, hasValue: false }],
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
`,
        'getEasingDerivative.ts',
        symbols,
      ),
    ).toEqual(['EasingFunction']);
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
