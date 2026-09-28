import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkin2D } from '@flighthq/skeleton2d/contract';
import type {
  Attachment2D,
  AttachmentSkin2D,
  ByteReader,
  EntityConstruction,
  ImportDiagnostic,
  MeshAttachment2D,
  RegionAttachment2D,
  Skin2D,
  SkinAttachment2D,
  SpineBinarySectionContext,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MeshAttachment2DKind, RegionAttachment2DKind } from '@flighthq/types/contract';

import {
  SPINE_BINARY_ATTACHMENT_TYPES,
  SPINE_BINARY_COLOR_BYTES,
  SPINE_BINARY_DEFAULT_SKIN_NAME,
  SPINE_BINARY_MESH_UV_BYTES,
  SPINE_BINARY_SKIN_REQUIREMENT_LISTS,
  SPINE_BINARY_TRIANGLE_INDEX_BYTES,
  readSpineBinaryStringReference,
} from './spineBinaryParseHelpers.ts';
import {
  hasSpineBinaryBytes,
  isSpineBinaryReaderOverrun,
  readSpineBinaryBoolean,
  readSpineBinaryByte,
  readSpineBinaryFloat,
  readSpineBinaryUnsignedShort,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader.ts';

export function spineBinarySkinsSectionHandler(context: SpineBinarySectionContext): void {
  readSpineBinarySkinsSection(context);
}

export const spineBinarySkinsSectionReader: (context: SpineBinarySectionContext) => void =
  spineBinarySkinsSectionHandler;

function readSpineBinarySkinsSection(context: SpineBinarySectionContext): void {
  context.skins.push(
    ...parseSpineBinarySkins(context.reader, context.strings, context.nonessential, context.diagnostics),
  );
}

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

function skipSpineBinarySkinsSection(context: SpineBinarySectionContext): void {
  parseSpineBinarySkins(context.reader, context.strings, context.nonessential);
}

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
    readSpineBinaryVarint(reader);
    skipSpineBinaryVertices(reader, readSpineBinaryVarint(reader));
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  } else if (type === 'point') {
    skipSpineBinaryBytes(reader, 12);
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  } else if (type === 'linkedmesh') {
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    readSpineBinaryBoolean(reader);
    skipSpineBinarySequence(reader);
    if (nonessential) skipSpineBinaryBytes(reader, 8);
  } else if (type === 'path') {
    skipSpineBinaryBytes(reader, 2);
    const vertexCount = readSpineBinaryVarint(reader);
    skipSpineBinaryVertices(reader, vertexCount);
    skipSpineBinaryBytes(reader, Math.floor(vertexCount / 3) * 4);
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
  }
  if (type === null) skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
  return null;
}

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
    {
      attachment: name ?? '',
      declared,
      field,
      remaining: reader.view.byteLength - reader.offset,
    },
  );
  skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
  const out = allocateEntity<MeshAttachment2D>();
  initializeMeshAttachment2D(out, MeshAttachment2DKind, name, null, new Uint16Array(), new Float32Array(), 0, null);
  return finishEntity(out);
}

function readSpineBinaryMeshAttachment(
  reader: ByteReader,
  strings: readonly (string | null)[],
  name: string | null,
  nonessential: boolean,
  diagnostics?: ImportDiagnostic[],
): MeshAttachment2D {
  readSpineBinaryVarint(reader);
  skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
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
  readSpineBinaryVarint(reader);
  skipSpineBinarySequence(reader);
  if (nonessential) {
    const edges = readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, edges * 2 + 8);
  }
  const out = allocateEntity<MeshAttachment2D>();
  initializeMeshAttachment2D(
    out,
    MeshAttachment2DKind,
    name,
    geometry.skin,
    triangles,
    uvs,
    vertexCount,
    geometry.vertices,
  );
  return finishEntity(out);
}

function readSpineBinaryRegionAttachment(
  reader: ByteReader,
  strings: readonly (string | null)[],
  name: string | null,
): RegionAttachment2D {
  readSpineBinaryVarint(reader);
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
  initializeRegionAttachment2D(out, height, RegionAttachment2DKind, name, rotation, scaleX, scaleY, width, x, y);
  return finishEntity(out);
}

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
    for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
      influences.push(
        readSpineBinaryVarint(reader),
        readSpineBinaryFloat(reader),
        readSpineBinaryFloat(reader),
        readSpineBinaryFloat(reader),
      );
    }
  }
  return {
    skin: createSkin2D(influenceCounts, Float32Array.from(influences)),
    vertices: null,
  };
}

function skipSpineBinaryVertices(reader: ByteReader, vertexCount: number): void {
  readSpineBinaryVertices(reader, vertexCount);
}

function skipSpineBinarySequence(reader: ByteReader): void {
  if (!readSpineBinaryBoolean(reader)) return;
  readSpineBinaryVarint(reader);
  readSpineBinaryVarint(reader);
  readSpineBinaryVarint(reader);
  readSpineBinaryVarint(reader);
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

export { skipSpineBinarySkinsSection };
