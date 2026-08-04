import type { LayoutNode } from '@flighthq/types/contract';

import { enableLayoutGuards } from './enableLayoutGuards';
import { createLayoutState } from './layoutState';
import { resolveLayoutTree } from './resolveLayoutTree';

describe('enableLayoutGuards', () => {
  it('warns with the structured explanation for a silent sentinel', () => {
    const warn = vi.fn();
    const state = createLayoutState();
    enableLayoutGuards(state, warn);
    const root: LayoutNode = { containerStyle: null, itemStyle: null, kind: 'acme.Root', parentIndex: -1 };
    resolveLayoutTree(new Float32Array(3), state, { nodes: [root] }, new Float32Array(2), 100, 100);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ kind: 'OutputTooSmall' }));
  });
});
