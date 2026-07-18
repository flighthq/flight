import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation';
import type { AnimationChannel, AnimationClip, SceneNode } from '@flighthq/types';
import { SceneAnimationPathRotation, SceneAnimationPathTranslation } from '@flighthq/types';

import { convertPositionsZUpToYUp, convertQuaternionsZUpToYUp } from './shared';

// Parses an id Tech 4 MD5 animation file (.md5anim) into an AnimationClip that drives the given
// joint SceneNodes (produced by createSceneFromMd5Mesh). The ASCII line-oriented format declares a
// skeleton hierarchy, a baseframe pose, and per-frame animated components selected by a bitmask.
// Each joint produces up to two channels (translation and rotation) in the returned clip. Channels
// bind to their joint by NAME (falling back to array position for unnamed joints), so the caller may
// pass the joint nodes in any order — see the name-binding note in buildAnimationClip.
//
// IMPORTANT: .md5anim baseframe/frame joint transforms are PARENT-RELATIVE (unlike the .md5mesh
// joints, which are absolute). These relative values are driven straight onto the joints' LOCAL
// transforms, and the NESTED skeleton createSceneFromMd5Mesh builds (which converts its absolute bind
// pose to parent-relative locals) composes parent × child back to the correct absolute world pose.
// The two files are coupled: a flat skeleton, or one that kept absolute bind locals, would deform the
// mesh wrongly. Do not "compose to absolute" here — the scene graph does that.
//
// Joint positions and orientations are converted from MD5's right-handed Z-up coordinate system
// to Flight's right-handed Y-up system via convertPositionsZUpToYUp and
// convertQuaternionsZUpToYUp. Quaternion W is reconstructed from XYZ.
//
// Returns null when the source is empty or cannot be parsed. Malformed lines push a warning and are
// skipped; the function never throws on bad input.
export function parseMd5Anim(source: string, joints: readonly SceneNode[], warnings?: string[]): AnimationClip | null {
  const lines = source.split('\n');
  let i = 0;

  let frameRate = 24;
  let numFrames = 0;
  let numJoints = 0;

  const hierarchy: Md5AnimHierarchyEntry[] = [];
  const baseframe: Md5AnimBaseframePose[] = [];
  const frames: number[][] = [];

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line.length === 0 || line.startsWith('//')) continue;

    if (line.startsWith('MD5Version')) {
      const version = parseInt(line.split(/\s+/)[1], 10);
      if (Number.isFinite(version) && version !== 10) {
        warnings?.push(`parseMd5Anim: unsupported MD5Version ${version} (expected 10)`);
      }
      continue;
    }

    if (line.startsWith('commandline')) continue;

    if (line.startsWith('numFrames')) {
      numFrames = parseInt(line.split(/\s+/)[1], 10);
      if (!Number.isFinite(numFrames)) {
        warnings?.push(`parseMd5Anim: non-numeric numFrames`);
        numFrames = 0;
      }
      continue;
    }

    if (line.startsWith('numJoints')) {
      numJoints = parseInt(line.split(/\s+/)[1], 10);
      if (!Number.isFinite(numJoints)) {
        warnings?.push(`parseMd5Anim: non-numeric numJoints`);
        numJoints = 0;
      }
      continue;
    }

    if (line.startsWith('frameRate')) {
      frameRate = parseInt(line.split(/\s+/)[1], 10);
      if (!Number.isFinite(frameRate) || frameRate <= 0) {
        warnings?.push(`parseMd5Anim: invalid frameRate, defaulting to 24`);
        frameRate = 24;
      }
      continue;
    }

    if (line.startsWith('numAnimatedComponents')) continue;

    if (line === 'hierarchy {') {
      i = parseHierarchyBlock(lines, i, hierarchy, warnings);
      continue;
    }

    if (line === 'bounds {') {
      i = skipBlock(lines, i);
      continue;
    }

    if (line === 'baseframe {') {
      i = parseBaseframeBlock(lines, i, baseframe, warnings);
      continue;
    }

    if (line.startsWith('frame ') && line.endsWith('{')) {
      const frameData: number[] = [];
      i = parseFrameBlock(lines, i, frameData, warnings);
      frames.push(frameData);
      continue;
    }
  }

  if (hierarchy.length === 0 || frames.length === 0) {
    warnings?.push('parseMd5Anim: no hierarchy or frame data found');
    return null;
  }

  if (hierarchy.length !== numJoints) {
    warnings?.push(`parseMd5Anim: hierarchy has ${hierarchy.length} entries but numJoints declared ${numJoints}`);
  }

  if (frames.length !== numFrames) {
    warnings?.push(`parseMd5Anim: found ${frames.length} frames but numFrames declared ${numFrames}`);
  }

  if (joints.length < hierarchy.length) {
    warnings?.push(
      `parseMd5Anim: joints array has ${joints.length} nodes but animation has ${hierarchy.length} joints`,
    );
    return null;
  }

  return buildAnimationClip(joints, hierarchy, baseframe, frames, frameRate);
}

// Builds the AnimationClip from parsed MD5 anim data. Each joint gets a translation channel
// (3 components) and a rotation channel (4 components, quaternion slerp).
function buildAnimationClip(
  joints: readonly SceneNode[],
  hierarchy: readonly Md5AnimHierarchyEntry[],
  baseframe: readonly Md5AnimBaseframePose[],
  frames: readonly number[][],
  frameRate: number,
): AnimationClip {
  const frameCount = frames.length;
  const jointCount = hierarchy.length;
  const channels: AnimationChannel[] = [];

  // Build time array: one entry per frame, spaced by 1/frameRate.
  const times: number[] = [];
  for (let f = 0; f < frameCount; f++) {
    times.push(f / frameRate);
  }

  // Bind each animation channel to its joint by NAME, not array position. MD5 joint names are unique,
  // and the caller may pass the joint nodes in any order — the mesh importer supplies them in MD5 skeleton
  // order, but a consumer that re-collects them from the scene graph (e.g. a depth-first walk of a nested
  // skeleton) yields a different order. Index binding silently mis-poses the joints whose two orders differ
  // (worst at skeleton branches like finger chains); name binding is order-independent. Falls back to the
  // positional joint when a hierarchy name has no matching node (e.g. unnamed nodes), preserving the old
  // behavior for callers that pass MD5-ordered, possibly-unnamed joints.
  const nodeByName = new Map<string, SceneNode>();
  for (const joint of joints) {
    if (joint.name) nodeByName.set(joint.name, joint);
  }

  for (let j = 0; j < jointCount; j++) {
    const entry = hierarchy[j];
    const base = j < baseframe.length ? baseframe[j] : DEFAULT_BASEFRAME;
    const flags = entry.flags;

    // Extract per-frame translation and rotation for this joint.
    const translationValues: number[] = [];
    const rotationValues: number[] = [];

    for (let f = 0; f < frameCount; f++) {
      const frameData = frames[f];

      let tx = base.positionX;
      let ty = base.positionY;
      let tz = base.positionZ;
      let qx = base.orientationX;
      let qy = base.orientationY;
      let qz = base.orientationZ;

      let componentOffset = entry.startIndex;
      if (flags & FLAG_TX) {
        tx = frameData[componentOffset++] ?? tx;
      }
      if (flags & FLAG_TY) {
        ty = frameData[componentOffset++] ?? ty;
      }
      if (flags & FLAG_TZ) {
        tz = frameData[componentOffset++] ?? tz;
      }
      if (flags & FLAG_QX) {
        qx = frameData[componentOffset++] ?? qx;
      }
      if (flags & FLAG_QY) {
        qy = frameData[componentOffset++] ?? qy;
      }
      if (flags & FLAG_QZ) {
        qz = frameData[componentOffset++] ?? qz;
      }

      // Reconstruct quaternion W from XYZ.
      const sumSq = qx * qx + qy * qy + qz * qz;
      const qw = sumSq < 1 ? -Math.sqrt(1 - sumSq) : 0;

      // Push in MD5's native Z-up space; batch-converted below.
      translationValues.push(tx, ty, tz);
      rotationValues.push(qx, qy, qz, qw);
    }

    // Convert from Z-up to Y-up.
    convertPositionsZUpToYUp(translationValues);
    convertQuaternionsZUpToYUp(rotationValues);

    const node = nodeByName.get(entry.name) ?? joints[j];

    const translationTrack = createAnimationTrack({
      components: 3,
      times,
      values: translationValues,
    });
    channels.push(createAnimationChannel(translationTrack, { node, path: SceneAnimationPathTranslation }));

    const rotationTrack = createAnimationTrack({
      components: 4,
      quaternion: true,
      times,
      values: rotationValues,
    });
    channels.push(createAnimationChannel(rotationTrack, { node, path: SceneAnimationPathRotation }));
  }

  return createAnimationClip(channels);
}

// Parses the hierarchy { ... } block. Returns the line index after the closing brace.
function parseHierarchyBlock(
  lines: readonly string[],
  startLine: number,
  hierarchy: Md5AnimHierarchyEntry[],
  warnings: string[] | undefined,
): number {
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line === '}') return i;
    if (line.length === 0 || line.startsWith('//')) continue;

    const entry = parseHierarchyLine(line, warnings, i - 1);
    if (entry !== null) hierarchy.push(entry);
  }
  warnings?.push('parseMd5Anim: hierarchy block was not closed');
  return i;
}

// Parses a single hierarchy line: "jointName" parentIndex flags startIndex
function parseHierarchyLine(
  line: string,
  warnings: string[] | undefined,
  lineIndex: number,
): Md5AnimHierarchyEntry | null {
  const nameStart = line.indexOf('"');
  const nameEnd = line.indexOf('"', nameStart + 1);
  if (nameStart < 0 || nameEnd < 0) {
    warnings?.push(`parseMd5Anim: malformed hierarchy entry on line ${lineIndex + 1}: missing name quotes`);
    return null;
  }
  const name = line.slice(nameStart + 1, nameEnd);

  const rest = line.slice(nameEnd + 1).trim();
  const tokens = rest.split(/\s+/).filter((t) => t.length > 0);

  if (tokens.length < 3) {
    warnings?.push(`parseMd5Anim: malformed hierarchy entry on line ${lineIndex + 1}: not enough components`);
    return null;
  }

  const parentIndex = parseInt(tokens[0], 10);
  const flags = parseInt(tokens[1], 10);
  const startIndex = parseInt(tokens[2], 10);

  if (!Number.isFinite(parentIndex) || !Number.isFinite(flags) || !Number.isFinite(startIndex)) {
    warnings?.push(`parseMd5Anim: malformed hierarchy entry on line ${lineIndex + 1}: non-numeric values`);
    return null;
  }

  return { flags, name, parentIndex, startIndex };
}

// Parses the baseframe { ... } block. Returns the line index after the closing brace.
function parseBaseframeBlock(
  lines: readonly string[],
  startLine: number,
  baseframe: Md5AnimBaseframePose[],
  warnings: string[] | undefined,
): number {
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line === '}') return i;
    if (line.length === 0 || line.startsWith('//')) continue;

    const pose = parseBaseframeLine(line, warnings, i - 1);
    if (pose !== null) baseframe.push(pose);
  }
  warnings?.push('parseMd5Anim: baseframe block was not closed');
  return i;
}

// Parses a baseframe line: ( posX posY posZ ) ( quatX quatY quatZ )
function parseBaseframeLine(
  line: string,
  warnings: string[] | undefined,
  lineIndex: number,
): Md5AnimBaseframePose | null {
  const tokens = line
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length < 6) {
    warnings?.push(`parseMd5Anim: malformed baseframe entry on line ${lineIndex + 1}: not enough components`);
    return null;
  }

  const positionX = parseFloat(tokens[0]);
  const positionY = parseFloat(tokens[1]);
  const positionZ = parseFloat(tokens[2]);
  const orientationX = parseFloat(tokens[3]);
  const orientationY = parseFloat(tokens[4]);
  const orientationZ = parseFloat(tokens[5]);

  if (
    !Number.isFinite(positionX) ||
    !Number.isFinite(positionY) ||
    !Number.isFinite(positionZ) ||
    !Number.isFinite(orientationX) ||
    !Number.isFinite(orientationY) ||
    !Number.isFinite(orientationZ)
  ) {
    warnings?.push(`parseMd5Anim: malformed baseframe entry on line ${lineIndex + 1}: non-numeric values`);
    return null;
  }

  return { orientationX, orientationY, orientationZ, positionX, positionY, positionZ };
}

// Parses a frame N { ... } block, collecting all float values. Returns the line index after the
// closing brace.
function parseFrameBlock(
  lines: readonly string[],
  startLine: number,
  frameData: number[],
  warnings: string[] | undefined,
): number {
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line === '}') return i;
    if (line.length === 0 || line.startsWith('//')) continue;

    const tokens = line.split(/\s+/).filter((t) => t.length > 0);
    for (const token of tokens) {
      const value = parseFloat(token);
      if (!Number.isFinite(value)) {
        warnings?.push(`parseMd5Anim: non-numeric frame value "${token}" on line ${i}`);
        continue;
      }
      frameData.push(value);
    }
  }
  warnings?.push('parseMd5Anim: frame block was not closed');
  return i;
}

// Skips a block delimited by { ... }. Returns the line index after the closing brace.
function skipBlock(lines: readonly string[], startLine: number): number {
  let i = startLine;
  while (i < lines.length) {
    if (lines[i].trim() === '}') return i + 1;
    i++;
  }
  return i;
}

// MD5 anim hierarchy entry flags: each bit indicates which component is animated and read from the
// frame data rather than the baseframe.
const FLAG_TX = 1;
const FLAG_TY = 2;
const FLAG_TZ = 4;
const FLAG_QX = 8;
const FLAG_QY = 16;
const FLAG_QZ = 32;

interface Md5AnimHierarchyEntry {
  flags: number;
  name: string;
  parentIndex: number;
  startIndex: number;
}

interface Md5AnimBaseframePose {
  orientationX: number;
  orientationY: number;
  orientationZ: number;
  positionX: number;
  positionY: number;
  positionZ: number;
}

const DEFAULT_BASEFRAME: Md5AnimBaseframePose = {
  orientationX: 0,
  orientationY: 0,
  orientationZ: 0,
  positionX: 0,
  positionY: 0,
  positionZ: 0,
};
