import type {
  Node2D,
  Scene2DAssetReference,
  Scene2DContentReference,
  Scene2DDocument,
  Scene2DSlotReference,
} from '@flighthq/types/contract';
import { Scene2DContentReferenceKind } from '@flighthq/types/contract';

export function createScene2DAssetReference(
  name: string,
  uri: string,
  target: Node2D,
  required = true,
): Scene2DAssetReference {
  target.name = name;
  return { content: null, kind: Scene2DContentReferenceKind.Asset, name, required, target, uri };
}

export function createScene2DDocument(
  root: Node2D,
  references: Scene2DContentReference[] = [],
  sourceKind: string | null = null,
): Scene2DDocument {
  return { references, root, sourceKind };
}

export function createScene2DSlotReference(
  name: string,
  target: Node2D,
  linkage: string | null = null,
  required = true,
): Scene2DSlotReference {
  target.name = name;
  return { content: null, kind: Scene2DContentReferenceKind.Slot, linkage, name, required, target };
}
