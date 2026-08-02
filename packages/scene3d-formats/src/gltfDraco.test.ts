import {
  getMeshGeometryIndexCount,
  getMeshGeometryVertexCount,
  getMeshGeometryVertexPosition,
} from '@flighthq/mesh/contract';
import type { GltfDocument, GltfDracoDecoder, GltfDracoMesh, ImportDiagnostic } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getGltfDracoDecoder,
  hasGltfDracoDecoder,
  registerGltfDracoDecoder,
  unregisterGltfDracoDecoder,
} from './gltfDraco';
import { parseGltf } from './gltfParse';

// A STUB decoder. The seam's whole point is that Flight ships no Draco implementation, so the tests
// prove the wiring — payload located, attribute ids handed over, decoded arrays preferred over the
// bufferView-less accessors, indices taken from the payload — with no third-party decoder present.
function stubDecoder(mesh: GltfDracoMesh, seen?: { attributeIds?: Record<string, number>; bytes?: Uint8Array }) {
  const decoder: GltfDracoDecoder = (bytes, attributeIds) => {
    if (seen !== undefined) {
      seen.bytes = Uint8Array.from(bytes as Uint8Array);
      seen.attributeIds = { ...attributeIds };
    }
    return mesh;
  };
  return decoder;
}

// A primitive whose accessors describe the data but carry NO bufferView, which is what the extension
// mandates — the values live in the compressed payload instead.
function makeDracoGltf(payload: readonly number[]): GltfDocument {
  let binary = '';
  for (let i = 0; i < payload.length; i++) binary += String.fromCharCode(payload[i]);
  return {
    accessors: [
      { componentType: 5126, count: 3, type: 'VEC3' },
      { componentType: 5125, count: 3, type: 'SCALAR' },
    ],
    asset: { version: '2.0' },
    bufferViews: [{ buffer: 0, byteLength: payload.length, byteOffset: 0 }],
    buffers: [{ byteLength: payload.length, uri: `data:application/octet-stream;base64,${btoa(binary)}` }],
    extensionsUsed: ['KHR_draco_mesh_compression'],
    meshes: [
      {
        primitives: [
          {
            attributes: { NORMAL: 2, POSITION: 0 },
            extensions: { KHR_draco_mesh_compression: { attributes: { NORMAL: 1, POSITION: 0 }, bufferView: 0 } },
            indices: 1,
          },
        ],
      },
    ],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
  } as unknown as GltfDocument;
}

const TRIANGLE: GltfDracoMesh = {
  attributes: {
    NORMAL: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    POSITION: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  },
  indices: Uint32Array.from([0, 1, 2]),
  vertexCount: 3,
};

afterEach(() => {
  unregisterGltfDracoDecoder();
});

describe('getGltfDracoDecoder', () => {
  it('imports a compressed primitive through the registered decoder', () => {
    registerGltfDracoDecoder(stubDecoder(TRIANGLE));
    const document = parseGltf(makeDracoGltf([1, 2, 3, 4]));

    expect(document.meshes).toHaveLength(1);
    const geometry = document.meshes[0].geometry;
    expect(getMeshGeometryVertexCount(geometry)).toBe(3);
    // Connectivity comes from the payload, not from the bufferView-less indices accessor.
    expect(getMeshGeometryIndexCount(geometry)).toBe(3);

    const position = { x: 0, y: 0, z: 0 };
    getMeshGeometryVertexPosition(position, geometry, 1);
    expect(position.x).toBeCloseTo(1, 5);
  });

  it('hands the decoder the payload bytes and the extension’s attribute ids', () => {
    // The id→semantic mapping stays on Flight's side of the boundary: the decoder is told it rather
    // than being asked to reinvent it.
    const seen: { attributeIds?: Record<string, number>; bytes?: Uint8Array } = {};
    registerGltfDracoDecoder(stubDecoder(TRIANGLE, seen));
    parseGltf(makeDracoGltf([9, 8, 7]));

    expect(Array.from(seen.bytes ?? [])).toEqual([9, 8, 7]);
    expect(seen.attributeIds).toEqual({ NORMAL: 1, POSITION: 0 });
  });

  it('reports gltf.draco-decoder-missing rather than a bogus accessor fault', () => {
    // Without this the read fails as `accessor-bufferview-not-found` — true but misleading, since the
    // bufferView is not missing; the data is somewhere the reader cannot go without a decoder.
    const diagnostics: ImportDiagnostic[] = [];
    parseGltf(makeDracoGltf([1, 2, 3]), diagnostics);

    const crumb = diagnostics.find((d) => d.kind === 'gltf.draco-decoder-missing');
    expect(crumb).toBeDefined();
    expect(crumb!.severity).toBe(ImportDiagnosticSeverity.Drop);
    expect(diagnostics.find((d) => d.kind === 'gltf.accessor-bufferview-not-found')).toBeUndefined();
  });

  it('contains a throwing decoder rather than letting it take the import down', () => {
    // A decoder is third-party code by design, so a broken payload degrades to a dropped primitive.
    const diagnostics: ImportDiagnostic[] = [];
    registerGltfDracoDecoder(() => {
      throw new Error('corrupt payload');
    });
    const document = parseGltf(makeDracoGltf([1, 2, 3]), diagnostics);

    expect(document.meshes).toHaveLength(0);
    expect(diagnostics.find((d) => d.kind === 'gltf.draco-decode-failed')).toBeDefined();
  });

  it('reports a decoder that declines the payload', () => {
    const diagnostics: ImportDiagnostic[] = [];
    registerGltfDracoDecoder(() => null);
    parseGltf(makeDracoGltf([1, 2, 3]), diagnostics);

    expect(diagnostics.find((d) => d.kind === 'gltf.draco-decode-failed')).toBeDefined();
  });
});

describe('hasGltfDracoDecoder', () => {
  it('makes the required-extension answer a runtime fact', () => {
    // Draco is the one extension whose support depends on what the caller registered, so the
    // unsupported report must follow the registry rather than being fixed at build time.
    const source = makeDracoGltf([1, 2, 3]);
    (source as { extensionsRequired?: string[] }).extensionsRequired = ['KHR_draco_mesh_compression'];

    const without: ImportDiagnostic[] = [];
    parseGltf(source, without);
    expect(without.find((d) => d.kind === 'gltf.unsupported-required-extension')).toBeDefined();

    registerGltfDracoDecoder(stubDecoder(TRIANGLE));
    const withDecoder: ImportDiagnostic[] = [];
    parseGltf(source, withDecoder);
    expect(withDecoder.find((d) => d.kind === 'gltf.unsupported-required-extension')).toBeUndefined();
  });
});

describe('registerGltfDracoDecoder', () => {
  it('starts empty so a build that never registers pays for nothing', () => {
    expect(hasGltfDracoDecoder()).toBe(false);
    expect(getGltfDracoDecoder()).toBeNull();
  });

  it('is last-write-wins, so a host can replace a portable decoder with a native one', () => {
    const first = stubDecoder(TRIANGLE);
    const second = stubDecoder(TRIANGLE);
    registerGltfDracoDecoder(first);
    registerGltfDracoDecoder(second);

    expect(getGltfDracoDecoder()).toBe(second);
  });
});

describe('unregisterGltfDracoDecoder', () => {
  it('returns the registry to empty', () => {
    registerGltfDracoDecoder(stubDecoder(TRIANGLE));
    unregisterGltfDracoDecoder();

    expect(hasGltfDracoDecoder()).toBe(false);
  });
});
