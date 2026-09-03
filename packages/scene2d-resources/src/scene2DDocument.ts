import { createEntity } from '@flighthq/entity/contract';
import type {
  AudioResourceReference,
  ImageResourceReference,
  Node2D,
  Scene2DDocument,
  Scene2DSlotReference,
} from '@flighthq/types/contract';

export function createScene2DDocument(
  root: Node2D,
  slots: Scene2DSlotReference[] = [],
  sourceKind: string | null = null,
  backgroundColor: number | null = null,
  imageResources: ImageResourceReference[] = [],
  audioResources: AudioResourceReference[] = [],
): Scene2DDocument {
  return createEntity({ audioResources, backgroundColor, imageResources, root, slots, sourceKind });
}

export function createScene2DSlotReference(
  name: string,
  target: Node2D,
  linkage: string | null = null,
  required = true,
): Scene2DSlotReference {
  target.name = name;
  return createEntity({ content: null, linkage, name, required, target });
}
