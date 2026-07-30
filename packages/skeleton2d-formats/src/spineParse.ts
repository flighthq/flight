import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type {
  Attachment2D,
  Bone2D,
  ImportDiagnostic,
  MeshAttachment2D,
  RegionAttachment2D,
  Skeleton2DImport,
  Skeleton2DImportAnimation,
  Skin2D,
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
  TransformMode2D,
} from '@flighthq/types/contract';

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
  const defaultSkin = parseSpineDefaultSkin(record.skins, diagnostics);
  const slots = parseSpineSlots(record.slots, bones, defaultSkin);
  const animations = parseSpineAnimations(record.animations, bones, diagnostics);
  return { animations, skeleton: createSkeleton2D(bones, slots) };
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
    'parseSpineSkeleton',
    { name: 1 },
  );
  return null;
}

// The "default" skin's attachment table: slotName → attachmentName → Attachment2D, the setup-pose
// attachments a slot can show. Alternate (named) skins are the P3 skin-set feature and are Skip-crumbed.
// Supports the Spine 4.x array-of-skins form and the older object form.
function parseSpineDefaultSkin(raw: unknown, diagnostics?: ImportDiagnostic[]): Map<string, Map<string, Attachment2D>> {
  const table = new Map<string, Map<string, Attachment2D>>();
  let defaultAttachments: unknown;
  let alternateSkinCount = 0;
  if (Array.isArray(raw)) {
    for (const skin of raw) {
      if (skin === null || typeof skin !== 'object') continue;
      const s = skin as Record<string, unknown>;
      if (s.name === 'default') defaultAttachments = s.attachments;
      else alternateSkinCount++;
    }
  } else if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    defaultAttachments = obj.default;
    alternateSkinCount = Object.keys(obj).filter((k) => k !== 'default').length;
  }
  if (alternateSkinCount > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.alternate-skin-unsupported',
      'parseSpineSkeleton',
      { skins: alternateSkinCount },
    );
  }
  if (defaultAttachments === null || typeof defaultAttachments !== 'object') return table;
  for (const [slotName, slotAttachments] of Object.entries(defaultAttachments as Record<string, unknown>)) {
    if (slotAttachments === null || typeof slotAttachments !== 'object') continue;
    const perSlot = new Map<string, Attachment2D>();
    for (const [attachmentName, rawAttachment] of Object.entries(slotAttachments as Record<string, unknown>)) {
      if (rawAttachment === null || typeof rawAttachment !== 'object') continue;
      const attachment = parseSpineAttachment(attachmentName, rawAttachment as Record<string, unknown>, diagnostics);
      if (attachment !== null) perSlot.set(attachmentName, attachment);
    }
    table.set(slotName, perSlot);
  }
  return table;
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
    return {
      kind: MeshAttachment2DKind,
      name,
      skin: null,
      triangles,
      uvs,
      vertexCount,
      vertices: Float32Array.from(rawVerts),
    };
  }
  return {
    kind: MeshAttachment2DKind,
    name,
    skin: parseSpineWeightedVertices(rawVerts, vertexCount, diagnostics),
    triangles,
    uvs,
    vertexCount,
    vertices: null,
  };
}

function parseSpineRegionAttachment(name: string, raw: Record<string, unknown>): RegionAttachment2D {
  return {
    height: numberOr(raw.height, 0),
    kind: RegionAttachment2DKind,
    name,
    rotation: numberOr(raw.rotation, 0),
    scaleX: numberOr(raw.scaleX, 1),
    scaleY: numberOr(raw.scaleY, 1),
    width: numberOr(raw.width, 0),
    x: numberOr(raw.x, 0),
    y: numberOr(raw.y, 0),
  };
}

// Slots bind a bone to its currently-shown attachment; their array order is the draw order. `boneIndex`
// resolves the slot's bone name; the shown attachment is the slot's `attachment` name looked up in the
// default skin. `color` is the Spine "rrggbbaa" tint (default opaque white).
function parseSpineSlots(
  raw: unknown,
  bones: readonly Bone2D[],
  skin: ReadonlyMap<string, Map<string, Attachment2D>>,
): Slot2D[] {
  const slots: Slot2D[] = [];
  if (!Array.isArray(raw)) return slots;
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
    let attachment: Attachment2D | null = null;
    if (typeof slot.attachment === 'string' && name !== null) {
      attachment = skin.get(name)?.get(slot.attachment) ?? null;
    }
    slots.push({ attachment, boneIndex, color: parseSpineColor(slot.color), name });
  }
  return slots;
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
      'parseSpineSkeleton',
      { vertices: 1 },
    );
  }
  return { influenceCounts, influences: Float32Array.from(influences) };
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
function addSpineBoneChannel(
  channels: ReturnType<typeof createAnimationChannel>[],
  rawKeys: unknown,
  boneIndex: number,
  path: (typeof Skeleton2DAnimationPath)[keyof typeof Skeleton2DAnimationPath],
  components: number,
  extract: (key: Record<string, unknown>) => readonly number[],
): void {
  if (!Array.isArray(rawKeys) || rawKeys.length === 0) return;
  const times: number[] = [];
  const values: number[] = [];
  let allStepped = true;
  for (const key of rawKeys) {
    if (key === null || typeof key !== 'object') continue;
    const k = key as Record<string, unknown>;
    times.push(numberOr(k.time, 0));
    for (const component of extract(k)) values.push(component);
    if (k.curve !== 'stepped') allStepped = false;
  }
  const interpolation = allStepped ? AnimationInterpolationStep : AnimationInterpolationLinear;
  const track = createAnimationTrack({ components, interpolation, times, values });
  channels.push(createAnimationChannel(track, { boneIndex, path }));
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
        addSpineBoneChannel(channels, timelines.rotate, boneIndex, Skeleton2DAnimationPath.Rotation, 1, (k) => [
          numberOr(k.value, 0),
        ]);
        addSpineBoneChannel(channels, timelines.translate, boneIndex, Skeleton2DAnimationPath.Translation, 2, (k) => [
          numberOr(k.x, 0),
          numberOr(k.y, 0),
        ]);
        addSpineBoneChannel(channels, timelines.scale, boneIndex, Skeleton2DAnimationPath.Scale, 2, (k) => [
          numberOr(k.x, 1),
          numberOr(k.y, 1),
        ]);
        addSpineBoneChannel(channels, timelines.shear, boneIndex, Skeleton2DAnimationPath.Shear, 2, (k) => [
          numberOr(k.x, 0),
          numberOr(k.y, 0),
        ]);
      }
    }
    skipCrumbSpineTimelineGroup(diagnostics, anim.slots, 'spine.slot-timeline-unsupported');
    skipCrumbSpineTimelineGroup(diagnostics, anim.ik, 'spine.ik-timeline-unsupported');
    skipCrumbSpineTimelineGroup(diagnostics, anim.transform, 'spine.transform-timeline-unsupported');
    skipCrumbSpineTimelineGroup(diagnostics, anim.path, 'spine.path-timeline-unsupported');
    skipCrumbSpineTimelineGroup(diagnostics, anim.deform, 'spine.deform-timeline-unsupported');
    skipCrumbSpineTimelineGroup(diagnostics, anim.events, 'spine.event-timeline-unsupported');
    skipCrumbSpineTimelineGroup(diagnostics, anim.drawOrder ?? anim.draworder, 'spine.draworder-timeline-unsupported');
    animations.push({ clip: createAnimationClip(channels), name });
  }
  return animations;
}

// Reports one aggregated Skip crumb for an unmodeled animation timeline group, with the group's element
// count. An absent or empty group is silent.
function skipCrumbSpineTimelineGroup(diagnostics: ImportDiagnostic[] | undefined, raw: unknown, kind: string): void {
  let count = 0;
  if (Array.isArray(raw)) count = raw.length;
  else if (raw !== null && typeof raw === 'object') count = Object.keys(raw as Record<string, unknown>).length;
  if (count > 0)
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, kind, 'parseSpineSkeleton', { count });
}

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
