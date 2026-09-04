import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AudioResourceReference,
  EntityConstruction,
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
  const out = allocateEntity<Scene2DDocument>();
  out.audioResources = audioResources;
  out.backgroundColor = backgroundColor;
  out.imageResources = imageResources;
  out.root = root;
  out.slots = slots;
  out.sourceKind = sourceKind;
  return finishEntity(out);
}

export function createScene2DSlotReference(
  name: string,
  target: Node2D,
  linkage: string | null = null,
  required = true,
): Scene2DSlotReference {
  target.name = name;
  const out = allocateEntity<Scene2DDocument>();
  out.content = null;
  out.linkage = linkage;
  out.name = name;
  out.required = required;
  out.target = target;
  return finishEntity(out);
}
