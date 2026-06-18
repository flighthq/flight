import { addNodeChild, getNodeParent, invalidateNodeAppearance } from '@flighthq/node';
import type { DisplayObject, MaskGroup, PartialNode } from '@flighthq/types';
import { MaskGroupKind } from '@flighthq/types';

import { createDisplayObjectGeneric } from './displayObject';

export function createMaskGroup(obj?: Readonly<PartialNode<MaskGroup>>): MaskGroup {
  const out = createDisplayObjectGeneric(MaskGroupKind, obj as Readonly<PartialNode<DisplayObject>>) as MaskGroup;
  out.mask = null;
  if (obj?.mask != null) setMaskGroupMask(out, obj.mask);
  return out;
}

// Sets the group's clip mask. The mask is parented to the group (so it inherits the group's transform
// and is owned by it); the render mask pass marks it so it is drawn into the stencil/clip rather than
// as visible content, while the group's other children render clipped to it. Pass null to remove.
export function setMaskGroupMask(group: MaskGroup, mask: DisplayObject | null): void {
  if (mask !== null && getNodeParent(mask) !== group) addNodeChild(group, mask);
  group.mask = mask;
  invalidateNodeAppearance(group);
}
