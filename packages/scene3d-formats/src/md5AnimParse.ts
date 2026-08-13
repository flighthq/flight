import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { AnimationChannel, AnimationClip, ImportDiagnostic, Node3D } from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  Scene3DAnimationPathRotation,
  Scene3DAnimationPathTranslation,
} from '@flighthq/types/contract';

import { convertPositionsZUpToYUp, convertQuaternionsZUpToYUp } from './shared';

// Parses an id Tech 4 MD5 animation file (.md5anim) into an AnimationClip that drives the given
// joint Node3Ds (produced by createScene3DFromMd5Mesh). The ASCII line-oriented format declares a
// skeleton hierarchy, a baseframe pose, and per-frame animated components selected by a bitmask.
// Each joint produces up to two channels (translation and rotation) in the returned clip. Channels
// bind to their joint by NAME (falling back to array position for unnamed joints), so the caller may
// pass the joint nodes in any order — see the name-binding note in buildAnimationClip.
//
// IMPORTANT: .md5anim baseframe/frame joint transforms are PARENT-RELATIVE (unlike the .md5mesh
// joints, which are absolute). These relative values are driven straight onto the joints' LOCAL
// transforms, and the NESTED skeleton createScene3DFromMd5Mesh builds (which converts its absolute bind
// pose to parent-relative locals) composes parent × child back to the correct absolute world pose.
// The two files are coupled: a flat skeleton, or one that kept absolute bind locals, would deform the
// mesh wrongly. Do not "compose to absolute" here — the scene graph does that.
//
// Joint positions and orientations are converted from MD5's right-handed Z-up coordinate system
// to Flight's right-handed Y-up system via convertPositionsZUpToYUp and
// convertQuaternionsZUpToYUp. Quaternion W is reconstructed from XYZ.
//
// Returns null when the source is empty or cannot be parsed. Malformed lines record a diagnostic and
// are skipped; the function never throws on bad input.
export function parseMd5Anim(
  source: string,
  joints: readonly Node3D[],
  diagnostics?: ImportDiagnostic[],
): AnimationClip | null {
  const lines = source.split('\n');
  let i = 0;

  let frameRate = 24;
  let numFrames = 0;
  let numJoints = 0;

  const hierarchy: Md5AnimHierarchyEntry[] = [];
  let declaredComponents = -1;
  const baseframe: Md5AnimBaseframePose[] = [];
  const frames: number[][] = [];

  const md5Drops = diagnostics ? new Map<string, Md5AnimDropTally>() : null;

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line.length === 0 || line.startsWith('//')) continue;

    if (line.startsWith('MD5Version')) {
      const version = parseInt(line.split(/\s+/)[1], 10);
      if (Number.isFinite(version) && version !== 10) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'md5anim.unsupported-version',
          'parseMd5Anim',
          {
            version,
          },
        );
      }
      continue;
    }

    if (line.startsWith('commandline')) continue;

    if (line.startsWith('numFrames')) {
      numFrames = parseInt(line.split(/\s+/)[1], 10);
      if (!Number.isFinite(numFrames)) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'md5anim.non-numeric-numframes',
          'parseMd5Anim',
        );
        numFrames = 0;
      }
      continue;
    }

    if (line.startsWith('numJoints')) {
      numJoints = parseInt(line.split(/\s+/)[1], 10);
      if (!Number.isFinite(numJoints)) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'md5anim.non-numeric-numjoints',
          'parseMd5Anim',
        );
        numJoints = 0;
      }
      continue;
    }

    if (line.startsWith('frameRate')) {
      frameRate = parseInt(line.split(/\s+/)[1], 10);
      if (!Number.isFinite(frameRate) || frameRate <= 0) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'md5anim.invalid-framerate',
          'parseMd5Anim',
        );
        frameRate = 24;
      }
      continue;
    }

    if (line.startsWith('numAnimatedComponents')) {
      const declared = parseInt(line.split(/\s+/)[1], 10);
      if (Number.isFinite(declared) && declared >= 0) declaredComponents = declared;
      continue;
    }

    if (line === 'hierarchy {') {
      i = parseHierarchyBlock(lines, i, hierarchy, md5Drops);
      continue;
    }

    if (line === 'bounds {') {
      i = skipBlock(lines, i);
      // Intentionally detail-free: detail-bearing diagnostics pass through retainDecidedDetail,
      // parseRetainedDiagnosticDetail, and ImportConformanceFixtureDiagnosticDetail, whose current
      // evidence contract is SWF-shaped. Adding frame or bound values here is therefore a cross-package
      // schema change, not a local parser enhancement; rich measurements belong to md5.animation-bounds.
      // Skip, not Drop. The bounds block is RECOGNIZED and deliberately not modelled — a capability gap on
      // a well-formed file, which is what Skip means. Drop would claim the file lost data through a failure,
      // and would exclude a correct parse from every severity-based "did the importer complain" check.
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, 'md5anim.bounds-unsupported', 'parseMd5Anim');
      continue;
    }

    if (line === 'baseframe {') {
      i = parseBaseframeBlock(lines, i, baseframe, md5Drops);
      continue;
    }

    if (line.startsWith('frame ') && line.endsWith('{')) {
      const frameData: number[] = [];
      i = parseFrameBlock(lines, i, frameData, md5Drops);
      frames.push(frameData);
      continue;
    }
  }

  // Resolve the outcome first, then flush the aggregated block-level drops once — so no accumulated
  // crumb is lost on either early-reject path below (parseMd5Anim is the physical emitter, hence origin).
  let clip: AnimationClip | null = null;
  if (hierarchy.length === 0 || frames.length === 0) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md5anim.no-data', 'parseMd5Anim');
  } else {
    if (hierarchy.length !== numJoints) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'md5anim.joint-count-mismatch',
        'parseMd5Anim',
        {
          declared: numJoints,
          found: hierarchy.length,
        },
      );
    }
    if (frames.length !== numFrames) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'md5anim.frame-count-mismatch',
        'parseMd5Anim',
        {
          declared: numFrames,
          found: frames.length,
        },
      );
    }
    if (joints.length < hierarchy.length) {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md5anim.joints-too-few', 'parseMd5Anim', {
        animationJoints: hierarchy.length,
        suppliedJoints: joints.length,
      });
    } else {
      clip = buildAnimationClip(joints, hierarchy, baseframe, frames, frameRate, declaredComponents, md5Drops);
    }
  }

  if (md5Drops !== null) {
    for (const tally of md5Drops.values()) {
      reportImportDiagnostic(diagnostics, tally.severity, tally.kind, 'parseMd5Anim', {
        ...tally.detail,
        count: tally.count,
      });
    }
  }
  return clip;
}

// Builds the AnimationClip from parsed MD5 anim data. Each joint gets a translation channel
// (3 components) and a rotation channel (4 components, quaternion slerp).
function buildAnimationClip(
  joints: readonly Node3D[],
  hierarchy: readonly Md5AnimHierarchyEntry[],
  baseframe: readonly Md5AnimBaseframePose[],
  frames: readonly number[][],
  frameRate: number,
  declaredComponents: number,
  md5Drops: Map<string, Md5AnimDropTally> | null,
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
  const nodeByName = new Map<string, Node3D>();
  for (const joint of joints) {
    if (joint.name) nodeByName.set(joint.name, joint);
  }

  // The frame layout is declared three times over — each joint's flags imply a component count, every
  // joint's startIndex claims a window in the flat frame array, and numAnimatedComponents states the
  // total — and none of the three was reconciled with any other. The `?? base` fallbacks below then made
  // every disagreement invisible: an out-of-range read silently substitutes the bind pose, so a joint
  // whose window is wrong looks exactly like a joint the animator deliberately left static.
  const componentTotal = totalMd5AnimComponents(hierarchy);
  if (declaredComponents >= 0 && declaredComponents !== componentTotal) {
    tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5anim.component-count-mismatch', '', {
      firstActual: componentTotal,
      firstExpected: declaredComponents,
    });
  }
  if (baseframe.length < jointCount) {
    tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5anim.baseframe-count-mismatch', '', {
      firstActual: baseframe.length,
      firstExpected: jointCount,
    });
  }
  for (let f = 0; f < frameCount; f++) {
    if (frames[f].length !== componentTotal) {
      tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5anim.frame-width-mismatch', '', {
        firstActual: frames[f].length,
        firstExpected: componentTotal,
        firstFrame: f,
      });
      break;
    }
  }

  for (let j = 0; j < jointCount; j++) {
    const entry = hierarchy[j];
    const base = j < baseframe.length ? baseframe[j] : DEFAULT_BASEFRAME;
    const flags = entry.flags;
    const width = countMd5AnimFlagComponents(flags);
    // A startIndex whose window leaves the frame is reported once per joint, rather than dissolving into
    // per-component bind-pose substitutions that read as an intentionally static joint.
    if (entry.startIndex < 0 || (width > 0 && entry.startIndex + width > componentTotal)) {
      tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5anim.joint-frame-window-invalid', '', {
        firstIndex: entry.startIndex,
        firstJoint: j,
        firstWidth: width,
      });
    }

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
    channels.push(createAnimationChannel(translationTrack, { node, path: Scene3DAnimationPathTranslation }));

    const rotationTrack = createAnimationTrack({
      components: 4,
      quaternion: true,
      times,
      values: rotationValues,
    });
    channels.push(createAnimationChannel(rotationTrack, { node, path: Scene3DAnimationPathRotation }));
  }

  return createAnimationClip(channels);
}

// Parses the hierarchy { ... } block. Returns the line index after the closing brace.
function parseHierarchyBlock(
  lines: readonly string[],
  startLine: number,
  hierarchy: Md5AnimHierarchyEntry[],
  md5Drops: Map<string, Md5AnimDropTally> | null,
): number {
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line === '}') return i;
    if (line.length === 0 || line.startsWith('//')) continue;

    const entry = parseHierarchyLine(line, md5Drops, i - 1);
    if (entry !== null) hierarchy.push(entry);
  }
  tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5anim.hierarchy-block-unclosed', '', {});
  return i;
}

// Parses a single hierarchy line: "jointName" parentIndex flags startIndex
function parseHierarchyLine(
  line: string,
  md5Drops: Map<string, Md5AnimDropTally> | null,
  lineIndex: number,
): Md5AnimHierarchyEntry | null {
  const nameStart = line.indexOf('"');
  const nameEnd = line.indexOf('"', nameStart + 1);
  if (nameStart < 0 || nameEnd < 0) {
    tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5anim.malformed-hierarchy', 'missing-name-quotes', {
      firstLine: lineIndex + 1,
      reason: 'missing-name-quotes',
    });
    return null;
  }
  const name = line.slice(nameStart + 1, nameEnd);

  const rest = line.slice(nameEnd + 1).trim();
  const tokens = rest.split(/\s+/).filter((t) => t.length > 0);

  if (tokens.length < 3) {
    tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5anim.malformed-hierarchy', 'not-enough-components', {
      firstLine: lineIndex + 1,
      reason: 'not-enough-components',
    });
    return null;
  }

  const parentIndex = parseInt(tokens[0], 10);
  const flags = parseInt(tokens[1], 10);
  const startIndex = parseInt(tokens[2], 10);

  if (!Number.isFinite(parentIndex) || !Number.isFinite(flags) || !Number.isFinite(startIndex)) {
    tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5anim.malformed-hierarchy', 'non-numeric-values', {
      firstLine: lineIndex + 1,
      reason: 'non-numeric-values',
    });
    return null;
  }

  return { flags, name, parentIndex, startIndex };
}

// Parses the baseframe { ... } block. Returns the line index after the closing brace.
function parseBaseframeBlock(
  lines: readonly string[],
  startLine: number,
  baseframe: Md5AnimBaseframePose[],
  md5Drops: Map<string, Md5AnimDropTally> | null,
): number {
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line === '}') return i;
    if (line.length === 0 || line.startsWith('//')) continue;

    const pose = parseBaseframeLine(line, md5Drops, i - 1);
    if (pose !== null) baseframe.push(pose);
  }
  tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5anim.baseframe-block-unclosed', '', {});
  return i;
}

// Parses a baseframe line: ( posX posY posZ ) ( quatX quatY quatZ )
function parseBaseframeLine(
  line: string,
  md5Drops: Map<string, Md5AnimDropTally> | null,
  lineIndex: number,
): Md5AnimBaseframePose | null {
  const tokens = line
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length < 6) {
    tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5anim.malformed-baseframe', 'not-enough-components', {
      firstLine: lineIndex + 1,
      reason: 'not-enough-components',
    });
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
    tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Drop, 'md5anim.malformed-baseframe', 'non-numeric-values', {
      firstLine: lineIndex + 1,
      reason: 'non-numeric-values',
    });
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
  md5Drops: Map<string, Md5AnimDropTally> | null,
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
        tallyMd5AnimDrop(
          md5Drops,
          ImportDiagnosticSeverity.Recover,
          'md5anim.non-numeric-frame-value',
          'non-numeric-frame-value',
          {
            firstLine: i,
            firstToken: token,
          },
        );
        // A placeholder, not a skip: every joint reads this frame at a fixed `startIndex`, so dropping
        // one token shifts every component after it in this frame and joints start reading each other's
        // translations as rotations. Confining the damage to the one component the file actually got
        // wrong — which the crumb names — is strictly better than spreading it across the rest of the
        // frame. Dropping the whole frame instead would be worse still: frames are addressed by index
        // across the clip, so losing one shifts the timeline the same way this shifts the components.
        frameData.push(0);
        continue;
      }
      frameData.push(value);
    }
  }
  tallyMd5AnimDrop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5anim.frame-block-unclosed', '', {});
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

// One accumulated MD5-anim block-level drop: a total occurrence `count` plus the first offender's `detail`,
// keyed by kind + discriminator. No origin is stored — the tallies are flushed (physically reported) by
// parseMd5Anim, so it is every aggregated crumb's origin per the collector's emitting-function contract;
// `kind` carries the drop-site granularity.
interface Md5AnimDropTally {
  count: number;
  detail: Record<string, boolean | number | string>;
  kind: string;
  severity: ImportDiagnosticSeverity;
}

// Records one offender against its (kind, discriminator) tally — the aggregate-once alternative to a
// per-line/per-token `reportImportDiagnostic` in a hierarchy/baseframe/frame block. No-op (never allocates)
// when no collector is engaged. `firstDetail` is kept from the FIRST offender; later ones only bump count.
function tallyMd5AnimDrop(
  tallies: Map<string, Md5AnimDropTally> | null,
  severity: ImportDiagnosticSeverity,
  kind: string,
  discriminator: string,
  firstDetail: Record<string, boolean | number | string>,
): void {
  if (tallies === null) return;
  const key = `${kind}|${discriminator}`;
  const existing = tallies.get(key);
  if (existing === undefined) tallies.set(key, { count: 1, detail: firstDetail, kind, severity });
  else existing.count++;
}

// The number of frame components a joint's flags claim — one float per set bit among the six.
function countMd5AnimFlagComponents(flags: number): number {
  let count = 0;
  for (let bit = 0; bit < 6; bit++) {
    if (flags & (1 << bit)) count++;
  }
  return count;
}

// The frame width the hierarchy as a whole implies, against which numAnimatedComponents and each frame's
// actual length are checked. Summed from the flags rather than taken from the file, so it is an
// INDEPENDENT statement of the same quantity — a bound derived from the same field it guards would move
// with the error and could never detect it.
function totalMd5AnimComponents(hierarchy: readonly Md5AnimHierarchyEntry[]): number {
  let total = 0;
  for (const entry of hierarchy) total += countMd5AnimFlagComponents(entry.flags);
  return total;
}
