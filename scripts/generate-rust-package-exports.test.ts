import { describe, expect, it } from 'vitest';

import {
  collectCompanionFileNames,
  collectContractModuleNames,
  collectExportSymbols,
  collectPublicRootNames,
  collectRustPublicUses,
  collectStaleGeneratedFileNames,
  hasGeneratedProvenanceHeader,
  renderPublicExports,
} from './generate-rust-package-exports.ts';

describe('renderPublicExports', () => {
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

    expect(symbols.get('Widget')).toEqual({ fileName: 'widget.ts', hasType: true, hasValue: true });
    expect(collectContractModuleNames(contract)).toEqual(new Set(['support', 'widget_raw']));
    expect(collectPublicRootNames(crateRoot)).toEqual(['RootOnly', 'WidgetRaw', 'createWidget']);
    expect(collectRustPublicUses(crateRoot)).toContainEqual({ moduleName: 'contract', wildcard: true });

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
