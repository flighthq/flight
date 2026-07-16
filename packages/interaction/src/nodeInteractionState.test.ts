import { createDisplayObject } from '@flighthq/displayobject';
import { createRectangle } from '@flighthq/geometry';

import {
  createNodeInteractionState,
  enableNodeInteractionState,
  getNodeCursor,
  getNodeHitArea,
  getNodeInteractionState,
  getNodeTabIndex,
  hasNodeHitTestChildren,
  isNodeFocusable,
  isNodeHitTestEnabled,
  setNodeCursor,
  setNodeFocusable,
  setNodeHitArea,
  setNodeHitTestChildren,
  setNodeHitTestEnabled,
  setNodeTabIndex,
} from './nodeInteractionState';

describe('createNodeInteractionState', () => {
  it('returns a cell with every field at its default', () => {
    expect(createNodeInteractionState()).toEqual({
      cursor: null,
      focusable: false,
      hitArea: null,
      hitTestChildren: true,
      hitTestEnabled: true,
      tabIndex: -1,
    });
  });
});

describe('enableNodeInteractionState', () => {
  it('creates the cell on first use and returns the same instance thereafter', () => {
    const obj = createDisplayObject();
    const first = enableNodeInteractionState(obj);
    expect(getNodeInteractionState(obj)).toBe(first);
    expect(enableNodeInteractionState(obj)).toBe(first);
  });
});

describe('getNodeCursor', () => {
  it('is null by default and returns the set cursor', () => {
    const obj = createDisplayObject();
    expect(getNodeCursor(obj)).toBeNull();
    setNodeCursor(obj, 'pointer');
    expect(getNodeCursor(obj)).toBe('pointer');
  });
});

describe('getNodeHitArea', () => {
  it('is null by default and returns the set proxy', () => {
    const obj = createDisplayObject();
    const area = createRectangle(0, 0, 10, 10);
    expect(getNodeHitArea(obj)).toBeNull();
    setNodeHitArea(obj, area);
    expect(getNodeHitArea(obj)).toBe(area);
  });
});

describe('getNodeInteractionState', () => {
  it('is null until a field is set', () => {
    const obj = createDisplayObject();
    expect(getNodeInteractionState(obj)).toBeNull();
    setNodeFocusable(obj, true);
    expect(getNodeInteractionState(obj)).not.toBeNull();
  });
});

describe('getNodeTabIndex', () => {
  it('defaults to -1 and returns the set value', () => {
    const obj = createDisplayObject();
    expect(getNodeTabIndex(obj)).toBe(-1);
    setNodeTabIndex(obj, 3);
    expect(getNodeTabIndex(obj)).toBe(3);
  });
});

describe('hasNodeHitTestChildren', () => {
  it('defaults to true and reflects the setter', () => {
    const obj = createDisplayObject();
    expect(hasNodeHitTestChildren(obj)).toBe(true);
    setNodeHitTestChildren(obj, false);
    expect(hasNodeHitTestChildren(obj)).toBe(false);
  });
});

describe('isNodeFocusable', () => {
  it('defaults to false and reflects the setter', () => {
    const obj = createDisplayObject();
    expect(isNodeFocusable(obj)).toBe(false);
    setNodeFocusable(obj, true);
    expect(isNodeFocusable(obj)).toBe(true);
  });
});

describe('isNodeHitTestEnabled', () => {
  it('defaults to true and reflects the setter', () => {
    const obj = createDisplayObject();
    expect(isNodeHitTestEnabled(obj)).toBe(true);
    setNodeHitTestEnabled(obj, false);
    expect(isNodeHitTestEnabled(obj)).toBe(false);
  });
});

describe('setNodeCursor', () => {
  it('assigns and clears the cursor', () => {
    const obj = createDisplayObject();
    setNodeCursor(obj, 'grab');
    expect(getNodeCursor(obj)).toBe('grab');
    setNodeCursor(obj, null);
    expect(getNodeCursor(obj)).toBeNull();
  });
});

describe('setNodeFocusable', () => {
  it('assigns focusability', () => {
    const obj = createDisplayObject();
    setNodeFocusable(obj, true);
    expect(isNodeFocusable(obj)).toBe(true);
  });
});

describe('setNodeHitArea', () => {
  it('assigns and clears the hit-area proxy', () => {
    const obj = createDisplayObject();
    const area = createRectangle(0, 0, 5, 5);
    setNodeHitArea(obj, area);
    expect(getNodeHitArea(obj)).toBe(area);
    setNodeHitArea(obj, null);
    expect(getNodeHitArea(obj)).toBeNull();
  });
});

describe('setNodeHitTestChildren', () => {
  it('assigns subtree gating', () => {
    const obj = createDisplayObject();
    setNodeHitTestChildren(obj, false);
    expect(hasNodeHitTestChildren(obj)).toBe(false);
  });
});

describe('setNodeHitTestEnabled', () => {
  it('assigns self gating', () => {
    const obj = createDisplayObject();
    setNodeHitTestEnabled(obj, false);
    expect(isNodeHitTestEnabled(obj)).toBe(false);
  });
});

describe('setNodeTabIndex', () => {
  it('assigns the focus-order key', () => {
    const obj = createDisplayObject();
    setNodeTabIndex(obj, 7);
    expect(getNodeTabIndex(obj)).toBe(7);
  });
});
