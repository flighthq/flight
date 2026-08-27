import { createNode, createNodeRuntime, initBoundsRectangleRuntimeTrait } from '@flighthq/node/contract';
import type { BoundsNodeAny, HasBoundsRectangleRuntime, NodeRuntime, RectangleLike } from '@flighthq/types/contract';
import { PathCommand } from '@flighthq/types/contract';

import {
  addLassoSelectionPoint,
  beginLassoSelection,
  createLassoSelection,
  endLassoSelection,
  findNodesInLassoSelection,
  getLassoSelectionPath,
} from './index';

describe('addLassoSelectionPoint', () => {
  it('appends line points only during an active gesture', () => {
    const lasso = createLassoSelection();
    addLassoSelectionPoint(lasso, 99, 99);
    beginLassoSelection(lasso, 1, 2);
    addLassoSelectionPoint(lasso, 3, 4);
    endLassoSelection(lasso);
    addLassoSelectionPoint(lasso, 5, 6);

    expect(getLassoSelectionPath(lasso).data).toEqual([1, 2, 3, 4]);
  });
});

describe('beginLassoSelection', () => {
  it('resets the reused path and starts it with a move command', () => {
    const lasso = createLassoSelection();
    beginLassoSelection(lasso, 1, 2);
    addLassoSelectionPoint(lasso, 3, 4);
    endLassoSelection(lasso);

    beginLassoSelection(lasso, 10, 11);

    expect(getLassoSelectionPath(lasso).commands).toEqual([PathCommand.MOVE_TO]);
    expect(getLassoSelectionPath(lasso).data).toEqual([10, 11]);
  });
});

describe('createLassoSelection', () => {
  it('creates an empty even-odd path', () => {
    const path = getLassoSelectionPath(createLassoSelection());

    expect(path).toMatchObject({ commands: [], data: [], winding: 'evenOdd' });
  });
});

describe('endLassoSelection', () => {
  it('closes an active path once and returns the live path object', () => {
    const lasso = createLassoSelection();
    beginLassoSelection(lasso, 1, 2);
    addLassoSelectionPoint(lasso, 3, 4);

    const path = endLassoSelection(lasso);
    endLassoSelection(lasso);

    expect(path).toBe(getLassoSelectionPath(lasso));
    expect(path.commands).toEqual([PathCommand.MOVE_TO, PathCommand.LINE_TO, PathCommand.CLOSE]);
  });
});

describe('findNodesInLassoSelection', () => {
  it('selects bounds centers inside or on the lasso boundary in caller order', () => {
    const lasso = createLassoSelection();
    beginLassoSelection(lasso, 0, 0);
    addLassoSelectionPoint(lasso, 10, 0);
    addLassoSelectionPoint(lasso, 10, 10);
    addLassoSelectionPoint(lasso, 0, 10);
    endLassoSelection(lasso);
    const inside = createBoundedNode('inside', { x: 4, y: 4, width: 2, height: 2 });
    const boundary = createBoundedNode('boundary', { x: 9, y: 4, width: 2, height: 2 });
    const outside = createBoundedNode('outside', { x: 11, y: 11, width: 2, height: 2 });

    expect(findNodesInLassoSelection(lasso, [outside, boundary, inside])).toEqual([boundary, inside]);
  });

  it('returns no candidates for a path with fewer than three points', () => {
    const lasso = createLassoSelection();
    beginLassoSelection(lasso, 0, 0);
    addLassoSelectionPoint(lasso, 10, 0);
    endLassoSelection(lasso);

    expect(findNodesInLassoSelection(lasso, [createBoundedNode('node', { x: 0, y: 0, width: 1, height: 1 })])).toEqual(
      [],
    );
  });
});

describe('getLassoSelectionPath', () => {
  it('exposes the same path throughout a gesture', () => {
    const lasso = createLassoSelection();
    const path = getLassoSelectionPath(lasso);

    beginLassoSelection(lasso, 1, 2);

    expect(getLassoSelectionPath(lasso)).toBe(path);
  });
});

function createBoundedNode(name: string, rectangle: Readonly<RectangleLike>): BoundsNodeAny {
  return createNode('SelectionBoundsTestNode', { name }, undefined, () => {
    const runtime = createNodeRuntime() as NodeRuntime & HasBoundsRectangleRuntime;
    initBoundsRectangleRuntimeTrait(runtime, {
      computeLocalBoundsRectangle(out) {
        out.x = rectangle.x;
        out.y = rectangle.y;
        out.width = rectangle.width;
        out.height = rectangle.height;
      },
    });
    return runtime;
  }) as BoundsNodeAny;
}
