import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type {
  Attachment2D,
  Bone2D,
  ImportDiagnostic,
  MeshAttachment2D,
  RegionAttachment2D,
  Skeleton2DImport,
  Skin2D,
  Slot2D,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  MeshAttachment2DKind,
  RegionAttachment2DKind,
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
  return { animations: [], skeleton: createSkeleton2D(bones, slots) };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// Spine bones are authored parent-before-child, and reference their parent by name — so a parent's index
// is resolvable from the bones already accumulated. Returns -1 (a root) when there is no parent or it is
// not yet known (a forward reference, which a well-formed Spine file never produces).
function parseSpineBones(raw: unknown, _diagnostics?: ImportDiagnostic[]): Bone2D[] {
  const bones: Bone2D[] = [];
  if (!Array.isArray(raw)) return bones;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
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
  if (type === 'mesh') return parseSpineMeshAttachment(name, raw);
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
function parseSpineMeshAttachment(name: string, raw: Record<string, unknown>): MeshAttachment2D {
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
    skin: parseSpineWeightedVertices(rawVerts, vertexCount),
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

function parseSpineWeightedVertices(rawVerts: readonly number[], vertexCount: number): Skin2D {
  const influenceCounts = new Uint16Array(vertexCount);
  const influences: number[] = [];
  let r = 0;
  for (let v = 0; v < vertexCount; v++) {
    const boneCount = rawVerts[r++] | 0;
    influenceCounts[v] = boneCount;
    for (let k = 0; k < boneCount; k++) {
      influences.push(rawVerts[r], rawVerts[r + 1], rawVerts[r + 2], rawVerts[r + 3]);
      r += 4;
    }
  }
  return { influenceCounts, influences: Float32Array.from(influences) };
}

function toFloat32Array(value: unknown): Float32Array {
  return Array.isArray(value) ? Float32Array.from(value as number[]) : new Float32Array();
}

function toUint16Array(value: unknown): Uint16Array {
  return Array.isArray(value) ? Uint16Array.from(value as number[]) : new Uint16Array();
}

// Maps a Spine bone `transform` string to a TransformMode2D. Spine omits the field for the default,
// so an absent/unknown value is `Normal`.
function spineTransformMode(value: unknown): TransformMode2D {
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
