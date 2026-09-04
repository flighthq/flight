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
  initializeScene2DDocument(out, root, slots, sourceKind, backgroundColor, imageResources, audioResources);
  return finishEntity(out);
}

export function createScene2DSlotReference(
  name: string,
  target: Node2D,
  linkage: string | null = null,
  required = true,
): Scene2DSlotReference {
  const out = allocateEntity<Scene2DSlotReference>();
  initializeScene2DSlotReference(out, name, target, linkage, required);
  return finishEntity(out);
}

export function initializeScene2DDocument(
  out: EntityConstruction<Scene2DDocument>,
  root: Node2D,
  slots: Scene2DSlotReference[] = [],
  sourceKind: string | null = null,
  backgroundColor: number | null = null,
  imageResources: ImageResourceReference[] = [],
  audioResources: AudioResourceReference[] = [],
): void {
  out.audioResources = audioResources;
  out.backgroundColor = backgroundColor;
  out.imageResources = imageResources;
  out.root = root;
  out.slots = slots;
  out.sourceKind = sourceKind;
}

export function initializeScene2DSlotReference(
  out: EntityConstruction<Scene2DSlotReference>,
  name: string,
  target: Node2D,
  linkage: string | null = null,
  required = true,
): void {
  target.name = name;
  out.content = null;
  out.linkage = linkage;
  out.name = name;
  out.required = required;
  out.target = target;
}
