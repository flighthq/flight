// Generated from crates/flight-selection/tests/lasso_selection_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createRectangle } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import {
  addLassoSelectionPoint,
  beginLassoSelection,
  createLassoSelection,
  endLassoSelection,
  getLassoSelectionPath,
  initializeLassoSelection,
} from './contract.ts';
import { rustTestSupport as crate } from './rustTestSupport.ts';

describe('addLassoSelectionPoint', () => {
  it('appends line points only during an active gesture', () => {
    let lasso = createLassoSelection();
    addLassoSelectionPoint(lasso, 99.0, 99.0);
    beginLassoSelection(lasso, 1.0, 2.0);
    addLassoSelectionPoint(lasso, 3.0, 4.0);
    endLassoSelection(lasso);
    addLassoSelectionPoint(lasso, 5.0, 6.0);
    expect(getLassoSelectionPath(lasso).data).toEqual([1.0, 2.0, 3.0, 4.0]);
  });
});

describe('beginLassoSelection', () => {
  it('resets the reused path and starts it with a move command', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 1.0, 2.0);
    addLassoSelectionPoint(lasso, 3.0, 4.0);
    endLassoSelection(lasso);
    beginLassoSelection(lasso, 10.0, 11.0);
    expect(crate.hasOnlyMoveCommand(getLassoSelectionPath(lasso))).toBe(true);
    expect(getLassoSelectionPath(lasso).data).toEqual([10.0, 11.0]);
  });
});

describe('createLassoSelection', () => {
  it('creates an empty even odd path', () => {
    const lasso = createLassoSelection();
    const path = getLassoSelectionPath(lasso);
    expect(path.commands.length === 0).toBe(true);
    expect(path.data.length === 0).toBe(true);
    expect(crate.hasEvenOddWinding(path)).toBe(true);
  });
});

describe('endLassoSelection', () => {
  it('closes an active path once and returns the live path object', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 1.0, 2.0);
    addLassoSelectionPoint(lasso, 3.0, 4.0);
    const returned = endLassoSelection(lasso);
    endLassoSelection(lasso);
    expect(crate.samePath(returned, getLassoSelectionPath(lasso))).toBe(true);
    expect(crate.hasMoveLineCloseCommands(getLassoSelectionPath(lasso))).toBe(true);
  });
});

describe('findNodesInLassoSelection', () => {
  // Rust-only: clears a reused out and keeps its capacity
  it('includes degenerate boundary edges without changing even odd fill', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 0.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 10.0);
    addLassoSelectionPoint(lasso, 0.0, 10.0);
    endLassoSelection(lasso);
    const boundary = crate.createBoundedNode('boundary', createRectangle(10.0, 0.0, 0.0, 0.0), true, true);
    expect(crate.sameNodes(crate.lassoMatches(lasso, [boundary]), [boundary])).toBe(true);
  });
  it('selects bounds centers inside or on the lasso boundary in caller order', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 0.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 10.0);
    addLassoSelectionPoint(lasso, 0.0, 10.0);
    endLassoSelection(lasso);
    const inside = crate.createBoundedNode('inside', createRectangle(4.0, 4.0, 2.0, 2.0), true, true);
    const boundary = crate.createBoundedNode('boundary', createRectangle(9.0, 4.0, 2.0, 2.0), true, true);
    const outside = crate.createBoundedNode('outside', createRectangle(11.0, 11.0, 2.0, 2.0), true, true);
    expect(crate.sameNodes(crate.lassoMatches(lasso, [outside, boundary, inside]), [boundary, inside])).toBe(true);
  });
  it('tests the bounds center rather than rectangle overlap', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 0.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 10.0);
    addLassoSelectionPoint(lasso, 0.0, 10.0);
    endLassoSelection(lasso);
    const overlapsWithCenterOutside = crate.createBoundedNode(
      'overlap',
      createRectangle(9.0, 9.0, 10.0, 10.0),
      true,
      true,
    );
    expect(crate.lassoMatches(lasso, [overlapsWithCenterOutside]).length === 0).toBe(true);
  });
  it('returns no candidates for a path with fewer than three points', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 0.0, 0.0);
    addLassoSelectionPoint(lasso, 10.0, 0.0);
    endLassoSelection(lasso);
    const candidate = crate.createBoundedNode('node', createRectangle(0.0, 0.0, 1.0, 1.0), true, true);
    expect(crate.lassoMatches(lasso, [candidate]).length === 0).toBe(true);
  });
});

describe('getLassoSelectionPath', () => {
  it('exposes the same path throughout a gesture', () => {
    let lasso = createLassoSelection();
    const original = getLassoSelectionPath(lasso);
    beginLassoSelection(lasso, 1.0, 2.0);
    expect(crate.samePath(original, getLassoSelectionPath(lasso))).toBe(true);
  });
});

describe('initializeLassoSelection', () => {
  it('restores an empty even odd path', () => {
    let lasso = createLassoSelection();
    beginLassoSelection(lasso, 1.0, 2.0);
    initializeLassoSelection(lasso);
    const path = getLassoSelectionPath(lasso);
    expect(path.commands.length === 0).toBe(true);
    expect(path.data.length === 0).toBe(true);
    expect(crate.hasEvenOddWinding(path)).toBe(true);
  });
});
