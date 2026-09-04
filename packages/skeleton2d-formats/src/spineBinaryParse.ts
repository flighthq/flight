import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation/contract';
import { easeCubicBezier } from '@flighthq/easing/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import {
  createSkeleton2D,
  createSkeleton2DBoneAnimationTarget,
  createSkeleton2DSlotAnimationTarget,
  createSkin2D,
} from '@flighthq/skeleton2d/contract';
import type {
  AnimationChannel,
  Attachment2D,
  AttachmentSkin2D,
  Bone2D,
  ByteReader,
  EasingFunction,
  ImportDiagnostic,
  MeshAttachment2D,
  RegionAttachment2D,
  Skeleton2DDrawOrderTimeline,
  Skeleton2DImport,
  Skeleton2DImportAnimation,
  Skin2D,
  SkinAttachment2D,
  Slot2D,
} from '@flighthq/types/contract';
import {
  AnimationInterpolationLinear,
  AnimationInterpolationStep,
  ImportDiagnosticSeverity,
  Skeleton2DSlotAnimationPath,
  MeshAttachment2DKind,
  RegionAttachment2DKind,
  Skeleton2DAnimationPath,
  TransformMode2D,
} from '@flighthq/types/contract';

import {
  createSpineBinaryReader,
  hasSpineBinaryBytes,
  isSpineBinaryReaderOverrun,
  readSpineBinaryBoolean,
  readSpineBinaryByte,
  readSpineBinaryFloat,
  readSpineBinaryInt,
  readSpineBinaryString,
  readSpineBinaryUnsignedShort,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader';
import { resolveSpineDrawOrdering } from './spineDrawOrder';

// Parses Spine's `.skel` BINARY skeleton into the same `Skeleton2DImport` `parseSpineSkeleton` produces from
// `.json` — the binary sibling of that parser, mirroring how `parseGlb` sits beside `parseGltf`. Tolerant and
// best-effort on the same terms: `null` is reserved for the "this is not a file we can read" failure
// (unreadable header, unsupported version), and a readable file with unmodeled pieces yields best-effort
// data plus `ImportDiagnostic` crumbs. Wire decoding lives in `spineBinaryReader`; this file owns only the
// RECORD LAYOUT — which field follows which.
//
// The binary is stream-positional in a way JSON is not: records have no keys and no lengths, so a reader
// cannot skip a section it does not model — it can only CONSUME it or stop. That is why constraint records,
// slot colour timelines, deform timelines, and draw-order/event timelines are all walked field-for-field
// even though Flight models none of them: each stands between something this importer does want and the
// next thing after it. The whole file is consumed, and what is not modeled is Skip-crumbed rather than
// skipped over.
//
// VERSION GATE. The layout below is Spine 4.x's and was verified byte-for-byte against a real 4.1.17 export
// (see the package status). Spine changed record layouts across major versions, so a file outside 4.x is
// REJECTED with its version in the crumb instead of being decoded by a layout that does not describe it —
// a wrong layout does not fail loudly, it silently yields plausible garbage.
export function parseSpineSkeletonBinary(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): Skeleton2DImport | null {
  const reader = createSpineBinaryReader(bytes);
  // The 8-byte hash identifies the export; it carries no skeleton data, so it is stepped over rather than read.
  skipSpineBinaryBytes(reader, SPINE_BINARY_HASH_BYTES);
  const version = readSpineBinaryString(reader);
  if (isSpineBinaryReaderOverrun(reader) || version === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'spine.binary-header-unreadable',
      'parseSpineSkeletonBinary',
      { bytes: bytes.byteLength },
    );
    return null;
  }
  if (!isSupportedSpineBinaryVersion(version)) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'spine.binary-version-unsupported',
      'parseSpineSkeletonBinary',
      { version },
    );
    return null;
  }
  // Skeleton bounds (x, y, width, height) describe the authoring canvas, which Skeleton2D does not model.
  skipSpineBinaryBytes(reader, SPINE_BINARY_BOUNDS_BYTES);
  // "Nonessential" data is what Spine writes only for editor round-tripping: the authoring frame rate, the
  // images/audio folder paths, and a per-bone editor color. Its PRESENCE changes the record layout below,
  // so the flag has to be carried down even though none of the values are modeled.
  const nonessential = readSpineBinaryBoolean(reader);
  if (nonessential) {
    skipSpineBinaryBytes(reader, SPINE_BINARY_FPS_BYTES);
    readSpineBinaryString(reader); // images path
    readSpineBinaryString(reader); // audio path
  }
  const strings = readSpineBinaryStringTable(reader);
  const bones = parseSpineBinaryBones(reader, nonessential, diagnostics);
  const { attachmentNames, slots } = parseSpineBinarySlots(reader, strings, diagnostics);
  skipSpineBinaryConstraints(reader, diagnostics);
  const skins = parseSpineBinarySkins(reader, strings, nonessential, diagnostics);
  // A slot names its setup attachment BEFORE the skin that defines it has been read, so resolution waits
  // until here — the file orders slots first, but the name only means something once the skins exist.
  const setup = skins.find((skin) => skin.name === SPINE_BINARY_DEFAULT_SKIN_NAME);
  if (setup !== undefined) {
    for (const entry of setup.attachments) {
      if (entry.slotIndex < slots.length && attachmentNames[entry.slotIndex] === entry.name) {
        slots[entry.slotIndex].attachment = entry.attachment;
      }
    }
  }
  skipSpineBinaryEvents(reader, diagnostics);
  const animations = parseSpineBinaryAnimations(reader, strings, setup, slots.length, diagnostics);
  if (isSpineBinaryReaderOverrun(reader)) {
    reportImportDiagnostic(
      diagnostics,
      // Drop, not Recover. Nothing STANDS IN for the unread remainder — the skeleton is simply short of
      // what the file described, and "degraded but usable" is the consequence rather than the criterion.
      ImportDiagnosticSeverity.Drop,
      'spine.binary-truncated',
      'parseSpineSkeletonBinary',
      { bones: bones.length, slots: slots.length },
    );
  } else if (reader.offset < bytes.byteLength) {
    // The distinction is load-bearing: a Skip here would exempt itself from every "did the parser complain"
    // check, which is precisely how a desynchronized walk that stops early stays invisible.
    //
    // Guarded on a remainder actually existing. Firing unconditionally made this crumb useless in both
    // directions — it could not distinguish a file that ended cleanly from one the walk abandoned, so a
    // clean parse was never silent and the alarm carried no information.
    reportImportDiagnostic(
      diagnostics,
      // Drop, and SKIP WAS NEVER AVAILABLE HERE: skip claims RECOGNITION — you can only skip something you
      // identified — and an unparsed remainder is by definition unidentified. We cannot tell an unimplemented
      // section from unexpected trailing data, so the honest severity is "data unaccounted for, cause
      // unknown". That is also why this is not split into two kinds: a split needs the causes to be
      // distinguishable AT THE SITE, and `remainder > 0` cannot distinguish them.
      ImportDiagnosticSeverity.Drop,
      'spine.binary-tail-unparsed',
      'parseSpineSkeletonBinary',
      { bytes: bytes.byteLength - reader.offset },
    );
  }
  const skeleton = createSkeleton2D(bones, slots);
  if (skins.length > 0) skeleton.skins = skins;
  return { animations, skeleton };
}

// The event DEFINITIONS a file declares (name plus default int/float/string/audio payload). Flight's
// Skeleton2DImport carries no event vocabulary, so these are consumed and Skip-crumbed — but consumed they
// must be, since the animation section follows them in a stream with no keys or lengths.
function skipSpineBinaryEvents(reader: ByteReader, diagnostics?: ImportDiagnostic[]): void {
  const count = readSpineBinaryVarint(reader);
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader); // name reference
    readSpineBinaryVarint(reader); // int value
    skipSpineBinaryBytes(reader, 4); // float value
    readSpineBinaryString(reader); // string value
    // An audio path is what gates the trailing volume/balance pair, so its presence changes the record width.
    if (readSpineBinaryString(reader) !== null) skipSpineBinaryBytes(reader, 8);
  }
  reportSpineBinaryCrumb(diagnostics, count, 'spine.event-unsupported', 'skipSpineBinaryEvents', 'events');
}

// Builds one AnimationClip per animation from its BONE timelines, mirroring what `parseSpineSkeleton` does
// for `.json` — relative deltas over `Skeleton2DAnimationTarget`, composed onto the setup pose by
// `applyAnimationClipToSkeleton2D`.
//
// Every other timeline family (slot attachment/colour, IK, transform, path, deform, draw order, event) is
// unmodeled, yet each is still walked field-for-field: the animation record is positional, so reaching the
// NEXT animation requires consuming this one completely. An animation opens with its total timeline count,
// which this importer does not need but must read.
function parseSpineBinaryAnimations(
  reader: ByteReader,
  strings: readonly (string | null)[],
  setup: Readonly<AttachmentSkin2D> | undefined,
  slotCount: number,
  diagnostics?: ImportDiagnostic[],
): Skeleton2DImportAnimation[] {
  const animations: Skeleton2DImportAnimation[] = [];
  const count = readSpineBinaryVarint(reader);
  const unmodeled = new Map<string, number>();
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
    const name = readSpineBinaryString(reader);
    readSpineBinaryVarint(reader); // total timeline count across all families
    const channels: AnimationChannel[] = [];
    parseSpineBinarySlotTimelines(reader, channels, strings, setup, unmodeled, diagnostics);
    parseSpineBinaryBoneTimelines(reader, channels, diagnostics);
    skipSpineBinaryConstraintTimelines(reader, unmodeled);
    skipSpineBinaryDeformTimelines(reader, unmodeled);
    const drawOrder = readSpineBinaryDrawOrderTimeline(reader, slotCount, diagnostics);
    skipSpineBinaryEventTimelines(reader, unmodeled);
    animations.push({ clip: createAnimationClip(channels), drawOrder, name: name ?? '' });
  }
  for (const [kind, tally] of unmodeled) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      `spine.${kind}-timeline-unsupported`,
      'parseSpineSkeletonBinary',
      { timelines: tally },
    );
  }
  return animations;
}

// The bone timelines of one animation. Spine splits each transform group into a combined form and per-axis
// forms (`translate` vs `translateX`/`translateY`); a per-axis timeline becomes a two-component channel
// whose OTHER axis holds the identity delta — 0 for translate/shear, 1 for the scale multiplier — so it
// composes onto the setup pose as "this axis moves, the other does not".
function parseSpineBinaryBoneTimelines(
  reader: ByteReader,
  channels: AnimationChannel[],
  diagnostics?: ImportDiagnostic[],
): void {
  const bones = readSpineBinaryVarint(reader);
  for (let i = 0; i < bones && !isSpineBinaryReaderOverrun(reader); i++) {
    const boneIndex = readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      const ordinal = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      readSpineBinaryVarint(reader); // bezier count — a capacity hint, not needed to read the frames
      const kind = ordinal < SPINE_BINARY_BONE_TIMELINES.length ? SPINE_BINARY_BONE_TIMELINES[ordinal] : null;
      if (kind === null) {
        // The payload width of an unknown timeline is unknowable, so the stream cannot continue past it.
        skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
        return;
      }
      const timeline = readSpineBinaryValueTimeline(reader, frameCount, kind.values);
      channels.push(buildSpineBinaryBoneChannel(timeline, kind, boneIndex, diagnostics));
    }
  }
}

// Reads a curve timeline: a leading keyframe, then per gap another keyframe preceded by a curve tag. The
// tag is per-SEGMENT, and a bezier tag carries four floats per animated value.
function readSpineBinaryValueTimeline(
  reader: ByteReader,
  frameCount: number,
  values: number,
): { curves: (number[] | null)[]; times: number[]; values: number[] } {
  const times: number[] = [];
  const flat: number[] = [];
  const curves: (number[] | null)[] = [];
  if (frameCount <= 0) return { curves, times, values: flat };
  times.push(readSpineBinaryFloat(reader));
  for (let v = 0; v < values; v++) flat.push(readSpineBinaryFloat(reader));
  for (let frame = 0; frame + 1 < frameCount && !isSpineBinaryReaderOverrun(reader); frame++) {
    times.push(readSpineBinaryFloat(reader));
    for (let v = 0; v < values; v++) flat.push(readSpineBinaryFloat(reader));
    const tag = readSpineBinaryByte(reader);
    if (tag === SPINE_BINARY_CURVE_BEZIER) {
      const points: number[] = [];
      for (let v = 0; v < values * 4; v++) points.push(readSpineBinaryFloat(reader));
      curves.push(points);
    } else {
      curves.push(null); // linear, or stepped — which Flight expresses per track, not per segment
    }
  }
  return { curves, times, values: flat };
}

// Turns one decoded bone timeline into an AnimationChannel. A per-axis timeline emits a per-axis PATH over
// its own one-component track; a combined timeline emits the paired path. Bezier segments become
// per-interval easings under the same absolute-units rebase the `.json` parser uses.
//
// It used to widen a per-axis timeline to the paired path's component count, filling the untouched axis
// with an identity delta. That is correct for ONE such timeline and WRONG FOR TWO: a bone with both
// translateX and translateY produced two channels on the same paired path, and since each composes onto
// the SETUP pose the second wrote the first's axis back to setup — a silent, total loss of one animated
// axis. Spine authors the two with independent keyframe times, so they cannot be merged into one track
// either; the per-axis paths are what let both survive.
function buildSpineBinaryBoneChannel(
  timeline: { curves: (number[] | null)[]; times: number[]; values: number[] },
  kind: (typeof SPINE_BINARY_BONE_TIMELINES)[number],
  boneIndex: number,
  diagnostics?: ImportDiagnostic[],
): AnimationChannel {
  const frames = timeline.times.length;
  const components = kind.values;
  const values = new Array<number>(frames * components);
  for (let f = 0; f < frames * components; f++) values[f] = timeline.values[f];
  const track = createAnimationTrack({
    components,
    interpolation: AnimationInterpolationLinear,
    segmentEasings: buildSpineBinarySegmentEasings(timeline, kind.values, diagnostics),
    times: timeline.times,
    values,
  });
  return createAnimationChannel(track, createSkeleton2DBoneAnimationTarget(boneIndex, kind.path));
}

// Rebases each bezier segment's absolute control points onto its own segment, exactly as the `.json` parser
// does — Spine stores them in time/value units and four numbers per animated value. The first MEANINGFUL
// value (one that actually changes across the segment) supplies the easing; a divergent sibling is crumbed
// rather than silently dropped, and x is clamped so the curve stays invertible.
function buildSpineBinarySegmentEasings(
  timeline: { curves: (number[] | null)[]; times: number[]; values: number[] },
  values: number,
  diagnostics?: ImportDiagnostic[],
): (EasingFunction | null)[] | null {
  const easings: (EasingFunction | null)[] = [];
  let curved = false;
  let divergent = 0;
  for (let i = 0; i < timeline.curves.length; i++) {
    const points = timeline.curves[i];
    const span = timeline.times[i + 1] - timeline.times[i];
    if (points === null || span <= 0) {
      easings.push(null);
      continue;
    }
    // Same rule as the `.json` path: the component with the LARGEST value change supplies the easing,
    // because the rebase divides by that change and a near-constant component is a near-zero denominator.
    let winner = -1;
    let widest = 0;
    for (let v = 0; v < values && (v + 1) * 4 <= points.length; v++) {
      const rise = Math.abs(timeline.values[(i + 1) * values + v] - timeline.values[i * values + v]);
      if (rise > widest) {
        widest = rise;
        winner = v;
      }
    }
    // Winner first, then compare — a single pass would measure earlier components against zeros.
    const rebase = (v: number): [number, number, number, number] | null => {
      const from = timeline.values[i * values + v];
      const rise = timeline.values[(i + 1) * values + v] - from;
      if (rise === 0) return null;
      return [
        (points[v * 4] - timeline.times[i]) / span,
        (points[v * 4 + 1] - from) / rise,
        (points[v * 4 + 2] - timeline.times[i]) / span,
        (points[v * 4 + 3] - from) / rise,
      ];
    };
    const won = winner < 0 ? null : rebase(winner);
    if (won !== null) {
      for (let v = 0; v < values && (v + 1) * 4 <= points.length; v++) {
        if (v === winner) continue;
        const other = rebase(v);
        if (other === null) continue;
        for (let k = 0; k < 4; k++) {
          if (Math.abs(other[k] - won[k]) > SPINE_BINARY_CURVE_EPSILON) divergent++;
        }
      }
    }
    const chosen = won !== null;
    const x1 = won === null ? 0 : won[0];
    const y1 = won === null ? 0 : won[1];
    const x2 = won === null ? 0 : won[2];
    const y2 = won === null ? 0 : won[3];
    if (!chosen) {
      easings.push(null);
      continue;
    }
    curved = true;
    easings.push(easeCubicBezier(clampSpineBinaryUnit(x1), y1, clampSpineBinaryUnit(x2), y2));
  }
  if (divergent > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.per-component-curve-easing-unsupported',
      'buildSpineBinarySegmentEasings',
      { segments: divergent },
    );
  }
  return curved ? easings : null;
}

// Slot timelines. `attachment` becomes a Step index channel plus a lookup table; `rgba` becomes a
// four-component 0..1 colour channel. The remaining colour variants (rgb, alpha, and the two dark forms)
// are consumed and Skip-crumbed — `Slot2D` carries one packed colour and no dark colour.
//
// Colour components are stored as single BYTES here while the bezier control points around them are floats
// already in 0..1 (Spine divides by 255 before recording a curve), so the bytes are normalized on read and
// the curve rebase then matches the `.json` path exactly.
function parseSpineBinarySlotTimelines(
  reader: ByteReader,
  channels: AnimationChannel[],
  strings: readonly (string | null)[],
  setup: Readonly<AttachmentSkin2D> | undefined,
  unmodeled: Map<string, number>,
  diagnostics?: ImportDiagnostic[],
): void {
  const slots = readSpineBinaryVarint(reader);
  for (let i = 0; i < slots && !isSpineBinaryReaderOverrun(reader); i++) {
    const slotIndex = readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      const type = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      if (type === SPINE_BINARY_SLOT_ATTACHMENT) {
        addSpineBinaryAttachmentChannel(reader, channels, strings, setup, slotIndex, frameCount);
        continue;
      }
      readSpineBinaryVarint(reader); // bezier count
      const count = SPINE_BINARY_SLOT_COLOR_CHANNELS[type] ?? 1;
      if (type !== SPINE_BINARY_SLOT_RGBA) {
        tally(unmodeled, 'slot-color');
        skipSpineBinaryCurveFrames(reader, frameCount, count, count);
        continue;
      }
      const timeline = readSpineBinaryColorTimeline(reader, frameCount, count);
      const track = createAnimationTrack({
        components: count,
        interpolation: AnimationInterpolationLinear,
        segmentEasings: buildSpineBinarySegmentEasings(timeline, count, diagnostics),
        times: timeline.times,
        values: timeline.values,
      });
      channels.push(
        createAnimationChannel(
          track,
          createSkeleton2DSlotAnimationTarget(slotIndex, Skeleton2DSlotAnimationPath.Color),
        ),
      );
    }
  }
}

// An attachment-swap timeline: per frame a time and a string-table reference, `null` meaning hide. Names
// resolve against the setup skin ONCE into a deduplicated table, and the track carries only the index.
function addSpineBinaryAttachmentChannel(
  reader: ByteReader,
  channels: AnimationChannel[],
  strings: readonly (string | null)[],
  setup: Readonly<AttachmentSkin2D> | undefined,
  slotIndex: number,
  frameCount: number,
): void {
  const attachments: (Attachment2D | null)[] = [];
  const indexByName = new Map<string, number>();
  const times: number[] = [];
  const values: number[] = [];
  for (let f = 0; f < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
    times.push(readSpineBinaryFloat(reader));
    const name = readSpineBinaryStringReference(reader, strings);
    if (name === null) {
      values.push(SPINE_BINARY_NO_ATTACHMENT_INDEX);
      continue;
    }
    let index = indexByName.get(name);
    if (index === undefined) {
      const found = setup?.attachments.find((entry) => entry.slotIndex === slotIndex && entry.name === name);
      index = found === undefined ? SPINE_BINARY_NO_ATTACHMENT_INDEX : attachments.push(found.attachment) - 1;
      indexByName.set(name, index);
    }
    values.push(index);
  }
  if (times.length === 0) return;
  const track = createAnimationTrack({ components: 1, interpolation: AnimationInterpolationStep, times, values });
  channels.push(
    createAnimationChannel(
      track,
      createSkeleton2DSlotAnimationTarget(slotIndex, Skeleton2DSlotAnimationPath.Attachment, attachments),
    ),
  );
}

// A colour curve timeline: a time float then one byte per channel, with a per-segment curve tag. Bytes are
// normalized to 0..1 so they share the track space (and therefore the curve rebase) with the `.json` path.
function readSpineBinaryColorTimeline(
  reader: ByteReader,
  frameCount: number,
  channelCount: number,
): { curves: (number[] | null)[]; times: number[]; values: number[] } {
  const times: number[] = [];
  const values: number[] = [];
  const curves: (number[] | null)[] = [];
  if (frameCount <= 0) return { curves, times, values };
  times.push(readSpineBinaryFloat(reader));
  for (let c = 0; c < channelCount; c++) values.push(readSpineBinaryByte(reader) / 255);
  for (let f = 0; f + 1 < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
    times.push(readSpineBinaryFloat(reader));
    for (let c = 0; c < channelCount; c++) values.push(readSpineBinaryByte(reader) / 255);
    const tag = readSpineBinaryByte(reader);
    if (tag === SPINE_BINARY_CURVE_BEZIER) {
      const points: number[] = [];
      for (let v = 0; v < channelCount * 4; v++) points.push(readSpineBinaryFloat(reader));
      curves.push(points);
    } else {
      curves.push(null);
    }
  }
  return { curves, times, values };
}

// IK, transform, and path constraint timelines.
function skipSpineBinaryConstraintTimelines(reader: ByteReader, unmodeled: Map<string, number>): void {
  const ik = readSpineBinaryVarint(reader);
  for (let i = 0; i < ik && !isSpineBinaryReaderOverrun(reader); i++) {
    tally(unmodeled, 'ik');
    readSpineBinaryVarint(reader); // constraint index
    const frameCount = readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader); // bezier count
    skipSpineBinaryBytes(reader, 12); // time, mix, softness
    for (let f = 0; f < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
      skipSpineBinaryBytes(reader, 3); // bend direction, compress, stretch
      if (f === frameCount - 1) break;
      skipSpineBinaryBytes(reader, 12);
      skipSpineBinaryCurveTag(reader, 2);
    }
  }
  const transform = readSpineBinaryVarint(reader);
  for (let i = 0; i < transform && !isSpineBinaryReaderOverrun(reader); i++) {
    tally(unmodeled, 'transform');
    readSpineBinaryVarint(reader);
    const frameCount = readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryCurveFrames(reader, frameCount, 24, 6);
  }
  const path = readSpineBinaryVarint(reader);
  for (let i = 0; i < path && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    const timelines = readSpineBinaryVarint(reader);
    for (let j = 0; j < timelines && !isSpineBinaryReaderOverrun(reader); j++) {
      tally(unmodeled, 'path');
      const type = readSpineBinaryByte(reader);
      const frameCount = readSpineBinaryVarint(reader);
      readSpineBinaryVarint(reader);
      const values = type === SPINE_BINARY_PATH_MIX ? 3 : 1;
      skipSpineBinaryCurveFrames(reader, frameCount, values * 4, values);
    }
  }
}

// Deform (mesh vertex offset) and attachment-sequence timelines, nested skin → slot → attachment.
function skipSpineBinaryDeformTimelines(reader: ByteReader, unmodeled: Map<string, number>): void {
  const skins = readSpineBinaryVarint(reader);
  for (let i = 0; i < skins && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader); // skin index
    const slots = readSpineBinaryVarint(reader);
    for (let j = 0; j < slots && !isSpineBinaryReaderOverrun(reader); j++) {
      readSpineBinaryVarint(reader); // slot index
      const attachments = readSpineBinaryVarint(reader);
      for (let k = 0; k < attachments && !isSpineBinaryReaderOverrun(reader); k++) {
        readSpineBinaryVarint(reader); // attachment name reference
        const type = readSpineBinaryByte(reader);
        const frameCount = readSpineBinaryVarint(reader);
        if (type === SPINE_BINARY_ATTACHMENT_SEQUENCE) {
          tally(unmodeled, 'attachment-sequence');
          skipSpineBinaryBytes(reader, frameCount * 12); // time, packed mode+index, delay
          continue;
        }
        tally(unmodeled, 'deform');
        readSpineBinaryVarint(reader); // bezier count
        skipSpineBinaryBytes(reader, 4); // first time
        for (let f = 0; f < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
          // A run length of zero means "the attachment's own vertices", carrying no payload at all.
          const run = readSpineBinaryVarint(reader);
          if (run !== 0) {
            readSpineBinaryVarint(reader); // start offset into the vertex array
            skipSpineBinaryBytes(reader, run * 4);
          }
          if (f === frameCount - 1) break;
          skipSpineBinaryBytes(reader, 4); // next time
          skipSpineBinaryCurveTag(reader, 1);
        }
      }
    }
  }
}

// The draw-order timeline: per frame, a time and a list of slot-index/offset pairs.
// The draw-order timeline: per frame, a time and a list of slot-index/offset pairs. Resolved into whole
// orderings through the SAME function the JSON reader uses, so the two encodings cannot disagree about
// what an offset list means — a second implementation would agree only by inspection, and only until
// one of them was edited.
function readSpineBinaryDrawOrderTimeline(
  reader: ByteReader,
  slotCount: number,
  diagnostics?: ImportDiagnostic[],
): Skeleton2DDrawOrderTimeline | null {
  const frames = readSpineBinaryVarint(reader);
  const times: number[] = [];
  const orderings: number[] = [];

  for (let i = 0; i < frames && !isSpineBinaryReaderOverrun(reader); i++) {
    const time = readSpineBinaryFloat(reader);
    const offsets = readSpineBinaryVarint(reader);
    const moves: { offset: number; slotIndex: number }[] = [];
    for (let j = 0; j < offsets && !isSpineBinaryReaderOverrun(reader); j++) {
      const slotIndex = readSpineBinaryVarint(reader);
      moves.push({ offset: readSpineBinaryVarint(reader), slotIndex });
    }
    if (isSpineBinaryReaderOverrun(reader)) break;

    const ordering = resolveSpineDrawOrdering(moves, slotCount);
    if (ordering === null) {
      // Drop, not Skip: draw-order timelines are supported. What failed is the data — offsets that do
      // not resolve against the slots — and the keyframe is discarded, so this is lost data, not a gap.
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'spine.draworder-keyframe-unresolved',
        'readSpineBinaryDrawOrderTimeline',
        { time },
      );
      continue;
    }
    times.push(time);
    orderings.push(...ordering);
  }
  return times.length === 0 ? null : { orderings, times };
}

// The event timeline: per frame, a time, the event it fires, and any values overriding the definition.
function skipSpineBinaryEventTimelines(reader: ByteReader, unmodeled: Map<string, number>): void {
  const frames = readSpineBinaryVarint(reader);
  if (frames > 0) tally(unmodeled, 'event');
  for (let i = 0; i < frames && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryBytes(reader, 4); // time
    readSpineBinaryVarint(reader); // event index
    readSpineBinaryVarint(reader); // int value
    skipSpineBinaryBytes(reader, 4); // float value
    // A flag says whether this frame overrides the definition's string; only then is one written.
    if (readSpineBinaryBoolean(reader)) readSpineBinaryString(reader);
  }
}

// Walks a curve timeline whose values are consumed rather than kept. `payloadBytes` is the per-keyframe
// value payload IN BYTES, excluding the 4-byte time — it is not a value count, because the two families
// differ in width: a constraint timeline stores floats, while a slot COLOUR timeline stores one byte per
// channel. `curveValues` is how many bezier curves a tagged segment carries, which tracks the value count
// either way (a colour's curves are still floats).
function skipSpineBinaryCurveFrames(
  reader: ByteReader,
  frameCount: number,
  payloadBytes: number,
  curveValues: number,
): void {
  if (frameCount <= 0) return;
  skipSpineBinaryBytes(reader, 4 + payloadBytes);
  for (let f = 0; f + 1 < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
    skipSpineBinaryBytes(reader, 4 + payloadBytes);
    skipSpineBinaryCurveTag(reader, curveValues);
  }
}

// One per-segment curve tag, plus the four floats per value a bezier tag carries.
function skipSpineBinaryCurveTag(reader: ByteReader, curveValues: number): void {
  if (readSpineBinaryByte(reader) === SPINE_BINARY_CURVE_BEZIER) {
    skipSpineBinaryBytes(reader, curveValues * 16);
  }
}

function clampSpineBinaryUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function tally(counts: Map<string, number>, kind: string): void {
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
}

// The record layouts this importer actually describes, as an ENUMERATION rather than a prefix.
//
// ★ A PREFIX GATE IS A PROMISE ABOUT THE FUTURE MADE BY SOMEONE WHO CANNOT KEEP IT. The previous test was
// `version.startsWith('4.')`, which claimed every 4.x layout — including ones that did not exist when it
// was written. Spine 4.2 then shipped a changed layout, and the gate admitted it into a reader built for
// 4.1: measured on 23 real 4.2.22 exports, every one desynchronized at once and produced a Skeleton2DImport
// with ZERO bones from a 64 KB file. Not a crash and not a refusal — a valid-looking success containing
// nothing, which a caller cannot tell from a skeleton that genuinely has no bones.
//
// So the list names what has been READ AGAINST A REAL EXPORT, and anything else is refused through the
// `spine.binary-version-unsupported` path with its version in the crumb. A refusal is recoverable; a
// fabricated empty success is not. Adding a layout here means implementing it, not widening a pattern.
const SPINE_BINARY_SUPPORTED_LAYOUTS: readonly string[] = ['4.1'];

// Whether this importer's record layout describes `version`. Matched on the major.minor pair, since Spine
// revises the layout across minors and patch releases within one minor share it.
function isSupportedSpineBinaryVersion(version: string): boolean {
  const parts = version.split('.');
  if (parts.length < 2) return false;
  return SPINE_BINARY_SUPPORTED_LAYOUTS.includes(`${parts[0]}.${parts[1]}`);
}

// Spine's bone records, in file order — the order weighted-mesh influences and slot bone references index
// into, and the order that guarantees a parent precedes its children (bone 0 is the root and writes no
// parent index at all).
function parseSpineBinaryBones(reader: ByteReader, nonessential: boolean, diagnostics?: ImportDiagnostic[]): Bone2D[] {
  const count = readSpineBinaryVarint(reader);
  const bones: Bone2D[] = [];
  for (let i = 0; i < count; i++) {
    if (isSpineBinaryReaderOverrun(reader)) break;
    const name = readSpineBinaryString(reader);
    const parentIndex = i === 0 ? -1 : readSpineBinaryVarint(reader);
    // A BONE'S PARENT MUST ALREADY EXIST. Spine writes bones parent-before-child, so a valid file's index
    // is always < i — which is exactly the invariant `validateSkeleton2D` enforces downstream, in a
    // validator a caller may never run. Checking it here is what stops a corrupt file producing a
    // structurally invalid skeleton that returns non-null and yields NaN world matrices the moment it is
    // posed. Measured before this check: 7 of 348 corrupt parses returned a skeleton the validator rejects.
    if (parentIndex >= i || parentIndex < -1) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'spine.binary-bone-parent-out-of-range',
        'parseSpineBinaryBones',
        { bone: name ?? '', declared: parentIndex, read: i },
      );
      skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
      break;
    }
    const rotation = readSpineBinaryFloat(reader);
    const x = readSpineBinaryFloat(reader);
    const y = readSpineBinaryFloat(reader);
    const scaleX = readSpineBinaryFloat(reader);
    const scaleY = readSpineBinaryFloat(reader);
    const shearX = readSpineBinaryFloat(reader);
    const shearY = readSpineBinaryFloat(reader);
    const length = readSpineBinaryFloat(reader);
    const transformMode = spineBinaryTransformMode(readSpineBinaryVarint(reader));
    readSpineBinaryBoolean(reader); // skinRequired — a skin-set feature, not modeled
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES); // editor bone color
    bones.push({ length, name, parentIndex, rotation, scaleX, scaleY, shearX, shearY, transformMode, x, y });
  }
  return bones;
}

// Spine's slot records, in draw order. `color`/`darkColor` are rgba8888 ints, matching `Slot2D.color`'s
// packed convention directly; a dark color of -1 means "none". The setup attachment is a STRING-TABLE
// REFERENCE naming an attachment inside a skin, which the file has not written yet — so the NAME is returned
// alongside the slots and the caller resolves it once the skin is read.
function parseSpineBinarySlots(
  reader: ByteReader,
  strings: readonly (string | null)[],
  diagnostics?: ImportDiagnostic[],
): { attachmentNames: (string | null)[]; slots: Slot2D[] } {
  const count = readSpineBinaryVarint(reader);
  const attachmentNames: (string | null)[] = [];
  const slots: Slot2D[] = [];
  let darkColors = 0;
  for (let i = 0; i < count; i++) {
    if (isSpineBinaryReaderOverrun(reader)) break;
    const name = readSpineBinaryString(reader);
    const boneIndex = readSpineBinaryVarint(reader);
    const color = readSpineBinaryInt(reader) >>> 0;
    if (readSpineBinaryInt(reader) !== SPINE_BINARY_NO_DARK_COLOR) darkColors++;
    attachmentNames.push(readSpineBinaryStringReference(reader, strings));
    readSpineBinaryVarint(reader); // blend mode — Slot2D carries no per-slot blend today
    slots.push({ attachment: null, boneIndex, color, name });
  }
  if (darkColors > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.slot-dark-color-unsupported',
      'parseSpineSkeletonBinary',
      { slots: darkColors },
    );
  }
  return { attachmentNames, slots };
}

// The IK, transform, and path constraint sections. Flight models no constraint solvers (a skeleton2d P2
// concern), but the stream is positional — these records carry no keys and no lengths — so they must be
// CONSUMED field-for-field to reach the skins that follow. Reading them is not optional the way ignoring a
// JSON key is; a single miscounted field desynchronizes every later section.
function skipSpineBinaryConstraints(reader: ByteReader, diagnostics?: ImportDiagnostic[]): void {
  const ik = readSpineBinaryVarint(reader);
  for (let i = 0; i < ik && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryConstraintHead(reader);
    readSpineBinaryVarint(reader); // target bone
    skipSpineBinaryBytes(reader, 8); // mix, softness
    skipSpineBinaryBytes(reader, 4); // bendDirection byte + compress/stretch/uniform booleans
  }
  const transform = readSpineBinaryVarint(reader);
  for (let i = 0; i < transform && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryConstraintHead(reader);
    readSpineBinaryVarint(reader); // target bone
    skipSpineBinaryBytes(reader, 2); // local, relative
    skipSpineBinaryBytes(reader, 48); // six offsets + six mix weights
  }
  const path = readSpineBinaryVarint(reader);
  for (let i = 0; i < path && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryConstraintHead(reader);
    readSpineBinaryVarint(reader); // target slot
    readSpineBinaryVarint(reader); // position mode
    readSpineBinaryVarint(reader); // spacing mode
    readSpineBinaryVarint(reader); // rotate mode
    skipSpineBinaryBytes(reader, 24); // offsetRotation, position, spacing, mixRotate, mixX, mixY
  }
  reportSpineBinaryCrumb(
    diagnostics,
    ik,
    'spine.ik-constraint-unsupported',
    'skipSpineBinaryConstraints',
    'constraints',
  );
  reportSpineBinaryCrumb(
    diagnostics,
    transform,
    'spine.transform-constraint-unsupported',
    'skipSpineBinaryConstraints',
    'constraints',
  );
  reportSpineBinaryCrumb(
    diagnostics,
    path,
    'spine.path-constraint-unsupported',
    'skipSpineBinaryConstraints',
    'constraints',
  );
}

// The head every constraint record shares: name, ordering index, skin-required flag, then its bone list.
function skipSpineBinaryConstraintHead(reader: ByteReader): void {
  readSpineBinaryString(reader);
  readSpineBinaryVarint(reader); // order
  readSpineBinaryBoolean(reader); // skinRequired
  const bones = readSpineBinaryVarint(reader);
  for (let i = 0; i < bones && !isSpineBinaryReaderOverrun(reader); i++) readSpineBinaryVarint(reader);
}

// The rig's wardrobe. The DEFAULT skin is written first in an abbreviated form — just its slot count, with
// no name and no bone/constraint lists — and the named alternates follow, each carrying a name plus the
// bone and constraint indices it requires. Both forms share the same slot → attachment body.
//
// Region and mesh attachments are modeled; bounding-box, path, point, clipping, and linked-mesh entries are
// recognized — and still fully consumed, since skipping their bytes is not possible — then Skip-crumbed.
function parseSpineBinarySkins(
  reader: ByteReader,
  strings: readonly (string | null)[],
  nonessential: boolean,
  diagnostics?: ImportDiagnostic[],
): AttachmentSkin2D[] {
  const skins: AttachmentSkin2D[] = [];
  const unmodeled = new Map<string, number>();
  const defaultSlots = readSpineBinaryVarint(reader);
  if (defaultSlots > 0) {
    skins.push({
      attachments: readSpineBinarySkinBody(reader, strings, defaultSlots, nonessential, unmodeled, diagnostics),
      name: SPINE_BINARY_DEFAULT_SKIN_NAME,
    });
  }
  const alternates = readSpineBinaryVarint(reader);
  for (let i = 0; i < alternates && !isSpineBinaryReaderOverrun(reader); i++) {
    const name = readSpineBinaryStringReference(reader, strings);
    // A named skin declares the bones and the IK / transform / path constraints it requires, as four index
    // lists, before its slots. Flight applies a skin as a slot write, so these are consumed for position only.
    for (let list = 0; list < SPINE_BINARY_SKIN_REQUIREMENT_LISTS; list++) {
      const required = readSpineBinaryVarint(reader);
      for (let j = 0; j < required && !isSpineBinaryReaderOverrun(reader); j++) readSpineBinaryVarint(reader);
    }
    const slotCount = readSpineBinaryVarint(reader);
    skins.push({
      attachments: readSpineBinarySkinBody(reader, strings, slotCount, nonessential, unmodeled, diagnostics),
      name: name ?? '',
    });
  }
  for (const [type, count] of unmodeled) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      `spine.${type}-attachment-unsupported`,
      'parseSpineSkeletonBinary',
      { attachments: count },
    );
  }
  return skins;
}

// One skin's slot → attachment body, shared by the default and named forms. Entries carry an explicit slot
// index and are NOT written in slot order.
function readSpineBinarySkinBody(
  reader: ByteReader,
  strings: readonly (string | null)[],
  slotCount: number,
  nonessential: boolean,
  unmodeled: Map<string, number>,
  diagnostics?: ImportDiagnostic[],
): SkinAttachment2D[] {
  const attachments: SkinAttachment2D[] = [];
  for (let i = 0; i < slotCount && !isSpineBinaryReaderOverrun(reader); i++) {
    const slotIndex = readSpineBinaryVarint(reader);
    const entries = readSpineBinaryVarint(reader);
    for (let j = 0; j < entries && !isSpineBinaryReaderOverrun(reader); j++) {
      const key = readSpineBinaryStringReference(reader, strings);
      const attachment = readSpineBinaryAttachment(reader, strings, key, nonessential, unmodeled, diagnostics);
      if (attachment !== null && key !== null) attachments.push({ attachment, name: key, slotIndex });
    }
  }
  return attachments;
}

// One attachment record. Its own name overrides the skin key when present (a slot can show the same image
// under a different key). The type is an ORDINAL into Spine's attachment-type enum, so the order of
// SPINE_BINARY_ATTACHMENT_TYPES is load-bearing.
function readSpineBinaryAttachment(
  reader: ByteReader,
  strings: readonly (string | null)[],
  key: string | null,
  nonessential: boolean,
  unmodeled: Map<string, number>,
  diagnostics?: ImportDiagnostic[],
): Attachment2D | null {
  const name = readSpineBinaryStringReference(reader, strings) ?? key;
  const ordinal = readSpineBinaryByte(reader);
  const type = ordinal < SPINE_BINARY_ATTACHMENT_TYPES.length ? SPINE_BINARY_ATTACHMENT_TYPES[ordinal] : null;
  if (type === 'region') return readSpineBinaryRegionAttachment(reader, strings, name);
  if (type === 'mesh') return readSpineBinaryMeshAttachment(reader, strings, name, nonessential, diagnostics);
  const label = type ?? 'unknown';
  unmodeled.set(label, (unmodeled.get(label) ?? 0) + 1);
  if (type === 'boundingbox') {
    skipSpineBinaryVertices(reader, readSpineBinaryVarint(reader));
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  } else if (type === 'clipping') {
    readSpineBinaryVarint(reader); // end slot
    skipSpineBinaryVertices(reader, readSpineBinaryVarint(reader));
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  } else if (type === 'point') {
    skipSpineBinaryBytes(reader, 12); // rotation, x, y
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  } else if (type === 'linkedmesh') {
    readSpineBinaryVarint(reader); // path
    skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
    readSpineBinaryVarint(reader); // skin name
    readSpineBinaryVarint(reader); // parent mesh
    readSpineBinaryBoolean(reader); // inherit timelines
    skipSpineBinarySequence(reader);
    if (nonessential) skipSpineBinaryBytes(reader, 8); // width, height
  } else if (type === 'path') {
    skipSpineBinaryBytes(reader, 2); // closed, constantSpeed
    const vertexCount = readSpineBinaryVarint(reader);
    skipSpineBinaryVertices(reader, vertexCount);
    skipSpineBinaryBytes(reader, Math.floor(vertexCount / 3) * 4); // per-curve lengths
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  }
  // An unknown ordinal cannot be stepped over — its payload width is unknown — so the stream is abandoned
  // by marking overrun rather than guessing and emitting garbage for everything after it.
  if (type === null) skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
  return null;
}

// A mesh whose declared count the remaining bytes cannot satisfy. The reader is parked past the end so
// every enclosing loop unwinds through the overrun path it already has, and the caller gets an empty
// attachment rather than a throw — a malformed asset is an expected failure and takes the sentinel, which
// is the same division `spineBinaryReader` states for truncation. The crumb is an ASSET fact, so it goes
// to importdiagnostics where the file name is in hand, not to a runtime guard firing once a frame.
function rejectSpineBinaryMesh(
  reader: ByteReader,
  name: string | null,
  field: string,
  declared: number,
  diagnostics?: ImportDiagnostic[],
): MeshAttachment2D {
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Drop,
    'spine.binary-count-unsatisfiable',
    'readSpineBinaryMeshAttachment',
    { attachment: name ?? '', declared, field, remaining: reader.view.byteLength - reader.offset },
  );
  skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
  const out = allocateEntity<MeshAttachment2D>();
  out.kind = MeshAttachment2DKind;
  out.name = name;
  out.skin = null;
  out.triangles = new Uint16Array();
  out.uvs = new Float32Array();
  out.vertexCount = 0;
  out.vertices = null;
  return finishEntity(out);
}

// A mesh attachment. `uvs` and `triangles` map straight across; the vertex stream is either rigid positions
// (local to the slot's bone) or a weighted `Skin2D` whose influences are already in Flight's
// `[boneIndex, x, y, weight]` layout, so no re-packing is needed.
function readSpineBinaryMeshAttachment(
  reader: ByteReader,
  strings: readonly (string | null)[],
  name: string | null,
  nonessential: boolean,
  diagnostics?: ImportDiagnostic[],
): MeshAttachment2D {
  readSpineBinaryVarint(reader); // atlas region path — resolved at atlas-binding time
  skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  // A DECLARED COUNT IS A CLAIM ABOUT BYTES THAT MUST STILL EXIST, and it is the file making it, so it is
  // checked before it is believed. The per-loop overrun guards elsewhere in this file are the wrong
  // precedent here: they stop ITERATION once a read has already failed, and the damage on these two lines
  // happens in the allocation, before any read. Measured before this check existed, on a 304-byte valid
  // file with one varint rewritten: an inflated triangle count returned after 59 SECONDS, and an inflated
  // vertex count never returned at all.
  const vertexCount = readSpineBinaryVarint(reader);
  if (!hasSpineBinaryBytes(reader, vertexCount * SPINE_BINARY_MESH_UV_BYTES)) {
    return rejectSpineBinaryMesh(reader, name, 'vertexCount', vertexCount, diagnostics);
  }
  const uvs = new Float32Array(vertexCount * 2);
  for (let i = 0; i < uvs.length; i++) uvs[i] = readSpineBinaryFloat(reader);
  const triangleCount = readSpineBinaryVarint(reader);
  if (!hasSpineBinaryBytes(reader, triangleCount * SPINE_BINARY_TRIANGLE_INDEX_BYTES)) {
    return rejectSpineBinaryMesh(reader, name, 'triangleCount', triangleCount, diagnostics);
  }
  const triangles = new Uint16Array(triangleCount);
  for (let i = 0; i < triangleCount; i++) triangles[i] = readSpineBinaryUnsignedShort(reader);
  const geometry = readSpineBinaryVertices(reader, vertexCount);
  readSpineBinaryVarint(reader); // hull length — a rendering hint Flight does not model
  skipSpineBinarySequence(reader);
  if (nonessential) {
    const edges = readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, edges * 2 + 8); // editor edge list, then width and height
  }
  const out = allocateEntity<MeshAttachment2D>();
  out.kind = MeshAttachment2DKind;
  out.name = name;
  out.skin = geometry.skin;
  out.triangles = triangles;
  out.uvs = uvs;
  out.vertexCount = vertexCount;
  out.vertices = geometry.vertices;
  return finishEntity(out);
}

// A region attachment. Width/height are the source region's size in the atlas; `path` names the atlas region
// and is resolved when the `.atlas` sidecar binds, which is `@flighthq/spritesheet-formats`' domain.
function readSpineBinaryRegionAttachment(
  reader: ByteReader,
  strings: readonly (string | null)[],
  name: string | null,
): RegionAttachment2D {
  readSpineBinaryVarint(reader); // atlas region path
  const rotation = readSpineBinaryFloat(reader);
  const x = readSpineBinaryFloat(reader);
  const y = readSpineBinaryFloat(reader);
  const scaleX = readSpineBinaryFloat(reader);
  const scaleY = readSpineBinaryFloat(reader);
  const width = readSpineBinaryFloat(reader);
  const height = readSpineBinaryFloat(reader);
  skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  skipSpineBinarySequence(reader);
  const out = allocateEntity<RegionAttachment2D>();
  out.height = height;
  out.kind = RegionAttachment2DKind;
  out.name = name;
  out.rotation = rotation;
  out.scaleX = scaleX;
  out.scaleY = scaleY;
  out.width = width;
  out.x = x;
  out.y = y;
  return finishEntity(out);
}

// A vertex stream: a leading flag picks rigid positions (2 floats per vertex, in the slot bone's space) or
// weighted influences (per vertex, a count then that many bone/x/y/weight quads).
function readSpineBinaryVertices(
  reader: ByteReader,
  vertexCount: number,
): { skin: Skin2D | null; vertices: Float32Array | null } {
  if (!readSpineBinaryBoolean(reader)) {
    const vertices = new Float32Array(vertexCount * 2);
    for (let i = 0; i < vertices.length; i++) vertices[i] = readSpineBinaryFloat(reader);
    return { skin: null, vertices };
  }
  const influenceCounts = new Uint16Array(vertexCount);
  const influences: number[] = [];
  for (let v = 0; v < vertexCount && !isSpineBinaryReaderOverrun(reader); v++) {
    const count = readSpineBinaryVarint(reader);
    influenceCounts[v] = count;
    // The inner bound is per-vertex file data, so it needs the same overrun check the outer loop has. The
    // outer one cannot stand in for it: it is consulted between vertices, and this loop pushes four values
    // a turn, so a single vertex declaring a count the bytes cannot supply grows `influences` until push
    // throws — measured at a RangeError after four seconds on a 327-byte file before this guard existed.
    for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
      influences.push(
        readSpineBinaryVarint(reader),
        readSpineBinaryFloat(reader),
        readSpineBinaryFloat(reader),
        readSpineBinaryFloat(reader),
      );
    }
  }
  return { skin: createSkin2D(influenceCounts, Float32Array.from(influences)), vertices: null };
}

// Consumes a vertex stream whose geometry is not kept (an unmodeled attachment type still occupies bytes).
function skipSpineBinaryVertices(reader: ByteReader, vertexCount: number): void {
  readSpineBinaryVertices(reader, vertexCount);
}

// Spine 4.1 added an optional `sequence` block to image-backed attachments, describing a numbered frame set.
// Flight does not model it, but its PRESENCE FLAG is always written, so it must be consumed — this single
// byte is what desynchronizes every later record if it is missed.
function skipSpineBinarySequence(reader: ByteReader): void {
  if (!readSpineBinaryBoolean(reader)) return;
  readSpineBinaryVarint(reader); // frame count
  readSpineBinaryVarint(reader); // start index
  readSpineBinaryVarint(reader); // digit count
  readSpineBinaryVarint(reader); // setup index
}

// Resolves a 1-based string-table index (0 meaning "no string") into its pooled string.
function readSpineBinaryStringReference(reader: ByteReader, strings: readonly (string | null)[]): string | null {
  const index = readSpineBinaryVarint(reader);
  return index > 0 && index <= strings.length ? strings[index - 1] : null;
}

// Reports one aggregated Skip crumb for a recognized-but-unmodeled section, keyed by its element count.
function reportSpineBinaryCrumb(
  diagnostics: ImportDiagnostic[] | undefined,
  count: number,
  kind: string,
  origin: string,
  unit: string,
): void {
  if (count > 0) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, kind, origin, {
      [unit]: count,
    });
  }
}

// The file-wide string pool that later sections reference by 1-based index (0 = no string). Reading it is
// what makes those references resolvable, so it is consumed even though this landing resolves none yet.
function readSpineBinaryStringTable(reader: ByteReader): (string | null)[] {
  const count = readSpineBinaryVarint(reader);
  const strings: (string | null)[] = [];
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) strings.push(readSpineBinaryString(reader));
  return strings;
}

// Spine writes the bone transform mode as an ORDINAL into its own enum, so the mapping is positional rather
// than by name (the `.json` sibling reads the same modes as strings). An out-of-range ordinal — a file from a
// version with more modes — falls back to Normal rather than producing an undefined inherit rule.
function spineBinaryTransformMode(ordinal: number): (typeof SPINE_BINARY_TRANSFORM_MODES)[number] {
  return ordinal >= 0 && ordinal < SPINE_BINARY_TRANSFORM_MODES.length
    ? SPINE_BINARY_TRANSFORM_MODES[ordinal]
    : TransformMode2D.Normal;
}

// Fixed-width header fields the importer steps over: the 8-byte export hash, the four floats of the
// authoring bounds, the nonessential frame rate, and a packed rgba8888 color.
const SPINE_BINARY_BOUNDS_BYTES = 16;
const SPINE_BINARY_COLOR_BYTES = 4;
const SPINE_BINARY_FPS_BYTES = 4;
const SPINE_BINARY_HASH_BYTES = 8;
// One mesh vertex costs two float32 uvs; one triangle index costs a uint16.
const SPINE_BINARY_MESH_UV_BYTES = 8;
const SPINE_BINARY_TRIANGLE_INDEX_BYTES = 2;

// Spine's attachment types in its own enum ORDER — the file writes an ordinal into this list, so the order
// is load-bearing and must not be alphabetized.
const SPINE_BINARY_ATTACHMENT_TYPES = [
  'region',
  'boundingbox',
  'mesh',
  'linkedmesh',
  'path',
  'point',
  'clipping',
] as const;

// Spine's bone timeline ORDINALS, in its own enum order — the file writes an index into this table, so the
// order is load-bearing and must not be alphabetized. `values` is how many numbers a keyframe carries,
// which is also the track's component count: each form now maps to the path that drives exactly the fields
// it states, so a per-axis timeline needs no widening and no identity fill.
const SPINE_BINARY_BONE_TIMELINES = [
  { path: Skeleton2DAnimationPath.Rotation, values: 1 },
  { path: Skeleton2DAnimationPath.Translation, values: 2 },
  { path: Skeleton2DAnimationPath.TranslationX, values: 1 },
  { path: Skeleton2DAnimationPath.TranslationY, values: 1 },
  { path: Skeleton2DAnimationPath.Scale, values: 2 },
  { path: Skeleton2DAnimationPath.ScaleX, values: 1 },
  { path: Skeleton2DAnimationPath.ScaleY, values: 1 },
  { path: Skeleton2DAnimationPath.Shear, values: 2 },
  { path: Skeleton2DAnimationPath.ShearX, values: 1 },
  { path: Skeleton2DAnimationPath.ShearY, values: 1 },
] as const;

// A slot colour timeline's channel count, indexed by its timeline ordinal (1 = RGBA, 2 = RGB, 3 = RGBA with
// a dark colour, 4 = RGB with a dark colour, 5 = alpha only). Ordinal 0 is the attachment-swap timeline.
const SPINE_BINARY_SLOT_COLOR_CHANNELS = [0, 4, 3, 7, 6, 1] as const;

// Per-segment curve tags. Linear (0) and stepped (1) carry no payload; bezier carries four floats per value.
const SPINE_BINARY_CURVE_BEZIER = 2;

const SPINE_BINARY_SLOT_ATTACHMENT = 0;
const SPINE_BINARY_SLOT_RGBA = 1;

// The index an attachment channel uses for "show nothing": Spine's null name, or a name the setup skin lacks.
const SPINE_BINARY_NO_ATTACHMENT_INDEX = -1;
const SPINE_BINARY_ATTACHMENT_SEQUENCE = 1;
const SPINE_BINARY_PATH_MIX = 2;

// Normalized control points closer than this are the same curve shape; see the `.json` parser for why the
// comparison must happen after rebasing rather than on the raw numbers.
const SPINE_BINARY_CURVE_EPSILON = 1e-6;

// Spine writes -1 into a slot's dark color to mean "this slot has none".
const SPINE_BINARY_NO_DARK_COLOR = -1;

// Spine writes the base skin first, unnamed; this is the name it is filed under in the wardrobe.
const SPINE_BINARY_DEFAULT_SKIN_NAME = 'default';

// A named skin lists what it requires as four index lists: bones, then IK, transform, and path constraints.
const SPINE_BINARY_SKIN_REQUIREMENT_LISTS = 4;

// The bone transform modes in Spine's own enum ORDER — the ordinal written in the file indexes this array,
// so the order is load-bearing and must not be alphabetized.
const SPINE_BINARY_TRANSFORM_MODES = [
  TransformMode2D.Normal,
  TransformMode2D.OnlyTranslation,
  TransformMode2D.NoRotationOrReflection,
  TransformMode2D.NoScale,
  TransformMode2D.NoScaleOrReflection,
] as const;
