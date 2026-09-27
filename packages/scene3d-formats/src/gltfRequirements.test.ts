import type { GltfDocument } from '@flighthq/types/contract';
import {
  RequirementFacet,
  SpecularGlossinessPbrMaterialKind,
  StandardPbrMaterialKind,
  UnlitMaterialKind,
} from '@flighthq/types/contract';

import { parseGlbRequirements, parseGltfRequirements } from './gltfRequirements.ts';

describe('parseGlbRequirements', () => {
  it('emits no requirements for an unreadable buffer', () => {
    const set = parseGlbRequirements(new Uint8Array(4));
    expect(set.requirements).toEqual([]);
  });

  it('extracts features from a valid GLB and emits namespaced requirements', () => {
    const doc = { asset: { version: '2.0' }, meshes: [{}] };
    const bytes = buildGlb(JSON.stringify(doc));
    const set = parseGlbRequirements(bytes);
    expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'gltf.Mesh' });
  });

  it('produces the same requirements as the equivalent JSON document', () => {
    const doc = {
      asset: { version: '2.0' },
      meshes: [{}],
      animations: [{}],
      extensionsUsed: ['KHR_materials_unlit'],
    };
    const fromGlb = parseGlbRequirements(buildGlb(JSON.stringify(doc)));
    const fromJson = parseGltfRequirements(doc as GltfDocument);
    expect(fromGlb.requirements).toEqual(fromJson.requirements);
    expect(fromGlb.covers).toEqual(fromJson.covers);
  });
});

describe('parseGltfRequirements', () => {
  it('emits namespaced document.format requirements per feature present', () => {
    const doc = { asset: { version: '2.0' }, meshes: [{}] } as GltfDocument;
    const set = parseGltfRequirements(doc);
    expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'gltf.Mesh' });
  });

  it('claims StandardPbr when meshes are present', () => {
    const doc = { asset: { version: '2.0' }, meshes: [{}] } as GltfDocument;
    const set = parseGltfRequirements(doc);
    expect(set.requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: StandardPbrMaterialKind,
    });
  });

  it('claims no material kind for a document with no meshes or material extensions', () => {
    const doc = { asset: { version: '2.0' }, cameras: [{}] } as GltfDocument;
    const set = parseGltfRequirements(doc);
    expect(set.requirements.some((r) => r.facet === RequirementFacet.SceneMaterialKind)).toBe(false);
  });

  it('claims Unlit when KHR_materials_unlit is used', () => {
    const doc = {
      asset: { version: '2.0' },
      extensionsUsed: ['KHR_materials_unlit'],
    } as GltfDocument;
    const set = parseGltfRequirements(doc);
    expect(set.requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: UnlitMaterialKind,
    });
  });

  it('claims SpecularGlossinessPbr when KHR_materials_pbrSpecularGlossiness is used', () => {
    const doc = {
      asset: { version: '2.0' },
      extensionsUsed: ['KHR_materials_pbrSpecularGlossiness'],
    } as GltfDocument;
    const set = parseGltfRequirements(doc);
    expect(set.requirements).toContainEqual({
      facet: RequirementFacet.SceneMaterialKind,
      key: SpecularGlossinessPbrMaterialKind,
    });
  });

  it('emits extension names as document.format requirements', () => {
    const doc = {
      asset: { version: '2.0' },
      extensionsUsed: ['KHR_draco_mesh_compression'],
    } as GltfDocument;
    const set = parseGltfRequirements(doc);
    expect(set.requirements).toContainEqual({
      facet: RequirementFacet.DocumentFormat,
      key: 'gltf.KHR_draco_mesh_compression',
    });
  });

  it('emits no requirements for an unparseable string', () => {
    const set = parseGltfRequirements('not json {');
    expect(set.requirements).toEqual([]);
  });

  it('declares both facets it covers', () => {
    const set = parseGltfRequirements('invalid');
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat, RequirementFacet.SceneMaterialKind]);
  });

  it('is deterministic for a full model', () => {
    const doc = {
      asset: { version: '2.0' },
      animations: [{}],
      cameras: [{}],
      meshes: [{}],
      skins: [{}],
      extensionsUsed: ['KHR_materials_unlit'],
    } as GltfDocument;
    const a = parseGltfRequirements(doc);
    const b = parseGltfRequirements(doc);
    expect(a.requirements).toEqual(b.requirements);
  });

  it('emits all format requirements for a full model in sorted order', () => {
    const doc = {
      asset: { version: '2.0' },
      animations: [{}],
      cameras: [{}],
      meshes: [{}],
      skins: [{}],
      extensionsUsed: ['KHR_materials_unlit'],
    } as GltfDocument;
    const set = parseGltfRequirements(doc);
    const formatKeys = set.requirements.filter((r) => r.facet === RequirementFacet.DocumentFormat).map((r) => r.key);
    expect(formatKeys).toEqual(['gltf.Animation', 'gltf.Camera', 'gltf.KHR_materials_unlit', 'gltf.Mesh', 'gltf.Skin']);
  });

  it('accepts a JSON string and produces the same result as the parsed object', () => {
    const doc = {
      asset: { version: '2.0' },
      meshes: [{}],
      extensionsUsed: ['KHR_materials_unlit'],
    };
    const fromObject = parseGltfRequirements(doc as GltfDocument);
    const fromString = parseGltfRequirements(JSON.stringify(doc));
    expect(fromString.requirements).toEqual(fromObject.requirements);
  });
});

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;

function buildGlb(json: string): Uint8Array {
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(json);
  const paddedLength = (jsonBytes.byteLength + 3) & ~3;
  const totalLength = 12 + 8 + paddedLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);

  view.setUint32(12, paddedLength, true);
  view.setUint32(16, GLB_JSON_CHUNK_TYPE, true);
  bytes.set(jsonBytes, 20);
  for (let i = jsonBytes.byteLength; i < paddedLength; i++) {
    bytes[20 + i] = 0x20;
  }

  return bytes;
}
