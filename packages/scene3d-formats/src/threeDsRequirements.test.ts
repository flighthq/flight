import {
  THREE_DS_CAMERA,
  THREE_DS_CHUNK_HEADER_BYTES,
  THREE_DS_EDITOR,
  THREE_DS_LIGHT,
  THREE_DS_MAIN,
  THREE_DS_MATERIAL,
  THREE_DS_OBJECT,
  THREE_DS_TRIMESH,
} from '@flighthq/types/contract';
import { BlinnPhongMaterialKind, RequirementFacet } from '@flighthq/types/contract';

import { parseThreeDsRequirements } from './threeDsRequirements.ts';

describe('parseThreeDsRequirements', () => {
  it('reports one document.format requirement per distinct feature chunk type', () => {
    const file = buildMinimal3ds([
      writeChunk(THREE_DS_MATERIAL, new Uint8Array(4)),
      writeObjectChunk('Box', THREE_DS_TRIMESH, new Uint8Array(4)),
    ]);
    const set = parseThreeDsRequirements(file);
    const formatReqs = set.requirements.filter((r) => r.facet === RequirementFacet.DocumentFormat);
    expect(formatReqs).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: '3ds.Material' });
    expect(formatReqs).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: '3ds.Trimesh' });
  });

  it('emits BlinnPhongMaterial requirement when materials are present', () => {
    const file = buildMinimal3ds([writeChunk(THREE_DS_MATERIAL, new Uint8Array(4))]);
    const set = parseThreeDsRequirements(file);
    expect(set.requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: BlinnPhongMaterialKind,
    });
  });

  it('omits BlinnPhongMaterial requirement when no materials are present', () => {
    const file = buildMinimal3ds([writeObjectChunk('Box', THREE_DS_TRIMESH, new Uint8Array(4))]);
    const set = parseThreeDsRequirements(file);
    const materialReqs = set.requirements.filter((r) => r.facet === RequirementFacet.SceneMaterialKind);
    expect(materialReqs).toEqual([]);
  });

  it('declares both document.format and scene.material-kind coverage', () => {
    const file = buildMinimal3ds([]);
    const set = parseThreeDsRequirements(file);
    expect(set.covers).toContain(RequirementFacet.DocumentFormat);
    expect(set.covers).toContain(RequirementFacet.SceneMaterialKind);
  });

  it('returns empty requirements with coverage when the source is unreadable', () => {
    const set = parseThreeDsRequirements(new Uint8Array());
    expect(set.requirements).toEqual([]);
    expect(set.covers).toContain(RequirementFacet.DocumentFormat);
  });

  it('includes light and camera feature chunks', () => {
    const file = buildMinimal3ds([
      writeObjectChunk('Lamp', THREE_DS_LIGHT, new Uint8Array(12)),
      writeObjectChunk('Cam', THREE_DS_CAMERA, new Uint8Array(32)),
    ]);
    const set = parseThreeDsRequirements(file);
    const formatKeys = set.requirements.filter((r) => r.facet === RequirementFacet.DocumentFormat).map((r) => r.key);
    expect(formatKeys).toContain('3ds.Light');
    expect(formatKeys).toContain('3ds.Camera');
  });
});

function writeChunk(id: number, body: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(THREE_DS_CHUNK_HEADER_BYTES + body.length);
  const view = new DataView(chunk.buffer);
  view.setUint16(0, id, true);
  view.setUint32(2, THREE_DS_CHUNK_HEADER_BYTES + body.length, true);
  chunk.set(body, THREE_DS_CHUNK_HEADER_BYTES);
  return chunk;
}

function writeObjectChunk(name: string, entityChunkId: number, entityBody: Uint8Array): Uint8Array {
  const nameBytes = new Uint8Array(name.length + 1);
  for (let i = 0; i < name.length; i++) nameBytes[i] = name.charCodeAt(i);
  const entityChunk = writeChunk(entityChunkId, entityBody);
  const bodySize = nameBytes.length + entityChunk.length;
  const object = new Uint8Array(THREE_DS_CHUNK_HEADER_BYTES + bodySize);
  const view = new DataView(object.buffer);
  view.setUint16(0, THREE_DS_OBJECT, true);
  view.setUint32(2, THREE_DS_CHUNK_HEADER_BYTES + bodySize, true);
  object.set(nameBytes, THREE_DS_CHUNK_HEADER_BYTES);
  object.set(entityChunk, THREE_DS_CHUNK_HEADER_BYTES + nameBytes.length);
  return object;
}

function buildMinimal3ds(editorChildren: Uint8Array[]): Uint8Array {
  let editorBodySize = 0;
  for (const child of editorChildren) editorBodySize += child.length;
  const editor = new Uint8Array(THREE_DS_CHUNK_HEADER_BYTES + editorBodySize);
  const editorView = new DataView(editor.buffer);
  editorView.setUint16(0, THREE_DS_EDITOR, true);
  editorView.setUint32(2, THREE_DS_CHUNK_HEADER_BYTES + editorBodySize, true);
  let offset = THREE_DS_CHUNK_HEADER_BYTES;
  for (const child of editorChildren) {
    editor.set(child, offset);
    offset += child.length;
  }

  const main = new Uint8Array(THREE_DS_CHUNK_HEADER_BYTES + editor.length);
  const mainView = new DataView(main.buffer);
  mainView.setUint16(0, THREE_DS_MAIN, true);
  mainView.setUint32(2, THREE_DS_CHUNK_HEADER_BYTES + editor.length, true);
  main.set(editor, THREE_DS_CHUNK_HEADER_BYTES);
  return main;
}
