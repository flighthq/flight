import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkin2D } from '@flighthq/skeleton2d/contract';
import type {
  Attachment2D,
  AttachmentSkin2D,
  EntityConstruction,
  ImportDiagnostic,
  MeshAttachment2D,
  RegionAttachment2D,
  Skin2D,
  SkinAttachment2D,
  Slot2D,
  SpineJsonSectionContext,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MeshAttachment2DKind, RegionAttachment2DKind } from '@flighthq/types/contract';

import { indexOfSpineSlot, numberOr } from './spineParseHelpers.ts';

export function spineJsonSkinsSectionHandler(context: SpineJsonSectionContext): void {
  for (const skin of parseSpineSkins(context.doc.skins, context.slots, context.diagnostics)) {
    context.skins.push(skin);
  }
}

export const spineJsonSkinsSectionReader = spineJsonSkinsSectionHandler;

function initializeMeshAttachment2D(
  out: EntityConstruction<MeshAttachment2D>,
  kind: MeshAttachment2D['kind'],
  name: MeshAttachment2D['name'],
  skin: MeshAttachment2D['skin'],
  triangles: MeshAttachment2D['triangles'],
  uvs: MeshAttachment2D['uvs'],
  vertexCount: MeshAttachment2D['vertexCount'],
  vertices: MeshAttachment2D['vertices'],
): void {
  out.kind = kind;
  out.name = name;
  out.skin = skin;
  out.triangles = triangles;
  out.uvs = uvs;
  out.vertexCount = vertexCount;
  out.vertices = vertices;
}

function initializeRegionAttachment2D(
  out: EntityConstruction<RegionAttachment2D>,
  height: number,
  kind: RegionAttachment2D['kind'],
  name: RegionAttachment2D['name'],
  rotation: number,
  scaleX: number,
  scaleY: number,
  width: number,
  x: number,
  y: number,
): void {
  out.height = height;
  out.kind = kind;
  out.name = name;
  out.rotation = rotation;
  out.scaleX = scaleX;
  out.scaleY = scaleY;
  out.width = width;
  out.x = x;
  out.y = y;
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
    initializeMeshAttachment2D(
      out,
      MeshAttachment2DKind,
      name,
      null,
      triangles,
      uvs,
      vertexCount,
      Float32Array.from(rawVerts),
    );
    return finishEntity(out);
  }
  const out = allocateEntity<MeshAttachment2D>();
  initializeMeshAttachment2D(
    out,
    MeshAttachment2DKind,
    name,
    parseSpineWeightedVertices(rawVerts, vertexCount, diagnostics),
    triangles,
    uvs,
    vertexCount,
    null,
  );
  return finishEntity(out);
}

function parseSpineRegionAttachment(name: string, raw: Record<string, unknown>): RegionAttachment2D {
  const out = allocateEntity<RegionAttachment2D>();
  initializeRegionAttachment2D(
    out,
    numberOr(raw.height, 0),
    RegionAttachment2DKind,
    name,
    numberOr(raw.rotation, 0),
    numberOr(raw.scaleX, 1),
    numberOr(raw.scaleY, 1),
    numberOr(raw.width, 0),
    numberOr(raw.x, 0),
    numberOr(raw.y, 0),
  );
  return finishEntity(out);
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
