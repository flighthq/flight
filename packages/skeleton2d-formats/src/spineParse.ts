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
  Attachment2D,
  AttachmentSkin2D,
  Bone2D,
  EasingFunction,
  EntityConstruction,
  ImportDiagnostic,
  MeshAttachment2D,
  RegionAttachment2D,
  Skeleton2DDrawOrderTimeline,
  Skeleton2DImport,
  Skeleton2DImportAnimation,
  Skin2D,
  SkinAttachment2D,
  Slot2D,
  TransformInherit2D,
} from '@flighthq/types/contract';
import {
  AnimationInterpolationLinear,
  AnimationInterpolationStep,
  ImportDiagnosticSeverity,
  MeshAttachment2DKind,
  RegionAttachment2DKind,
  Skeleton2DAnimationPath,
  Skeleton2DSlotAnimationPath,
  TransformMode2D,
} from '@flighthq/types/contract';

import { resolveSpineDrawOrdering } from './spineDrawOrder';

/**
 * Reads a draw-order timeline into the orderings `Skeleton2DImport` carries.
 *
 * The wire form states, per keyframe, a time and a list of slots that MOVE, each with a signed offset
 * from its setup position; every slot not listed keeps its relative order and closes the gaps. A track
 * has to answer "what is in effect at time t" from one keyframe alone, so each keyframe is resolved
 * into a WHOLE ordering here rather than left as a list of moves to be applied in sequence.
 *
 * Resolution is direct: place every moved slot at its stated destination, then fill the positions
 * nobody claimed with the remaining slots in setup order. A destination outside the slot range, or two
 * slots claiming one position, would silently reorder the rest — so the keyframe is skipped and
 * crumbed instead.
 *
 * Returns `null` when the animation states no draw-order timeline, which is most of them.
 */
export function parseSpineDrawOrderTimeline(
  raw: unknown,
  slots: readonly Slot2D[],
  diagnostics?: ImportDiagnostic[],
): Skeleton2DDrawOrderTimeline | null {
  if (!Array.isArray(raw) || raw.length === 0 || slots.length === 0) return null;

  const times: number[] = [];
  const orderings: number[] = [];
  for (const frame of raw) {
    if (frame === null || typeof frame !== 'object') continue;
    const entry = frame as { offsets?: unknown; time?: unknown };
    const ordering = resolveSpineDrawOrder(entry.offsets, slots);
    if (ordering === null) {
      // Drop, not Skip: draw-order timelines are supported. What failed is the data — offsets that do
      // not resolve against the slots — and the keyframe is discarded, so this is lost data, not a gap.
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'spine.draworder-keyframe-unresolved',
        'parseSpineDrawOrderTimeline',
        { time: numberOr(entry.time, 0) },
      );
      continue;
    }
    times.push(numberOr(entry.time, 0));
    orderings.push(...ordering);
  }
  return times.length === 0 ? null : { orderings, times };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// Spine bones are authored parent-before-child, and reference their parent by name — so a parent's index
// is resolvable from the bones already accumulated. Returns -1 (a root) when there is no parent or it is
// not yet known (a forward reference, which a well-formed Spine file never produces).
//
// The bone array is POSITIONALLY REFERENCED — a weighted mesh's vertex influences carry file-order bone
// indices into it (see parseSpineWeightedVertices). So a malformed entry must NOT be dropped: dropping it
// would shift every later bone down one slot and silently re-point every weighted-mesh influence at the
// wrong bone. Instead an inert placeholder bone holds the slot, keeping all indices aligned, and the
// recovery is recorded.
function parseSpineBones(raw: unknown, diagnostics?: ImportDiagnostic[]): Bone2D[] {
  const bones: Bone2D[] = [];
  if (!Array.isArray(raw)) return bones;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'spine.malformed-bone-recovered',
        'parseSpineSkeleton',
        { bones: 1 },
      );
      bones.push(createPlaceholderBone2D());
      continue;
    }
    const bone = entry as Record<string, unknown>;
    const name = typeof bone.name === 'string' ? bone.name : null;
    let parentIndex = -1;
    if (typeof bone.parent === 'string') {
      for (let i = bones.length - 1; i >= 0; i--) {
        if (bones[i].name === bone.parent) {
          parentIndex = i;
          break;
        }
      }
    }
    bones.push({
      length: numberOr(bone.length, 0),
      name,
      parentIndex,
      rotation: numberOr(bone.rotation, 0),
      scaleX: numberOr(bone.scaleX, 1),
      scaleY: numberOr(bone.scaleY, 1),
      shearX: numberOr(bone.shearX, 0),
      shearY: numberOr(bone.shearY, 0),
      transformMode: spineTransformMode(bone.transform),
      x: numberOr(bone.x, 0),
      y: numberOr(bone.y, 0),
    });
  }
  return bones;
}

// An inert root bone that holds a slot in the bone array when an entry is malformed, so file-order bone
// indices (weighted-mesh influences) stay aligned. Identity transform, no parent, no name.
function createPlaceholderBone2D(): Bone2D {
  return {
    length: 0,
    name: null,
    parentIndex: -1,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    shearX: 0,
    shearY: 0,
    transformMode: TransformMode2D.Normal,
    x: 0,
    y: 0,
  };
}

// Parses one Spine attachment (identified by its `name` in the skin) into an Attachment2D, or returns
// null for a recognized-but-unmodeled type (bounding box / path / clipping / point / linked mesh) after
// emitting a Skip crumb. Spine omits `type` for a region attachment (the default).
function parseSpineAttachment(
  name: string,
  raw: Record<string, unknown>,
  diagnostics?: ImportDiagnostic[],
): Attachment2D | null {
  const type = typeof raw.type === 'string' ? raw.type : 'region';
  if (type === 'region') return parseSpineRegionAttachment(name, raw);
  if (type === 'mesh') return parseSpineMeshAttachment(name, raw, diagnostics);
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Skip,
    `spine.${type}-attachment-unsupported`,
    'parseSpineAttachment',
    { name: 1 },
  );
  return null;
}

// Parses every named skin the file declares, in file order, into the rig's wardrobe. Spine keys each skin's
// attachments by SLOT NAME, so the slot array is needed to resolve those to the slot indices
// `AttachmentSkin2D` stores — which is why this runs after slots rather than before.
//
// Both spellings are accepted: the Spine 4.x array-of-skins form and the older object form (`{ default: … }`).
// The `default` skin is not special here beyond being the one whose attachments a slot's own `attachment`
// field resolves against; it is returned in the wardrobe alongside the alternates, because a rig that layers
// `goblin` over `default` needs the base to still be addressable by name.
function parseSpineSkins(raw: unknown, slots: readonly Slot2D[], diagnostics?: ImportDiagnostic[]): AttachmentSkin2D[] {
  const skins: AttachmentSkin2D[] = [];
  const named: [string, unknown][] = [];
  if (Array.isArray(raw)) {
    for (const skin of raw) {
      if (skin === null || typeof skin !== 'object') continue;
      const s = skin as Record<string, unknown>;
      named.push([typeof s.name === 'string' ? s.name : 'default', s.attachments]);
    }
  } else if (raw !== null && typeof raw === 'object') {
    for (const [name, attachments] of Object.entries(raw as Record<string, unknown>)) named.push([name, attachments]);
  }
  for (const [name, rawAttachments] of named) {
    if (rawAttachments === null || typeof rawAttachments !== 'object') continue;
    const attachments: SkinAttachment2D[] = [];
    for (const [slotName, slotAttachments] of Object.entries(rawAttachments as Record<string, unknown>)) {
      if (slotAttachments === null || typeof slotAttachments !== 'object') continue;
      const slotIndex = indexOfSpineSlot(slots, slotName);
      for (const [attachmentName, rawAttachment] of Object.entries(slotAttachments as Record<string, unknown>)) {
        if (rawAttachment === null || typeof rawAttachment !== 'object') continue;
        const attachment = parseSpineAttachment(attachmentName, rawAttachment as Record<string, unknown>, diagnostics);
        // A skin entry for a slot the skeleton does not have cannot be applied, so it is dropped rather
        // than stored with a -1 index that `setSkeleton2DSkin` would have to re-check every wardrobe change.
        if (attachment !== null && slotIndex >= 0) attachments.push({ attachment, name: attachmentName, slotIndex });
      }
    }
    skins.push({ attachments, name });
  }
  return skins;
}

function indexOfSpineSlot(slots: readonly Slot2D[], name: string): number {
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].name === name) return i;
  }
  return -1;
}

// A Spine mesh attachment. Unweighted when the `vertices` stream is exactly 2 per vertex (positions local
// to the slot's bone); weighted (Spine format `[boneCount, (boneIndex, x, y, weight)×boneCount]` per
// vertex) otherwise, producing a Skin2D whose bone indices are global skeleton bone indices.
function parseSpineMeshAttachment(
  name: string,
  raw: Record<string, unknown>,
  diagnostics?: ImportDiagnostic[],
): MeshAttachment2D {
  const uvs = toFloat32Array(raw.uvs);
  const triangles = toUint16Array(raw.triangles);
  const rawVerts = Array.isArray(raw.vertices) ? (raw.vertices as number[]) : [];
  const vertexCount = uvs.length >> 1;
  if (rawVerts.length === vertexCount * 2) {
    const out = allocateEntity<MeshAttachment2D>();
    out.kind = MeshAttachment2DKind;
    out.name = name;
    out.skin = null;
    out.triangles = triangles;
    out.uvs = uvs;
    out.vertexCount = vertexCount;
    out.vertices = Float32Array.from(rawVerts);
    return finishEntity(out);
  }
  const out = allocateEntity<MeshAttachment2D>();
  out.kind = MeshAttachment2DKind;
  out.name = name;
  out.skin = parseSpineWeightedVertices(rawVerts, vertexCount, diagnostics);
  out.triangles = triangles;
  out.uvs = uvs;
  out.vertexCount = vertexCount;
  out.vertices = null;
  return finishEntity(out);
}

function parseSpineRegionAttachment(name: string, raw: Record<string, unknown>): RegionAttachment2D {
  const out = allocateEntity<RegionAttachment2D>();
  out.height = numberOr(raw.height, 0);
  out.kind = RegionAttachment2DKind;
  out.name = name;
  out.rotation = numberOr(raw.rotation, 0);
  out.scaleX = numberOr(raw.scaleX, 1);
  out.scaleY = numberOr(raw.scaleY, 1);
  out.width = numberOr(raw.width, 0);
  out.x = numberOr(raw.x, 0);
  out.y = numberOr(raw.y, 0);
  return finishEntity(out);
}

// Slots bind a bone to its currently-shown attachment; their array order is the draw order. `boneIndex`
// resolves the slot's bone name; the shown attachment is the slot's `attachment` name looked up in the
// default skin. `color` is the Spine "rrggbbaa" tint (default opaque white).
function parseSpineSlots(
  raw: unknown,
  bones: readonly Bone2D[],
): { attachmentNames: (string | null)[]; slots: Slot2D[] } {
  const attachmentNames: (string | null)[] = [];
  const slots: Slot2D[] = [];
  if (!Array.isArray(raw)) return { attachmentNames, slots };
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const slot = entry as Record<string, unknown>;
    const name = typeof slot.name === 'string' ? slot.name : null;
    let boneIndex = -1;
    if (typeof slot.bone === 'string') {
      for (let i = 0; i < bones.length; i++) {
        if (bones[i].name === slot.bone) {
          boneIndex = i;
          break;
        }
      }
    }
    attachmentNames.push(typeof slot.attachment === 'string' ? slot.attachment : null);
    slots.push({ attachment: null, boneIndex, color: parseSpineColor(slot.color), name });
  }
  return { attachmentNames, slots };
}

// Resolves each slot's setup attachment out of the DEFAULT skin, now that both exist. A slot names the
// attachment it shows, but the art lives in a skin — and skins are keyed by slot, so neither can be built
// without the other. Slots are therefore built bare and dressed here.
function resolveSpineSetupAttachments(
  slots: Slot2D[],
  attachmentNames: readonly (string | null)[],
  skins: readonly AttachmentSkin2D[],
): void {
  const setup = skins.find((skin) => skin.name === SPINE_DEFAULT_SKIN_NAME) ?? skins[0];
  if (setup === undefined) return;
  for (const entry of setup.attachments) {
    if (entry.slotIndex < slots.length && attachmentNames[entry.slotIndex] === entry.name) {
      slots[entry.slotIndex].attachment = entry.attachment;
    }
  }
}

// A Spine "rrggbbaa" hex color to a packed RGBA integer; opaque white (0xffffffff) when absent/invalid.
function parseSpineColor(value: unknown): number {
  if (typeof value !== 'string' || value.length !== 8) return 0xffffffff;
  const parsed = Number.parseInt(value, 16);
  return Number.isNaN(parsed) ? 0xffffffff : parsed >>> 0;
}

// Decodes Spine's variable-influence weighted-vertex stream: per vertex a `boneCount` followed by that many
// `(boneIndex, x, y, weight)` quads. Both the vertex count (from `uvs`) and each `boneCount` are declared IN
// the file, independent of the stream's actual length — so every read is bounded against `rawVerts.length`
// (the independent address anchor): a `boneCount` that would run past the end is clamped to what remains,
// and the recovery is recorded. Without this a corrupt count reads `undefined` (→ NaN) or, with a huge
// value, spins a near-unbounded push loop. `boneIndex` values are file-order indices into the bone array;
// parseSpineBones keeps that array aligned (it never drops a slot) so they stay valid.
function parseSpineWeightedVertices(
  rawVerts: readonly number[],
  vertexCount: number,
  diagnostics?: ImportDiagnostic[],
): Skin2D {
  const influenceCounts = new Uint16Array(vertexCount);
  const influences: number[] = [];
  let truncated = false;
  let r = 0;
  for (let v = 0; v < vertexCount; v++) {
    if (r >= rawVerts.length) {
      truncated = true;
      break;
    }
    const declared = rawVerts[r++] | 0;
    const available = Math.max(0, (rawVerts.length - r) >> 2);
    const boneCount = Math.min(Math.max(declared, 0), available);
    if (boneCount !== declared) truncated = true;
    influenceCounts[v] = boneCount;
    for (let k = 0; k < boneCount; k++) {
      influences.push(rawVerts[r], rawVerts[r + 1], rawVerts[r + 2], rawVerts[r + 3]);
      r += 4;
    }
  }
  if (truncated) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'spine.weighted-vertices-truncated',
      'parseSpineWeightedVertices',
      { vertices: 1 },
    );
  }
  return createSkin2D(influenceCounts, Float32Array.from(influences));
}

function toFloat32Array(value: unknown): Float32Array {
  return Array.isArray(value) ? Float32Array.from(value as number[]) : new Float32Array();
}

function toUint16Array(value: unknown): Uint16Array {
  return Array.isArray(value) ? Uint16Array.from(value as number[]) : new Uint16Array();
}

// Adds one bone-timeline channel to `channels`: builds an AnimationTrack from the Spine keyframes (times
// + `extract`ed component values, with the setup pose already baked into `extract`) targeting the bone's
// `path`. A timeline whose every keyframe is `curve: 'stepped'` is a Step track; otherwise Linear.
//
// A keyframe may instead carry `curve` as an array of cubic-bezier control points, which becomes a
// per-interval `segmentEasings` entry on the track (see buildSpineSegmentEasings).
function addSpineBoneChannel(
  channels: ReturnType<typeof createAnimationChannel>[],
  rawKeys: unknown,
  boneIndex: number,
  path: (typeof Skeleton2DAnimationPath)[keyof typeof Skeleton2DAnimationPath],
  components: number,
  extract: (key: Record<string, unknown>) => readonly number[],
  diagnostics?: ImportDiagnostic[],
): void {
  if (!Array.isArray(rawKeys) || rawKeys.length === 0) return;
  // Malformed entries are dropped, so the accepted keys are collected alongside the times/values they
  // produced — segment i must index the key that actually wrote keyframe i, not the raw array position.
  const keys: Record<string, unknown>[] = [];
  const times: number[] = [];
  const values: number[] = [];
  let allStepped = true;
  for (const key of rawKeys) {
    if (key === null || typeof key !== 'object') continue;
    const k = key as Record<string, unknown>;
    keys.push(k);
    times.push(numberOr(k.time, 0));
    for (const component of extract(k)) values.push(component);
    if (k.curve !== 'stepped') allStepped = false;
  }
  const interpolation = allStepped ? AnimationInterpolationStep : AnimationInterpolationLinear;
  const segmentEasings = buildSpineSegmentEasings(keys, times, values, components, diagnostics);
  const track = createAnimationTrack({ components, interpolation, segmentEasings, times, values });
  channels.push(createAnimationChannel(track, createSkeleton2DBoneAnimationTarget(boneIndex, path)));
}

// Converts Spine's per-keyframe bezier `curve` arrays into one `EasingFunction` per INTERVAL, which is the
// shape `AnimationTrack.segmentEasings` takes (entry i reshapes the alpha of the segment from key i to
// i+1). Returns `null` when no interval carries a curve, so an uncurved timeline allocates nothing.
//
// Spine writes the control points in ABSOLUTE time/value units — not normalized — and writes FOUR numbers
// PER COMPONENT, in component order (a 1-component `rotate` carries 4, a 2-component `translate` carries 8).
// So each control point is rebased onto the segment to get the unit-square curve `easeCubicBezier` wants:
// `x = (cx − t1) / (t2 − t1)` and `y = (cy − v1) / (v2 − v1)`.
//
// PER-COMPONENT DIVERGENCE. Spine permits a different curve per component, but a Flight track carries one
// easing per interval, so the FIRST component's curve wins and a divergence is Skip-crumbed rather than
// silently dropped [decision 2026-07-30]. Divergence is measured on the NORMALIZED control points, not the
// raw numbers: two components with the same curve shape but different value ranges write different raw
// `cy`s, so a raw comparison would report divergence on essentially every multi-component timeline.
// A component whose value does not change across the segment is skipped when picking the winner — its
// curve carries no shape (the rebase would divide by zero) — so "first" means first MEANINGFUL component.
function buildSpineSegmentEasings(
  keys: readonly Readonly<Record<string, unknown>>[],
  times: readonly number[],
  values: readonly number[],
  components: number,
  diagnostics?: ImportDiagnostic[],
): (EasingFunction | null)[] | null {
  const segments = times.length - 1;
  if (segments < 1) return null;
  const easings: (EasingFunction | null)[] = [];
  let curved = false;
  let clampedSegments = 0;
  let divergentSegments = 0;
  for (let i = 0; i < segments; i++) {
    const curve = keys[i].curve;
    const span = times[i + 1] - times[i];
    if (!Array.isArray(curve) || span <= 0) {
      easings.push(null);
      continue;
    }
    // Pick the component with the LARGEST value change to supply the easing. The rebase divides by that
    // change, so a near-constant component is a near-zero denominator: it amplifies ordinary float noise
    // into control points far outside the unit square and yields a curve that is not the authored shape at
    // all. Choosing the dominant component is both the numerically stable option and the honest one — it is
    // the channel that actually carries the segment's motion.
    let winner = -1;
    let widest = 0;
    for (let c = 0; c < components && (c + 1) * 4 <= curve.length; c++) {
      const rise = Math.abs(values[(i + 1) * components + c] - values[i * components + c]);
      if (rise > widest) {
        widest = rise;
        winner = c;
      }
    }
    // The winner's control points are resolved FIRST, then every other component is compared against them.
    // Comparing inside a single pass would measure components that precede the winner against zeros.
    const rebase = (c: number): [number, number, number, number] | null => {
      const from = values[i * components + c];
      const rise = values[(i + 1) * components + c] - from;
      if (rise === 0) return null;
      const offset = c * 4;
      return [
        (numberOr(curve[offset], 0) - times[i]) / span,
        (numberOr(curve[offset + 1], 0) - from) / rise,
        (numberOr(curve[offset + 2], 0) - times[i]) / span,
        (numberOr(curve[offset + 3], 0) - from) / rise,
      ];
    };
    const won = winner < 0 ? null : rebase(winner);
    let diverged = false;
    if (won !== null) {
      for (let c = 0; c < components && (c + 1) * 4 <= curve.length; c++) {
        if (c === winner) continue;
        const other = rebase(c);
        if (other === null) continue;
        for (let k = 0; k < 4; k++) {
          if (Math.abs(other[k] - won[k]) > SPINE_CURVE_EPSILON) diverged = true;
        }
      }
    }
    const chosen = won !== null;
    const x1 = won === null ? 0 : won[0];
    const y1 = won === null ? 0 : won[1];
    const x2 = won === null ? 0 : won[2];
    const y2 = won === null ? 0 : won[3];
    if (diverged) divergentSegments++;
    if (chosen) {
      curved = true;
      // Spine lets a control point sit OUTSIDE its segment in time, which a CSS-style cubic bezier cannot
      // represent: `easeCubicBezier` inverts x→parameter, and that inversion is only well defined while x
      // stays monotonic over [0,1]. So the x components are clamped and the loss is recorded. The y
      // components are deliberately left unclamped — a y outside [0,1] is legitimate overshoot/anticipation
      // and the solver handles it, since y is the output value rather than the thing being inverted.
      const clampedX1 = clampUnit(x1);
      const clampedX2 = clampUnit(x2);
      if (clampedX1 !== x1 || clampedX2 !== x2) clampedSegments++;
      easings.push(easeCubicBezier(clampedX1, y1, clampedX2, y2));
    } else {
      easings.push(null);
    }
  }
  if (clampedSegments > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'spine.curve-time-overshoot-clamped',
      'buildSpineSegmentEasings',
      { segments: clampedSegments },
    );
  }
  if (divergentSegments > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.per-component-curve-easing-unsupported',
      'buildSpineSegmentEasings',
      { segments: divergentSegments },
    );
  }
  return curved ? easings : null;
}

function indexOfBone(bones: readonly Bone2D[], name: string): number {
  for (let i = 0; i < bones.length; i++) {
    if (bones[i].name === name) return i;
  }
  return -1;
}

// Builds one AnimationClip per Spine animation from its bone rotate/translate/scale/shear timelines.
// Spine bone timelines are RELATIVE to the setup pose (rotate/translate/shear are offsets, scale is a
// multiplier), and clips are emitted as those RAW relative deltas — `applyAnimationClipToSkeleton2D`
// composes them onto the setup pose per frame (add / multiply, keyed by `path`). Keeping deltas relative
// (rather than baking setup into keys) is what lets a mixer blend clips as `setup + Σ wᵢ·deltaᵢ`.
// Constraint (ik/transform/path), event, deform, draw-order, and slot timelines are recognized-but-
// unmodeled and Skip-crumbed. (Spine per-keyframe bezier curves approximate to Linear — a P1 fidelity
// limit noted in the package status.)
function parseSpineAnimations(
  raw: unknown,
  bones: readonly Bone2D[],
  slots: readonly Slot2D[],
  skins: readonly AttachmentSkin2D[],
  diagnostics?: ImportDiagnostic[],
): Skeleton2DImportAnimation[] {
  const animations: Skeleton2DImportAnimation[] = [];
  if (raw === null || typeof raw !== 'object') return animations;
  for (const [name, animEntry] of Object.entries(raw as Record<string, unknown>)) {
    if (animEntry === null || typeof animEntry !== 'object') continue;
    const anim = animEntry as Record<string, unknown>;
    const channels: ReturnType<typeof createAnimationChannel>[] = [];
    if (anim.bones !== null && typeof anim.bones === 'object') {
      for (const [boneName, timelinesEntry] of Object.entries(anim.bones as Record<string, unknown>)) {
        const boneIndex = indexOfBone(bones, boneName);
        if (boneIndex < 0 || timelinesEntry === null || typeof timelinesEntry !== 'object') continue;
        const timelines = timelinesEntry as Record<string, unknown>;
        addSpineBoneChannel(
          channels,
          timelines.rotate,
          boneIndex,
          Skeleton2DAnimationPath.Rotation,
          1,
          (k) => [numberOr(k.value, 0)],
          diagnostics,
        );
        addSpineBoneChannel(
          channels,
          timelines.translate,
          boneIndex,
          Skeleton2DAnimationPath.Translation,
          2,
          (k) => [numberOr(k.x, 0), numberOr(k.y, 0)],
          diagnostics,
        );
        addSpineBoneChannel(
          channels,
          timelines.scale,
          boneIndex,
          Skeleton2DAnimationPath.Scale,
          2,
          (k) => [numberOr(k.x, 1), numberOr(k.y, 1)],
          diagnostics,
        );
        addSpineBoneChannel(
          channels,
          timelines.shear,
          boneIndex,
          Skeleton2DAnimationPath.Shear,
          2,
          (k) => [numberOr(k.x, 0), numberOr(k.y, 0)],
          diagnostics,
        );
        // Spine 4 also writes the six PER-AXIS forms, lowercased, each a one-value keyframe under `value`
        // exactly as `rotate` is. They carry their own keyframe times, so they map to the per-axis paths
        // rather than being merged into the paired ones — see Skeleton2DAnimationPath.
        for (const axis of SPINE_BONE_AXIS_TIMELINES) {
          addSpineBoneChannel(
            channels,
            timelines[axis.key],
            boneIndex,
            axis.path,
            1,
            (k) => [numberOr(k.value, axis.identity)],
            diagnostics,
          );
        }
      }
    }
    parseSpineSlotTimelines(channels, anim.slots, slots, skins, diagnostics);
    skipCrumbSpineTimelineGroup(diagnostics, anim.ik, 'spine.ik-timeline-unsupported');
    skipCrumbSpineTimelineGroup(diagnostics, anim.transform, 'spine.transform-timeline-unsupported');
    skipCrumbSpineTimelineGroup(diagnostics, anim.path, 'spine.path-timeline-unsupported');
    skipCrumbSpineTimelineGroup(diagnostics, anim.deform, 'spine.deform-timeline-unsupported');
    skipCrumbSpineTimelineGroup(diagnostics, anim.events, 'spine.event-timeline-unsupported');
    const drawOrder = parseSpineDrawOrderTimeline(anim.drawOrder ?? anim.draworder, slots, diagnostics);
    animations.push({ clip: createAnimationClip(channels), drawOrder, name });
  }
  return animations;
}

// Slot timelines. Only `rgba` is modeled — it becomes a four-component 0..1 colour channel on a
// `Skeleton2DSlotAnimationTarget`. Spine writes the colour as an "rrggbbaa" hex string per keyframe and its
// curve control points in that same 0..1 space, so the track carries normalized channels rather than bytes.
//
// `rgb`, `alpha`, and the two dark-colour variants are recognized but not modeled: `Slot2D` has one packed
// colour and no dark colour, so a partial-channel timeline cannot be represented without inventing a setup
// blend. `attachment` swaps are a separate landing (index track + lookup table). Each is Skip-crumbed.
function parseSpineSlotTimelines(
  channels: ReturnType<typeof createAnimationChannel>[],
  raw: unknown,
  slots: readonly Slot2D[],
  skins: readonly AttachmentSkin2D[],
  diagnostics?: ImportDiagnostic[],
): void {
  if (raw === null || typeof raw !== 'object') return;
  const unmodeled = new Map<string, number>();
  for (const [slotName, timelinesEntry] of Object.entries(raw as Record<string, unknown>)) {
    if (timelinesEntry === null || typeof timelinesEntry !== 'object') continue;
    const slotIndex = indexOfSpineSlot(slots, slotName);
    for (const [kind, keys] of Object.entries(timelinesEntry as Record<string, unknown>)) {
      if (kind !== 'rgba' && kind !== 'attachment') {
        unmodeled.set(kind, (unmodeled.get(kind) ?? 0) + 1);
        continue;
      }
      if (slotIndex < 0 || !Array.isArray(keys) || keys.length === 0) continue;
      if (kind === 'attachment') addSpineSlotAttachmentChannel(channels, keys, slotIndex, slotName, skins);
      else addSpineSlotColorChannel(channels, keys, slotIndex, diagnostics);
    }
  }
  for (const [kind, count] of unmodeled) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      `spine.slot-${kind}-timeline-unsupported`,
      'parseSpineSlotTimelines',
      { timelines: count },
    );
  }
}

// One `rgba` slot timeline → a Color channel. Reuses the shared bezier rebase, which is why the values must
// be in the same 0..1 space the curve control points are authored in.
function addSpineSlotColorChannel(
  channels: ReturnType<typeof createAnimationChannel>[],
  rawKeys: readonly unknown[],
  slotIndex: number,
  diagnostics?: ImportDiagnostic[],
): void {
  const keys: Record<string, unknown>[] = [];
  const times: number[] = [];
  const values: number[] = [];
  let allStepped = true;
  for (const key of rawKeys) {
    if (key === null || typeof key !== 'object') continue;
    const k = key as Record<string, unknown>;
    keys.push(k);
    times.push(numberOr(k.time, 0));
    const packed = parseSpineColor(k.color);
    values.push(
      ((packed >>> 24) & 0xff) / 255,
      ((packed >>> 16) & 0xff) / 255,
      ((packed >>> 8) & 0xff) / 255,
      (packed & 0xff) / 255,
    );
    if (k.curve !== 'stepped') allStepped = false;
  }
  if (times.length === 0) return;
  const interpolation = allStepped ? AnimationInterpolationStep : AnimationInterpolationLinear;
  const segmentEasings = buildSpineSegmentEasings(keys, times, values, 4, diagnostics);
  const track = createAnimationTrack({ components: 4, interpolation, segmentEasings, times, values });
  channels.push(
    createAnimationChannel(track, createSkeleton2DSlotAnimationTarget(slotIndex, Skeleton2DSlotAnimationPath.Color)),
  );
}

// One `attachment` slot timeline → a STEP channel of indices into a per-channel attachment table.
//
// The keyframes name attachments by string; the table resolves each name ONCE here, against the setup skin,
// and the track then carries only the index. A keyframe with no name becomes `-1` — Spine's way of hiding a
// slot, which spineboy's `shoot` uses to extinguish muzzle flashes. Names that the setup skin does not
// supply also become `-1` rather than being dropped, because dropping a keyframe would shift the timing of
// every later swap.
//
// The table is deduplicated: a flash cycling through four images and back writes each attachment once.
function addSpineSlotAttachmentChannel(
  channels: ReturnType<typeof createAnimationChannel>[],
  rawKeys: readonly unknown[],
  slotIndex: number,
  slotName: string,
  skins: readonly AttachmentSkin2D[],
): void {
  const setup = skins.find((skin) => skin.name === SPINE_DEFAULT_SKIN_NAME) ?? skins[0];
  const attachments: (Attachment2D | null)[] = [];
  const indexByName = new Map<string, number>();
  const times: number[] = [];
  const values: number[] = [];
  for (const key of rawKeys) {
    if (key === null || typeof key !== 'object') continue;
    const k = key as Record<string, unknown>;
    times.push(numberOr(k.time, 0));
    const name = typeof k.name === 'string' ? k.name : null;
    if (name === null) {
      values.push(SPINE_NO_ATTACHMENT_INDEX);
      continue;
    }
    let index = indexByName.get(name);
    if (index === undefined) {
      const found = setup?.attachments.find((entry) => entry.slotIndex === slotIndex && entry.name === name);
      index = found === undefined ? SPINE_NO_ATTACHMENT_INDEX : attachments.push(found.attachment) - 1;
      indexByName.set(name, index);
    }
    values.push(index);
  }
  if (times.length === 0) return;
  const track = createAnimationTrack({
    components: 1,
    interpolation: AnimationInterpolationStep,
    times,
    values,
  });
  channels.push(
    createAnimationChannel(
      track,
      createSkeleton2DSlotAnimationTarget(slotIndex, Skeleton2DSlotAnimationPath.Attachment, attachments),
    ),
  );
}

// Reports one aggregated Skip crumb for an unmodeled animation timeline group, with the group's element
// count. An absent or empty group is silent.
function skipCrumbSpineTimelineGroup(diagnostics: ImportDiagnostic[] | undefined, raw: unknown, kind: string): void {
  let count = 0;
  if (Array.isArray(raw)) count = raw.length;
  else if (raw !== null && typeof raw === 'object') count = Object.keys(raw as Record<string, unknown>).length;
  if (count > 0)
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, kind, 'parseSpineAnimations', { count });
}

// Clamps a normalized bezier x component into the unit interval the curve solver can invert over.
function clampUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// Two normalized bezier control points closer than this are the same curve shape. Float rebasing through
// differing per-component value ranges introduces small error, so an exact comparison would report
// divergence on curves that are actually identical.
// Spine 4's per-axis bone timelines: the JSON key, the path it drives, and the delta that means "no
// change" for that field (1 for a scale multiplier, 0 for the additive ones).
const SPINE_BONE_AXIS_TIMELINES = [
  { identity: 0, key: 'translatex', path: Skeleton2DAnimationPath.TranslationX },
  { identity: 0, key: 'translatey', path: Skeleton2DAnimationPath.TranslationY },
  { identity: 1, key: 'scalex', path: Skeleton2DAnimationPath.ScaleX },
  { identity: 1, key: 'scaley', path: Skeleton2DAnimationPath.ScaleY },
  { identity: 0, key: 'shearx', path: Skeleton2DAnimationPath.ShearX },
  { identity: 0, key: 'sheary', path: Skeleton2DAnimationPath.ShearY },
] as const;

const SPINE_CURVE_EPSILON = 1e-6;

// Spine's name for the base skin every rig has; alternates layer over it.
const SPINE_DEFAULT_SKIN_NAME = 'default';

// The index an attachment channel uses for "show nothing" — Spine's nameless keyframe, and any name the
// setup skin cannot supply.
const SPINE_NO_ATTACHMENT_INDEX = -1;

// Maps a Spine bone `transform` string to a TransformMode2D. Spine omits the field for the default,
// so an absent/unknown value is `Normal`.
function spineTransformMode(value: unknown): TransformInherit2D {
  switch (value) {
    case 'onlyTranslation':
      return TransformMode2D.OnlyTranslation;
    case 'noRotationOrReflection':
      return TransformMode2D.NoRotationOrReflection;
    case 'noScale':
      return TransformMode2D.NoScale;
    case 'noScaleOrReflection':
      return TransformMode2D.NoScaleOrReflection;
    default:
      return TransformMode2D.Normal;
  }
}

// Parses a Spine skeleton `.json` document (text) into a Skeleton2DImport — the setup-pose Skeleton2D
// plus its named animations. Tolerant and best-effort: a malformed / non-Spine document returns the
// sentinel `null` (the expected "unrecognized format" failure); a recognized document with missing or
// unmodeled pieces yields best-effort data and reports `ImportDiagnostic`s through the optional
// `diagnostics` sink. Names mirror Spine's vocabulary (bone/slot/skin/attachment/timeline).
//
// This first landing parses the bone hierarchy; slots, attachments, skins, and animation timelines are
// layered on in the same tolerant shape, and Spine features Flight does not model (IK/transform/path
// constraints, clipping/path/point attachments, events) emit `ImportDiagnosticSeverity.Skip` crumbs.
export function parseSpineSkeleton(json: string, diagnostics?: ImportDiagnostic[]): Skeleton2DImport | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object') return null;
  const record = doc as Record<string, unknown>;
  const bones = parseSpineBones(record.bones, diagnostics);
  const { attachmentNames, slots } = parseSpineSlots(record.slots, bones);
  const skins = parseSpineSkins(record.skins, slots, diagnostics);
  resolveSpineSetupAttachments(slots, attachmentNames, skins);
  const animations = parseSpineAnimations(record.animations, bones, slots, skins, diagnostics);
  const skeleton = createSkeleton2D(bones, slots);
  if (skins.length > 0) skeleton.skins = skins;
  return { animations, skeleton };
}

// Turns the JSON form's slot NAMES into indices and hands the moves to the shared resolver, so this and
// the binary reader cannot disagree about what an offset list means.
function resolveSpineDrawOrder(raw: unknown, slots: readonly Slot2D[]): number[] | null {
  const moves: { offset: number; slotIndex: number }[] = [];
  if (Array.isArray(raw)) {
    for (const offset of raw) {
      if (offset === null || typeof offset !== 'object') continue;
      const move = offset as { offset?: unknown; slot?: unknown };
      const slotIndex = indexOfSpineSlot(slots, typeof move.slot === 'string' ? move.slot : '');
      if (slotIndex < 0) return null;
      moves.push({ offset: numberOr(move.offset, 0), slotIndex });
    }
  }
  return resolveSpineDrawOrdering(moves, slots.length);
}
