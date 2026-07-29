import { addNodeChild, getNodeParent, removeNodeChild } from '@flighthq/node/contract';
import type { Node2D, Scene2DContentReference } from '@flighthq/types/contract';

export function setScene2DContentReferenceContent(reference: Scene2DContentReference, content: Node2D | null): void {
  const previous = reference.content;
  if (previous !== null && getNodeParent(previous) === reference.target) {
    removeNodeChild(reference.target, previous);
  }
  reference.content = content;
  if (content !== null) addNodeChild(reference.target, content);
}
