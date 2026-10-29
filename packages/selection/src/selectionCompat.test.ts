import { Entity, EntityRuntimeKey } from '@flighthq/entity/contract';
import { createNode } from '@flighthq/node/contract';
import type { NodeRef } from '@flighthq/node/contract';

import * as selection from './index.ts';

describe('Selection compatibility surface', () => {
  it('preserves the exact public value export set', () => {
    expect(Object.keys(selection).sort()).toEqual([
      'addLassoSelectionPoint',
      'addNodeToSelection',
      'applyPointerSelectionPolicy',
      'applyPointerUpSelectionPolicy',
      'beginLassoSelection',
      'beginMarqueeSelection',
      'clearSelection',
      'createLassoSelection',
      'createMarqueeSelection',
      'createSelectionState',
      'endLassoSelection',
      'endMarqueeSelection',
      'findNodesInLassoSelection',
      'findNodesInMarqueeSelection',
      'getActiveNode',
      'getLassoSelectionPath',
      'getMarqueeRectangle',
      'getSelectedNodes',
      'getSelectionCount',
      'getSelectionSignals',
      'hasSelection',
      'isNodeSelected',
      'removeNodeFromSelection',
      'selectAllNodes',
      'selectNode',
      'toggleNodeSelection',
      'updateMarqueeSelection',
    ]);
  });

  it('keeps private gesture and selection state outside the raw entity records', () => {
    const lasso = selection.createLassoSelection();
    const marquee = selection.createMarqueeSelection();
    const state = selection.createSelectionState();

    for (const raw of [lasso, marquee, state]) {
      const record = raw as Record<PropertyKey, unknown>;
      expect(record[EntityRuntimeKey]).toBeUndefined();
      expect(Object.keys(raw)).toEqual([]);
      expect(Object.getOwnPropertyDescriptor(raw, EntityRuntimeKey)).toMatchObject({
        enumerable: false,
        value: undefined,
      });
      expect(record.state).toBeUndefined();
    }
  });

  it('retains one stable Entity wrapper without replacing raw identity or private state', () => {
    const state = selection.createSelectionState<NodeRef>();
    const node = createNode('SelectionCompatNode');
    selection.selectNode(state, node);

    const wrapper = Entity.from(state);
    expect(wrapper.raw).toBe(state);
    expect(Entity.from(state)).toBe(wrapper);
    expect(selection.getSelectedNodes(state)).toEqual([node]);
    expect(selection.getActiveNode(state)).toBe(node);
    expect((state as Record<PropertyKey, unknown>)[EntityRuntimeKey]).toBeUndefined();

    expectTypeOf(selection.createSelectionState<NodeRef>()).toEqualTypeOf<selection.SelectionState<NodeRef>>();
  });
});
