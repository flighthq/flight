import { containsNodeChild, getNodeParent } from '@flighthq/node';
import { MaskGroupKind } from '@flighthq/types';

import { createDisplayObject } from './displayObject';
import { createMaskGroup, setMaskGroupMask } from './maskGroup';

describe('createMaskGroup', () => {
  it('creates a MaskGroup-kind container with a null mask by default', () => {
    const group = createMaskGroup();
    expect(group.kind).toBe(MaskGroupKind);
    expect(group.mask).toBeNull();
  });

  it('wires a mask passed at construction as a child', () => {
    const mask = createDisplayObject();
    const group = createMaskGroup({ mask });
    expect(group.mask).toBe(mask);
    expect(getNodeParent(mask)).toBe(group);
    expect(containsNodeChild(group, mask)).toBe(true);
  });
});

describe('setMaskGroupMask', () => {
  it('sets the mask and parents it to the group', () => {
    const group = createMaskGroup();
    const mask = createDisplayObject();
    setMaskGroupMask(group, mask);
    expect(group.mask).toBe(mask);
    expect(getNodeParent(mask)).toBe(group);
    expect(containsNodeChild(group, mask)).toBe(true);
  });

  it('accepts null', () => {
    const group = createMaskGroup();
    setMaskGroupMask(group, null);
    expect(group.mask).toBeNull();
  });
});
