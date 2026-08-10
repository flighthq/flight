import { getNodeChildren, getNodeWorldMatrix4 } from '@flighthq/node/contract';
import { applyAnimationClipToScene3D, isMesh } from '@flighthq/scene3d/contract';
import { captureMeshSkinBindPose, computeSkeleton3DJointMatrices, skinVertices } from '@flighthq/skeleton3d/contract';
import type { AabbLike, AnimationClip, Mesh, MeshSkinBindPose, Scene3D, Skeleton3D } from '@flighthq/types/contract';

export const MD5_ANIMATION_BOUNDS_ORACLE_ID = 'md5.animation-bounds';

export interface Md5DeclaredAnimationBounds {
  bounds: readonly Md5DeclaredFrameBounds[];
  frameRate: number;
}

export interface Md5DeclaredFrameBounds extends AabbLike {
  precision: AabbLike;
}

export interface Md5AnimationBoundsDeltas {
  max: { x: number; y: number; z: number };
  min: { x: number; y: number; z: number };
}

export type Md5AnimationBoundsClassification =
  | 'contained'
  | 'exact'
  | 'exceeds-representable-precision'
  | 'within-representable-precision';

export interface Md5AnimationBoundsFrameOracle {
  classification: Md5AnimationBoundsClassification;
  declared: Md5DeclaredFrameBounds;
  deltas: Md5AnimationBoundsDeltas;
  frame: number;
  observed: AabbLike;
}

export interface Md5AnimationBoundsOracleMeasured {
  frames: readonly Md5AnimationBoundsFrameOracle[];
  id: typeof MD5_ANIMATION_BOUNDS_ORACLE_ID;
  notRunReason: 'declared-bounds-contract-unresolved';
  state: 'not-run';
}

export interface Md5AnimationBoundsOracleNotRun {
  id: typeof MD5_ANIMATION_BOUNDS_ORACLE_ID;
  notRunReason:
    | 'animation-clip-missing'
    | 'declared-bounds-unreadable'
    | 'skinned-geometry-empty'
    | 'skinned-mesh-missing';
  state: 'not-run';
}

export type Md5AnimationBoundsOracle = Md5AnimationBoundsOracleMeasured | Md5AnimationBoundsOracleNotRun;

interface BoundToken {
  precision: number;
  value: number;
}

interface CapturedSkinnedMesh {
  bindPose: MeshSkinBindPose;
  mesh: Mesh;
}

const NUMBER_SOURCE = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const BOUNDS_ROW = new RegExp(
  String.raw`^\(\s*(${NUMBER_SOURCE})\s+(${NUMBER_SOURCE})\s+(${NUMBER_SOURCE})\s*\)\s+\(\s*(${NUMBER_SOURCE})\s+(${NUMBER_SOURCE})\s+(${NUMBER_SOURCE})\s*\)$`,
);

// Reads the producer-authored animation bounds independently of parseMd5Anim. The importer deliberately
// does not supply this oracle's expected values: they come from the sibling bounds block that it currently
// discards. MD5 is right-handed Z-up while imported scenes are right-handed Y-up, so each box is rotated by
// the same (x, y, z) -> (x, z, -y) basis change the format importer applies to vertices and joint tracks.
export function parseMd5DeclaredAnimationBounds(source: string): Md5DeclaredAnimationBounds | null {
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => line.length > 0);
  const frameCounts = parsePositiveOrZeroIntegerDeclarations(lines, 'numFrames');
  const frameRates = parsePositiveOrZeroIntegerDeclarations(lines, 'frameRate');
  if (frameCounts.length !== 1 || frameRates.length !== 1 || frameRates[0] <= 0) return null;

  const blocks: string[][] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (lines[lineIndex] !== 'bounds {') continue;
    const block: string[] = [];
    let closed = false;
    for (lineIndex++; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]!;
      if (line === '}') {
        closed = true;
        break;
      }
      block.push(line);
    }
    if (!closed) return null;
    blocks.push(block);
  }
  if (blocks.length !== 1 || blocks[0]!.length !== frameCounts[0]) return null;

  const bounds: Md5DeclaredFrameBounds[] = [];
  for (const line of blocks[0]!) {
    const match = BOUNDS_ROW.exec(line);
    if (match === null) return null;
    const values: BoundToken[] = [];
    for (let tokenIndex = 1; tokenIndex <= 6; tokenIndex++) {
      const token = parseBoundToken(match[tokenIndex]!);
      if (token === null) return null;
      values.push(token);
    }
    const sourceMin = values.slice(0, 3);
    const sourceMax = values.slice(3, 6);
    if (sourceMin.some((token, axis) => token.value > sourceMax[axis]!.value)) return null;
    bounds.push(convertBoundsZUpToYUp(sourceMin, sourceMax));
  }
  return { bounds, frameRate: frameRates[0]! };
}

// Measures how far an observed bound lies OUTSIDE the declared one. Positive is outside, zero is exact at
// that edge, and negative is contained. Keeping all six signed magnitudes separate makes this an observation
// rather than a verdict; callers can apply a different policy without rerunning an animation.
export function measureMd5AnimationBounds(
  declared: Readonly<AabbLike>,
  observed: Readonly<AabbLike>,
): Md5AnimationBoundsDeltas {
  return {
    max: {
      x: observed.max.x - declared.max.x,
      y: observed.max.y - declared.max.y,
      z: observed.max.z - declared.max.z,
    },
    min: {
      x: declared.min.x - observed.min.x,
      y: declared.min.y - observed.min.y,
      z: declared.min.z - observed.min.z,
    },
  };
}

// Classifies a measurement without erasing it. `contained` stays distinct from `exact`: a loose producer
// box and missing geometry can both contain the imported result. A small positive excursion gets its own
// state only when every edge is within the precision independently derived from that edge's source token.
export function classifyMd5AnimationBounds(
  deltas: Readonly<Md5AnimationBoundsDeltas>,
  precision: Readonly<AabbLike>,
): Md5AnimationBoundsClassification {
  const edges = flattenBounds(deltas);
  if (edges.every((delta) => delta === 0)) return 'exact';
  if (edges.every((delta) => delta <= 0)) return 'contained';
  const tolerances = flattenBounds(precision);
  return edges.every((delta, index) => delta <= tolerances[index]!)
    ? 'within-representable-precision'
    : 'exceeds-representable-precision';
}

// Runs the runtime-output oracle over one imported logical case. The expected bounds are parsed from the
// animation source above; the observed bounds come from applying the imported clip, computing its real joint
// palettes, skinning every vertex, transforming it into scene space, and unioning every mesh section. That
// makes one MD5 case necessarily multi-member: the animation declares the property, while the compatible
// mesh supplies the vertices and skin weights needed to observe it.
export function runMd5AnimationBoundsOracle(
  scene: Readonly<Scene3D>,
  animationSource: string,
  clipName = 'default',
): Md5AnimationBoundsOracle {
  const declared = parseMd5DeclaredAnimationBounds(animationSource);
  if (declared === null) return notRun('declared-bounds-unreadable');
  const clip = scene.animations[clipName];
  if (clip === undefined) return notRun('animation-clip-missing');
  const meshes = collectSkinnedMeshes(scene);
  if (meshes.length === 0) return notRun('skinned-mesh-missing');
  if (meshes.every(({ bindPose }) => bindPose.positions.length === 0)) return notRun('skinned-geometry-empty');
  const frames = declared.bounds.map((bounds, frame) => measureFrame(meshes, clip, frame, declared.frameRate, bounds));
  return {
    frames,
    id: MD5_ANIMATION_BOUNDS_ORACLE_ID,
    // The measurement is complete, but MD5's declared-bounds contract is not yet established as a
    // strict enclosure requirement. An excursion is evidence, not a licensed failure verdict.
    notRunReason: 'declared-bounds-contract-unresolved',
    state: 'not-run',
  };
}

function measureFrame(
  meshes: readonly CapturedSkinnedMesh[],
  clip: Readonly<AnimationClip>,
  frame: number,
  frameRate: number,
  declared: Md5DeclaredFrameBounds,
): Md5AnimationBoundsFrameOracle {
  applyAnimationClipToScene3D(clip, frame / frameRate);
  const skeletons = new Set<Skeleton3D>();
  for (const { mesh } of meshes) skeletons.add(mesh.skin!.skeleton);
  for (const skeleton of skeletons) computeSkeleton3DJointMatrices(skeleton);

  const observed = emptyBounds();
  for (const { bindPose, mesh } of meshes) {
    skinVertices(
      bindPose.skinnedPositions,
      bindPose.skinnedNormals,
      bindPose.positions,
      bindPose.normals,
      bindPose.joints,
      bindPose.weights,
      mesh.skin!.skeleton.jointMatrices,
      // The skeleton's own normal palette, filled by the computeSkeleton3DJointMatrices call above.
      // Passed rather than an identity even though MD5 authors strictly rigid joints: under a rigid
      // transform this palette EQUALS the pose matrix's 3x3, so it costs nothing here — and hardcoding
      // an identity would silently become wrong the moment a non-rigid pose reached this oracle.
      mesh.skin!.skeleton.normalMatrices,
    );
    unionTransformedPositions(observed, bindPose.skinnedPositions, getNodeWorldMatrix4(mesh).m);
  }
  const deltas = measureMd5AnimationBounds(declared, observed);
  return { classification: classifyMd5AnimationBounds(deltas, declared.precision), declared, deltas, frame, observed };
}

function collectSkinnedMeshes(scene: Readonly<Scene3D>): CapturedSkinnedMesh[] {
  const meshes: CapturedSkinnedMesh[] = [];
  const pending = [scene.root];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (isMesh(node) && node.skin != null)
      meshes.push({ bindPose: captureMeshSkinBindPose(node.geometry), mesh: node });
    // The public traversal helper returns a snapshot, but using targetRef-bound nodes here means the scene
    // does not mutate during the walk; append in reverse so the traversal stays source-order deterministic.
    const children = getNodeChildren(node);
    for (let child = children.length - 1; child >= 0; child--) pending.push(children[child]!);
  }
  return meshes;
}

function unionTransformedPositions(
  bounds: AabbLike,
  positions: Readonly<Float32Array>,
  matrix: Readonly<Float32Array>,
): void {
  for (let offset = 0; offset + 2 < positions.length; offset += 3) {
    const x = positions[offset]!;
    const y = positions[offset + 1]!;
    const z = positions[offset + 2]!;
    const tx = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
    const ty = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
    const tz = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!;
    if (tx < bounds.min.x) bounds.min.x = tx;
    if (ty < bounds.min.y) bounds.min.y = ty;
    if (tz < bounds.min.z) bounds.min.z = tz;
    if (tx > bounds.max.x) bounds.max.x = tx;
    if (ty > bounds.max.y) bounds.max.y = ty;
    if (tz > bounds.max.z) bounds.max.z = tz;
  }
}

function convertBoundsZUpToYUp(
  sourceMin: readonly BoundToken[],
  sourceMax: readonly BoundToken[],
): Md5DeclaredFrameBounds {
  return {
    max: { x: sourceMax[0]!.value, y: sourceMax[2]!.value, z: -sourceMin[1]!.value + 0 },
    min: { x: sourceMin[0]!.value, y: sourceMin[2]!.value, z: -sourceMax[1]!.value + 0 },
    precision: {
      max: { x: sourceMax[0]!.precision, y: sourceMax[2]!.precision, z: sourceMin[1]!.precision },
      min: { x: sourceMin[0]!.precision, y: sourceMin[2]!.precision, z: sourceMax[1]!.precision },
    },
  };
}

function parseBoundToken(source: string): BoundToken | null {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(source);
  if (match === null || (match[2] === '' && match[3] === '')) return null;
  const value = Number(source);
  if (!Number.isFinite(value)) return null;
  const fractionalDigits = match[3]?.length ?? 0;
  const exponent = match[4] === undefined ? 0 : Number(match[4]);
  const precision = 0.5 * 10 ** (exponent - fractionalDigits);
  if (!Number.isFinite(precision) || precision <= 0) return null;
  return { precision, value };
}

function parsePositiveOrZeroIntegerDeclarations(lines: readonly string[], name: string): number[] {
  const values: number[] = [];
  const pattern = new RegExp(`^${name}\\s+(\\d+)$`);
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match === null) continue;
    const value = Number(match[1]);
    if (!Number.isSafeInteger(value)) return [];
    values.push(value);
  }
  return values;
}

function emptyBounds(): AabbLike {
  return {
    max: { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY, z: Number.NEGATIVE_INFINITY },
    min: { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, z: Number.POSITIVE_INFINITY },
  };
}

function flattenBounds(bounds: Readonly<AabbLike>): number[] {
  return [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z];
}

function notRun(notRunReason: Md5AnimationBoundsOracleNotRun['notRunReason']): Md5AnimationBoundsOracleNotRun {
  return { id: MD5_ANIMATION_BOUNDS_ORACLE_ID, notRunReason, state: 'not-run' };
}
