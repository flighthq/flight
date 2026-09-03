import { createMatrix, inverseMatrixTransformPointXY, matrixTransformPointXY } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkin2D } from '@flighthq/skeleton2d/contract';
import type {
  ImportDiagnostic,
  Matrix,
  RiveArtboardGraph,
  RiveCoreObject,
  RiveWeightedPoint,
  Skin2D,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, RiveWeightedPointKind } from '@flighthq/types/contract';

import { isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

/**
 * Reads a skinned path's `Weight`/`CubicWeight` records into a `Skin2D`.
 *
 * **The influences are packed, four to a word.** `values` and `indices` are each a single uint
 * holding four bytes — a weight of 0–255 and a bone reference — read low byte first. A zero weight is
 * an unused slot, which is how a fixed-width record produces `Skin2D`'s variable influence counts.
 *
 * **A weight's index names a tendon, not a bone, and the numbering starts at 1.** The runtime's bone
 * table reserves slot 0 for the identity, so tendon *n* sits at index *n + 1*; a tendon then names
 * the bone. Reading the index as a bone index directly would silently address the wrong bone in every
 * file with more than one.
 *
 * **The offsets bake the bind, which is what `Skin2D` stores.** Rive deforms a point as
 * `Σ wᵢ · (boneWorldᵢ · tendonInverseBindᵢ) · (skinWorld · p)`, blending matrices and transforming
 * once; `Skin2D` stores a per-influence offset already in bone space and blends positions. The two
 * are the same arithmetic — a matrix product is linear — so the offset this writes is
 * `tendonInverseBindᵢ · (skinWorld · p)`. A tendon states its **bind**, which is inverted here, and
 * the skin states its own transform separately.
 *
 * Storing a vertex in each influencing bone's bind-local frame is the universal inverse-bind
 * convention, not a quirk of this format — glTF names the same matrices `inverseBindMatrices`. The
 * equivalence above is therefore checkable from the arithmetic alone, which is why it is stated as a
 * derivation a reader can redo rather than as a claim to take on trust.
 */
export function createRiveSkin2D(
  artboard: Readonly<RiveArtboardGraph>,
  skinnableIndex: number,
  boneIndices: readonly number[],
  points: readonly Readonly<RiveWeightedPoint>[],
  diagnostics?: ImportDiagnostic[],
): Skin2D | null {
  const skinIndex = findRiveSkin(artboard, skinnableIndex);
  if (skinIndex < 0) return null;

  const skinWorld = readRiveMatrix(artboard.objects[skinIndex], RIVE_SKIN_XX, RIVE_SKIN_YX, RIVE_SKIN_XY, RIVE_SKIN_YY);
  const tendons = collectRiveTendonBones(artboard, skinIndex, boneIndices);

  const influenceCounts = new Uint16Array(points.length);
  const influences: number[] = [];
  for (let position = 0; position < points.length; position++) {
    const point = points[position];
    const weightIndex = findRiveWeight(artboard, point.vertex);
    if (weightIndex < 0) continue;

    const weight = artboard.objects[weightIndex];
    const packed = readRiveWeightSlots(weight, point.kind);
    if (packed === null) continue;

    matrixTransformPointXY(_bindSpace, skinWorld, point.x, point.y);
    let written = 0;
    for (let slot = 0; slot < RIVE_INFLUENCES_PER_WEIGHT; slot++) {
      const amount = readRivePackedByte(packed.values, slot);
      if (amount === 0) continue;
      const tendon = readRivePackedByte(packed.indices, slot);
      // Index 0 is the runtime's identity slot rather than a tendon, so it names no bone and cannot
      // be expressed as one. Dropping it silently would leave the vertex under-weighted and simply
      // in the wrong place, so it is reported.
      if (tendon === RIVE_IDENTITY_BONE_SLOT || tendon > tendons.length) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Drop,
          'rive.unresolved-weight-bone',
          'createRiveSkin2D',
          { index: tendon, vertex: point.vertex },
        );
        continue;
      }
      const resolved = tendons[tendon - 1];
      inverseMatrixTransformPointXY(_boneSpace, resolved.bind, _bindSpace.x, _bindSpace.y);
      influences.push(resolved.boneIndex, _boneSpace.x, _boneSpace.y, amount / RIVE_WEIGHT_SCALE);
      written++;
    }
    influenceCounts[position] = written;
  }

  return createSkin2D(influenceCounts, new Float32Array(influences));
}

interface RiveTendonBone {
  boneIndex: number;
  /** The tendon's stated BIND. The offset transform inverts it rather than storing the inverse. */
  bind: Matrix;
}

// Tendons are the skin's own children, and their order is the numbering a weight's index addresses.
function collectRiveTendonBones(
  artboard: Readonly<RiveArtboardGraph>,
  skinIndex: number,
  boneIndices: readonly number[],
): RiveTendonBone[] {
  const tendons: RiveTendonBone[] = [];
  for (let index = skinIndex + 1; index < artboard.objects.length; index++) {
    const object = artboard.objects[index];
    if (object.typeKey !== RIVE_TENDON || artboard.parentIndices[index] !== skinIndex) continue;
    const bone = readRiveNumber(object, RIVE_TENDON_BONE_ID, -1);
    tendons.push({
      boneIndex: bone >= 0 && bone < boneIndices.length ? boneIndices[bone] : -1,
      bind: readRiveMatrix(object, RIVE_TENDON_XX, RIVE_TENDON_YX, RIVE_TENDON_XY, RIVE_TENDON_YY),
    });
  }
  return tendons;
}

function findRiveSkin(artboard: Readonly<RiveArtboardGraph>, skinnableIndex: number): number {
  for (let index = skinnableIndex + 1; index < artboard.objects.length; index++) {
    if (artboard.objects[index].typeKey === RIVE_SKIN && artboard.parentIndices[index] === skinnableIndex) return index;
  }
  return -1;
}

// A weight is the vertex's own child, which is what ties a set of influences to one position.
function findRiveWeight(artboard: Readonly<RiveArtboardGraph>, vertexIndex: number): number {
  for (let index = vertexIndex + 1; index < artboard.objects.length; index++) {
    if (artboard.parentIndices[index] !== vertexIndex) continue;
    if (isRiveCoreTypeDerivedFrom(artboard.objects[index].typeKey, RIVE_WEIGHT)) return index;
  }
  return -1;
}

// The handle pairs live only on a CubicWeight; asking a plain Weight for them yields nothing rather
// than falling back to the anchor's, since inheriting would invent influences the file did not state.
function readRiveWeightSlots(
  weight: Readonly<RiveCoreObject>,
  kind: RiveWeightedPointKind,
): { indices: number; values: number } | null {
  if (kind === RiveWeightedPointKind.Point) {
    return {
      indices: readRiveNumber(weight, RIVE_WEIGHT_INDICES, 0),
      values: readRiveNumber(weight, RIVE_WEIGHT_VALUES, 0),
    };
  }
  if (!isRiveCoreTypeDerivedFrom(weight.typeKey, RIVE_CUBIC_WEIGHT)) return null;
  if (kind === RiveWeightedPointKind.In) {
    return {
      indices: readRiveNumber(weight, RIVE_WEIGHT_IN_INDICES, 0),
      values: readRiveNumber(weight, RIVE_WEIGHT_IN_VALUES, 0),
    };
  }
  return {
    indices: readRiveNumber(weight, RIVE_WEIGHT_OUT_INDICES, 0),
    values: readRiveNumber(weight, RIVE_WEIGHT_OUT_VALUES, 0),
  };
}

// Four bytes to a word, low byte first — the order the runtime unpacks them in.
function readRivePackedByte(packed: number, slot: number): number {
  return (packed >>> (slot * 8)) & 0xff;
}

// Rive names the matrix cells rather than ordering them, and its key order is xx, yx, xy, yy — which
// is NOT the column order, so the cells are read by name.
function readRiveMatrix(
  source: Readonly<RiveCoreObject>,
  xxKey: number,
  yxKey: number,
  xyKey: number,
  yyKey: number,
): Matrix {
  return createMatrix(
    readRiveNumber(source, xxKey, 1),
    readRiveNumber(source, xyKey, 0),
    readRiveNumber(source, yxKey, 0),
    readRiveNumber(source, yyKey, 1),
    readRiveNumber(source, xxKey + RIVE_MATRIX_TX_OFFSET, 0),
    readRiveNumber(source, xxKey + RIVE_MATRIX_TY_OFFSET, 0),
  );
}

function readRiveNumber(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value;
}

const RIVE_SKIN = 43;
const RIVE_TENDON = 44;
const RIVE_WEIGHT = 45;
const RIVE_CUBIC_WEIGHT = 46;

const RIVE_TENDON_BONE_ID = 95;
const RIVE_TENDON_XX = 96;
const RIVE_TENDON_YX = 97;
const RIVE_TENDON_XY = 98;
const RIVE_TENDON_YY = 99;
const RIVE_WEIGHT_VALUES = 102;
const RIVE_WEIGHT_INDICES = 103;
const RIVE_SKIN_XX = 104;
const RIVE_SKIN_YX = 105;
const RIVE_SKIN_XY = 106;
const RIVE_SKIN_YY = 107;
const RIVE_WEIGHT_IN_VALUES = 110;
const RIVE_WEIGHT_IN_INDICES = 111;
const RIVE_WEIGHT_OUT_VALUES = 112;
const RIVE_WEIGHT_OUT_INDICES = 113;

// Both matrices state tx and ty four and five keys past their xx, so one offset serves both.
const RIVE_MATRIX_TX_OFFSET = 4;
const RIVE_MATRIX_TY_OFFSET = 5;

const RIVE_INFLUENCES_PER_WEIGHT = 4;
const RIVE_WEIGHT_SCALE = 255;
// The runtime's bone table holds the identity at slot 0, so tendon numbering starts at 1.
const RIVE_IDENTITY_BONE_SLOT = 0;

const _bindSpace = { x: 0, y: 0 };
const _boneSpace = { x: 0, y: 0 };
