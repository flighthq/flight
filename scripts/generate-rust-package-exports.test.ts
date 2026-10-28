import { describe, expect, it } from 'vitest';

import { renderPublicExports } from './generate-rust-package-exports.ts';

describe('renderPublicExports', () => {
  it('routes target-native OOP wrappers to companions and raw functions through the contract lane', () => {
    const output = renderPublicExports(
      [
        { fileName: 'widgetRaw.ts', mode: 'generate' },
        { fileName: 'widget.ts', mode: 'target-native' },
      ],
      new Map([
        ['WidgetRaw', { fileName: 'widgetRaw.ts', hasType: true, hasValue: false }],
        ['createWidget', { fileName: 'widgetRaw.ts', hasType: false, hasValue: true }],
        ['Widget', { fileName: 'widget.ts', hasType: true, hasValue: true }],
        ['wrapWidget', { fileName: 'widget.ts', hasType: false, hasValue: true }],
      ]),
      ['Widget', 'WidgetRaw', 'createWidget', 'wrapWidget'],
    );

    expect(output).toBe(`export {
  createWidget,
  wrapWidget,
} from './contract.ts';

export type { WidgetRaw } from './contract.ts';
export {
  Widget,
} from './widget.ts';
`);
  });
});
