import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkin2D } from '@flighthq/skeleton2d/contract';
import type {
  Attachment2D,
  AttachmentSkin2D,
  DragonBonesSectionContext,
  EntityConstruction,
  ImportDiagnostic,
  MeshAttachment2D,
  RegionAttachment2D,
  SkinAttachment2D,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MeshAttachment2DKind, RegionAttachment2DKind } from '@flighthq/types/contract';

import { parseDragonBonesBoneTransform } from './dragonBonesParseHelpers.ts';

type DragonBonesBoneRemap = (rawBoneIndex: number) => number;

export function dragonBonesSkinsSectionHandler(context: DragonBonesSectionContext): void {
  const remapBoneIndex = buildDragonBonesBoneRemap(context.rawIndexToOutput);
  const { skins, table } = parseDragonBonesSkins(
    context.armature.skin,
    context.slotOrder,
    remapBoneIndex,
    context.diagnostics,
  );
  for (const skin of skins) context.skins.push(skin);
  for (const [key, value] of table) context.displayTable.set(key, value);
}

export const dragonBonesSkinsSectionReader: (context: DragonBonesSectionContext) => void =
  dragonBonesSkinsSectionHandler;

function buildDragonBonesBoneRemap(rawIndexToOutput: readonly number[]): DragonBonesBoneRemap {
  return (rawBoneIndex) =>
    rawBoneIndex >= 0 && rawBoneIndex < rawIndexToOutput.length ? rawIndexToOutput[rawBoneIndex] : -1;
}

function findBonePoseOrdinal(bonePose: readonly number[], usedBoneCount: number, rawBoneIndex: number): number {
  for (let i = 0; i < usedBoneCount; i++) {
    if (bonePose[i * 7] === rawBoneIndex) return i;
  }
  return -1;
}

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

function numAt(values: readonly number[], index: number, fallback: number): number {
  return index >= 0 && index < values.length && typeof values[index] === 'number' ? values[index] : fallback;
}

function numberArray(value: unknown): readonly number[] {
  return Array.isArray(value) ? (value as number[]) : [];
}

function parseDragonBonesDisplay(
  raw: unknown,
  remapBoneIndex: DragonBonesBoneRemap,
  diagnostics?: ImportDiagnostic[],
): Attachment2D | null {
  if (raw === null || typeof raw !== 'object') return null;
  const display = raw as Record<string, unknown>;
  const type = typeof display.type === 'string' ? display.type : 'image';
  if (type === 'image') return parseDragonBonesRegionDisplay(display);
  if (type === 'mesh') return parseDragonBonesMeshDisplay(display, remapBoneIndex, diagnostics);
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Skip,
    `dragonbones.${type}-display-unsupported`,
    'parseDragonBonesDisplay',
    { displays: 1 },
  );
  return null;
}

function parseDragonBonesDisplayList(
  raw: unknown,
  remapBoneIndex: DragonBonesBoneRemap,
  diagnostics?: ImportDiagnostic[],
): (Attachment2D | null)[] {
  const displays: (Attachment2D | null)[] = [];
  if (!Array.isArray(raw)) return displays;
  for (const rawDisplay of raw) displays.push(parseDragonBonesDisplay(rawDisplay, remapBoneIndex, diagnostics));
  return displays;
}

function parseDragonBonesMeshDisplay(
  display: Record<string, unknown>,
  remapBoneIndex: DragonBonesBoneRemap,
  diagnostics?: ImportDiagnostic[],
): MeshAttachment2D | null {
  if ('share' in display) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.shared-mesh-unsupported',
      'parseDragonBonesMeshDisplay',
      { displays: 1 },
    );
    return null;
  }
  if ('weights' in display) {
    if ('bonePose' in display) return parseDragonBonesWeightedMesh(display, remapBoneIndex, diagnostics);
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.legacy-weighted-mesh-unsupported',
      'parseDragonBonesMeshDisplay',
      { displays: 1 },
    );
    return null;
  }
  const uvs = toFloat32Array(display.uvs);
  const out = allocateEntity<MeshAttachment2D>();
  initializeMeshAttachment2D(
    out,
    MeshAttachment2DKind,
    typeof display.name === 'string' ? display.name : null,
    null,
    toUint16Array(display.triangles),
    uvs,
    uvs.length >> 1,
    toFloat32Array(display.vertices),
  );
  return finishEntity(out);
}

function parseDragonBonesRegionDisplay(display: Record<string, unknown>): RegionAttachment2D {
  const transform = parseDragonBonesBoneTransform(display.transform);
  const out = allocateEntity<RegionAttachment2D>();
  initializeRegionAttachment2D(
    out,
    0,
    RegionAttachment2DKind,
    typeof display.name === 'string' ? display.name : null,
    transform.rotation,
    transform.scaleX,
    transform.scaleY,
    0,
    transform.x,
    transform.y,
  );
  return finishEntity(out);
}

function parseDragonBonesSkins(
  raw: unknown,
  slotOrder: ReadonlyMap<string, number>,
  remapBoneIndex: DragonBonesBoneRemap,
  diagnostics?: ImportDiagnostic[],
): { skins: AttachmentSkin2D[]; table: Map<string, (Attachment2D | null)[]> } {
  const table = new Map<string, (Attachment2D | null)[]>();
  const skins: AttachmentSkin2D[] = [];
  if (!Array.isArray(raw)) return { skins, table };
  for (const rawSkin of raw) {
    if (rawSkin === null || typeof rawSkin !== 'object') continue;
    const skin = rawSkin as Record<string, unknown>;
    const skinName = typeof skin.name === 'string' && skin.name.length > 0 ? skin.name : DEFAULT_DRAGONBONES_SKIN_NAME;
    if (!Array.isArray(skin.slot)) continue;
    const attachments: SkinAttachment2D[] = [];
    for (const rawSlot of skin.slot) {
      if (rawSlot === null || typeof rawSlot !== 'object') continue;
      const slot = rawSlot as Record<string, unknown>;
      if (typeof slot.name !== 'string') continue;
      const displays = parseDragonBonesDisplayList(slot.display, remapBoneIndex, diagnostics);
      if (skinName === DEFAULT_DRAGONBONES_SKIN_NAME) table.set(slot.name, displays);
      const slotIndex = slotOrder.get(slot.name) ?? -1;
      if (slotIndex < 0) continue;
      for (const display of displays) {
        const displayName = display?.name;
        if (display !== null && typeof displayName === 'string') {
          attachments.push({ attachment: display, name: displayName, slotIndex });
        }
      }
    }
    skins.push({ attachments, name: skinName });
  }
  return { skins, table };
}

function parseDragonBonesWeightedMesh(
  display: Record<string, unknown>,
  remapBoneIndex: DragonBonesBoneRemap,
  diagnostics?: ImportDiagnostic[],
): MeshAttachment2D {
  const uvs = toFloat32Array(display.uvs);
  const vertexCount = uvs.length >> 1;
  const verts = numberArray(display.vertices);
  const weights = numberArray(display.weights);
  const bonePose = numberArray(display.bonePose);
  const slotPose = numberArray(display.slotPose);
  const spA = numAt(slotPose, 0, 1);
  const spB = numAt(slotPose, 1, 0);
  const spC = numAt(slotPose, 2, 0);
  const spD = numAt(slotPose, 3, 1);
  const spTx = numAt(slotPose, 4, 0);
  const spTy = numAt(slotPose, 5, 0);
  const usedBoneCount = Math.floor(bonePose.length / 7);
  const influenceCounts = new Uint16Array(vertexCount);
  const influences: number[] = [];
  let recovered = false;
  let iW = 0;
  for (let v = 0; v < vertexCount; v++) {
    if (iW >= weights.length) {
      recovered = true;
      break;
    }
    const declaredCount = weights[iW++] | 0;
    const vx = numAt(verts, v * 2, 0);
    const vy = numAt(verts, v * 2 + 1, 0);
    const sx = spA * vx + spC * vy + spTx;
    const sy = spB * vx + spD * vy + spTy;
    let realCount = 0;
    for (let j = 0; j < declaredCount; j++) {
      if (iW + 1 >= weights.length) {
        recovered = true;
        break;
      }
      const rawBoneIndex = weights[iW++] | 0;
      const weight = weights[iW++];
      const outputBone = remapBoneIndex(rawBoneIndex);
      const ordinal = findBonePoseOrdinal(bonePose, usedBoneCount, rawBoneIndex);
      if (outputBone < 0 || ordinal < 0 || realCount >= MAX_INFLUENCES_PER_VERTEX) {
        recovered = true;
        continue;
      }
      const o = ordinal * 7;
      const ba = bonePose[o + 1];
      const bb = bonePose[o + 2];
      const bc = bonePose[o + 3];
      const bd = bonePose[o + 4];
      const btx = bonePose[o + 5];
      const bty = bonePose[o + 6];
      const det = ba * bd - bb * bc;
      if (det === 0) {
        recovered = true;
        continue;
      }
      const inv = 1 / det;
      const ia = bd * inv;
      const ib = -bb * inv;
      const ic = -bc * inv;
      const id = ba * inv;
      const itx = (bc * bty - bd * btx) * inv;
      const ity = (bb * btx - ba * bty) * inv;
      influences.push(outputBone, ia * sx + ic * sy + itx, ib * sx + id * sy + ity, weight);
      realCount++;
    }
    influenceCounts[v] = realCount;
  }
  if (recovered) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'dragonbones.weighted-mesh-recovered',
      'parseDragonBonesWeightedMesh',
      { meshes: 1 },
    );
  }
  const out = allocateEntity<MeshAttachment2D>();
  initializeMeshAttachment2D(
    out,
    MeshAttachment2DKind,
    typeof display.name === 'string' ? display.name : null,
    createSkin2D(influenceCounts, Float32Array.from(influences)),
    toUint16Array(display.triangles),
    uvs,
    vertexCount,
    null,
  );
  return finishEntity(out);
}

function toFloat32Array(value: unknown): Float32Array {
  return Array.isArray(value) ? Float32Array.from(value as number[]) : new Float32Array();
}

function toUint16Array(value: unknown): Uint16Array {
  return Array.isArray(value) ? Uint16Array.from(value as number[]) : new Uint16Array();
}

const DEFAULT_DRAGONBONES_SKIN_NAME = 'default';

const MAX_INFLUENCES_PER_VERTEX = 0xffff;
