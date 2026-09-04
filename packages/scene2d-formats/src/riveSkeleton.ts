import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { RAD_TO_DEG } from '@flighthq/math/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type { Bone2D, RiveArtboardGraph, RiveCoreObject, RiveSkeleton2DImport } from '@flighthq/types/contract';
import { TransformMode2D } from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

/**
 * Flattens an artboard's bones into a `Skeleton2D`.
 *
 * Rive keeps bones in the artboard's own component tree as `TransformComponent`s — siblings of `Node`
 * rather than nodes themselves — while `Skeleton2D` owns a flat, **parent-before-child** array and
 * propagates world transforms itself. The bridge is a topological sort, and it is well-founded rather
 * than a graph problem: every stated parent resolves and the tree holds no cycle, so ordering bones by
 * their depth in that tree already guarantees a parent precedes its children. Ties keep stream order,
 * so the result is stable for a given file.
 *
 * Returns `null` when the artboard has no bones, which is most of them — a caller pays for a skeleton
 * only when the file actually rigs something.
 */
export function createRiveSkeleton2D(artboard: Readonly<RiveArtboardGraph>): RiveSkeleton2DImport | null {
  const objects = artboard.objects;
  const boneIndices = new Array<number>(objects.length).fill(NO_BONE);

  const components: number[] = [];
  for (let index = 0; index < objects.length; index++) {
    if (isRiveCoreTypeDerivedFrom(objects[index].typeKey, RIVE_BONE)) components.push(index);
  }
  if (components.length === 0) return null;

  // Depth in the component tree is what orders the array: a bone's depth is always greater than its
  // parent's, so sorting by it puts every parent ahead of its children in one pass.
  const depths = new Map<number, number>();
  for (const component of components) depths.set(component, toRiveComponentDepth(artboard, component));
  const ordered = components.slice().sort((a, b) => (depths.get(a) ?? 0) - (depths.get(b) ?? 0) || a - b);
  for (let position = 0; position < ordered.length; position++) boneIndices[ordered[position]] = position;

  const bones: Bone2D[] = ordered.map((component) =>
    createRiveBone2D(
      objects[component],
      boneIndices[artboard.parentIndices[component]] ?? NO_BONE,
      objects,
      artboard,
      component,
    ),
  );
  const out = allocateEntity<RiveSkeleton2DImport>();
  out.boneIndices = boneIndices;
  out.skeleton = createSkeleton2D(bones);
  return finishEntity(out);
}

function createRiveBone2D(
  source: Readonly<RiveCoreObject>,
  parentIndex: number,
  objects: readonly Readonly<RiveCoreObject>[],
  artboard: Readonly<RiveArtboardGraph>,
  component: number,
): Bone2D {
  // A root bone states its own position; every other bone sits at its parent's TIP, so its local
  // translation is the parent's length along +x and nothing in y. That is the format's own rule
  // (Bone::x() returns the parent bone's length) rather than an inference from the corpus, and a
  // reader that looked for x/y on a non-root bone would find nothing and place the whole chain at the
  // origin.
  const isRoot = isRiveCoreTypeDerivedFrom(source.typeKey, RIVE_ROOT_BONE);
  const parentComponent = artboard.parentIndices[component];
  const parentLength =
    parentComponent >= 0 && parentComponent < objects.length
      ? readRiveNumber(objects[parentComponent], RIVE_BONE_LENGTH, 0)
      : 0;

  return {
    length: readRiveNumber(source, RIVE_BONE_LENGTH, 0),
    name: readRiveText(source, RIVE_NAME, ''),
    parentIndex,
    // Rive states rotation in radians; Bone2D is degrees, matching the scene-graph transform.
    rotation: readRiveNumber(source, RIVE_ROTATION, 0) * RAD_TO_DEG,
    scaleX: readRiveNumber(source, RIVE_SCALE_X, 1),
    scaleY: readRiveNumber(source, RIVE_SCALE_Y, 1),
    // Rive bones carry no shear.
    shearX: 0,
    shearY: 0,
    transformMode: TransformMode2D.Normal,
    x: isRoot ? readRiveNumber(source, RIVE_ROOT_BONE_X, 0) : parentIndex === NO_BONE ? 0 : parentLength,
    y: isRoot ? readRiveNumber(source, RIVE_ROOT_BONE_Y, 0) : 0,
  };
}

// Walks to the artboard root. The tree is acyclic and at most a few tens deep, so this needs no
// memo; the guard is a belt against a malformed file rather than an expected case.
function toRiveComponentDepth(artboard: Readonly<RiveArtboardGraph>, index: number): number {
  let depth = 0;
  let parent = artboard.parentIndices[index];
  while (parent >= 0 && depth <= artboard.objects.length) {
    depth++;
    parent = artboard.parentIndices[parent];
  }
  return depth;
}

function readRiveNumber(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value;
}

function readRiveText(source: Readonly<RiveCoreObject>, key: number, fallback: string): string {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'string' ? fallback : property.value;
}

const RIVE_BONE = 40;
const RIVE_ROOT_BONE = 41;

const RIVE_NAME = 4;
const RIVE_ROTATION = 15;
const RIVE_SCALE_X = 16;
const RIVE_SCALE_Y = 17;
const RIVE_BONE_LENGTH = 89;
const RIVE_ROOT_BONE_X = 90;
const RIVE_ROOT_BONE_Y = 91;

const NO_BONE = -1;
