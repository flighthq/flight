import { addNodeChild, getNodeParent, removeNodeChild } from '@flighthq/node/contract';
import type { Node2D, Scene2DSlotReference } from '@flighthq/types/contract';

export function setScene2DSlotReferenceContent(reference: Scene2DSlotReference, content: Node2D | null): void {
  const previous = reference.content;
  if (previous === content && (content === null || getNodeParent(content) === reference.target)) return;
  if (previous !== null && getNodeParent(previous) === reference.target) {
    removeNodeChild(reference.target, previous);
  }
  reference.content = content;
  if (content !== null) addNodeChild(reference.target, content);
}
