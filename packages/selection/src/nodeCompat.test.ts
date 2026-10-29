import { createNode } from '@flighthq/node/contract';
import { describe, expect, it } from 'vitest';

import { isSameSelectionNode } from './nodeCompat.ts';

describe('isSameSelectionNode', () => {
  it('compares node identity, never structure', () => {
    const node = createNode('SelectionTestNode');
    const twin = createNode('SelectionTestNode');

    expect(isSameSelectionNode(node, node)).toBe(true);
    expect(isSameSelectionNode(node, twin)).toBe(false);
  });
});
