import { getNodeChildren } from '@flighthq/node/contract';
import type { GltfDocument } from '@flighthq/types/contract';

import {
  createScene3DFromGlb,
  createScene3DFromGltf,
  createScene3DsFromGlb,
  createScene3DsFromGltf,
  parseGlb,
  parseGltf,
} from './gltfImport.ts';
import { parseGltfWithCoreFeatureHandlers } from './gltfParse.ts';

// ★ WHAT THIS MODULE OWNS IS THE PRESET, SO THAT IS WHAT THESE ASSERT. The behavior of the parse itself —
// geometry, materials, textures, morph, diagnostics — is exercised against the core in `gltfParse.test.ts`.
// All `gltfImport.ts` adds is resolving the three optional core-feature families for a caller who named none,
// which is exactly what the selective sibling does not do. Each claim below is therefore written as a
// DIFFERENCE against `parseGltfWithCoreFeatureHandlers(..., [])` on the same document, so it fails both if the
// preset is dropped and if the core ever starts reading a feature on its own.

describe('createScene3DFromGlb', () => {
  it('resolves the preset through the GLB container, so the animation arrives unregistered', () => {
    expect(Object.keys(createScene3DFromGlb(buildGlb(OPTIONAL_FEATURES)).animations)).toEqual(['spin']);
  });

  it('returns an empty scene for a malformed container rather than throwing', () => {
    expect(getNodeChildren(createScene3DFromGlb(new Uint8Array([1, 2, 3])).root)).toEqual([]);
  });
});

describe('createScene3DFromGltf', () => {
  it('resolves the preset the selective sibling leaves to the caller', () => {
    expect(parseGltfWithCoreFeatureHandlers(OPTIONAL_FEATURES, []).cameras).toEqual([]);
    expect(Object.keys(createScene3DFromGltf(OPTIONAL_FEATURES).animations)).toEqual(['spin']);
  });

  // The fixture sets `scene: 1`, so a build that silently used index 0 would return node 'a'. That is the
  // whole reason this wrapper cannot be composed from `createScene3DFromDocument(parseGltf(...))` at a call
  // site: the default-scene index lives in the glTF document and is gone by the time a Scene3DDocument exists.
  it('builds the file’s DEFAULT scene, not scene 0', () => {
    const scene = createScene3DFromGltf(OPTIONAL_FEATURES);
    expect(getNodeChildren(scene.root).map((node) => node.name)).toEqual(['b']);
  });
});

describe('createScene3DsFromGlb', () => {
  it('builds every scene the container declares', () => {
    const scenes = createScene3DsFromGlb(buildGlb(OPTIONAL_FEATURES));
    expect(scenes.map((scene) => getNodeChildren(scene.root).map((node) => node.name))).toEqual([['a'], ['b']]);
  });

  it('returns an empty array for a malformed container', () => {
    expect(createScene3DsFromGlb(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe('createScene3DsFromGltf', () => {
  it('builds every scene the document declares', () => {
    const scenes = createScene3DsFromGltf(OPTIONAL_FEATURES);
    expect(scenes.map((scene) => getNodeChildren(scene.root).map((node) => node.name))).toEqual([['a'], ['b']]);
  });

  // ★ MEASURED, AND IT CONTRADICTS WHAT THE MOVED COMMENT USED TO CLAIM. The clips land on scene INDEX 0, not
  // on the file's default scene — this fixture declares `scene: 1`, and scenes[1] gets none. The comment on
  // these two functions said "attached to the default scene"; it now says index 0, because that is what
  // `createScene3DsFromDocument` does. Behavior is unchanged and this pins it.
  it('attaches the clips to scene index 0, which is not necessarily the default scene', () => {
    const scenes = createScene3DsFromGltf(OPTIONAL_FEATURES);
    expect(scenes.map((scene) => Object.keys(scene.animations).length)).toEqual([1, 0]);
  });
});

describe('parseGlb', () => {
  it('resolves the full core-feature preset for a GLB where the selective sibling resolves none', () => {
    const document = parseGlb(buildGlb(OPTIONAL_FEATURES));
    expect([document.animations.length, document.cameras.length, document.skins.length]).toEqual([1, 1, 1]);
  });
});

describe('parseGltf', () => {
  // The three families together, against the same document read with none of them: the whole of what this
  // module adds, in one comparison.
  it('resolves animations, cameras and skins where the selective parse resolves none', () => {
    const selective = parseGltfWithCoreFeatureHandlers(OPTIONAL_FEATURES, []);
    expect([selective.animations.length, selective.cameras.length, selective.skins.length]).toEqual([0, 0, 0]);

    const full = parseGltf(OPTIONAL_FEATURES);
    expect([full.animations.length, full.cameras.length, full.skins.length]).toEqual([1, 1, 1]);
  });

  // ★ THE PRESET IS THE CORE FEATURES ONLY. Extensions stay with `registerAllGltfHandlers`, because the
  // material-extension family alone measures more than the three core families together.
  it('leaves extension reinterpretation to registerAllGltfHandlers, importing the base material regardless', () => {
    const document = parseGltf({
      asset: { version: '2.0' },
      extensionsUsed: ['KHR_materials_unlit'],
      materials: [{ extensions: { KHR_materials_unlit: {} } }],
      scenes: [{ nodes: [] }],
    });
    expect(document.materials).toHaveLength(1);
  });
});

// Two scenes with `scene: 1`, one camera, one skin, and one two-keyframe rotation clip — the smallest document
// that separates all three core-feature families from the bedrock parse AND the default scene from scene 0.
const ANIMATION_TIMES = new Float32Array([0, 1]);
const ANIMATION_ROTATIONS = new Float32Array([0, 0, 0, 1, 0, 0.7071, 0, 0.7071]);

const OPTIONAL_FEATURES: GltfDocument = {
  accessors: [
    { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR' },
    { bufferView: 1, componentType: 5126, count: 2, type: 'VEC4' },
  ],
  animations: [
    {
      channels: [{ sampler: 0, target: { node: 1, path: 'rotation' } }],
      name: 'spin',
      samplers: [{ input: 0, interpolation: 'LINEAR', output: 1 }],
    },
  ],
  asset: { version: '2.0' },
  bufferViews: [
    { buffer: 0, byteLength: ANIMATION_TIMES.byteLength, byteOffset: 0 },
    { buffer: 0, byteLength: ANIMATION_ROTATIONS.byteLength, byteOffset: ANIMATION_TIMES.byteLength },
  ],
  buffers: [
    {
      byteLength: ANIMATION_TIMES.byteLength + ANIMATION_ROTATIONS.byteLength,
      uri: toDataUri(ANIMATION_TIMES, ANIMATION_ROTATIONS),
    },
  ],
  cameras: [{ perspective: { yfov: 1, znear: 0.1 }, type: 'perspective' }],
  nodes: [{ camera: 0, name: 'a', skin: 0 }, { name: 'b' }],
  scene: 1,
  scenes: [
    { name: 'first', nodes: [0] },
    { name: 'second', nodes: [1] },
  ],
  skins: [{ joints: [1] }],
};

// A minimal GLB container around a document, with an empty BIN chunk. Deliberately a local copy rather than a
// shared export: `scene3DFormatsTestHelper.ts` ships on both lanes, and test scaffolding does not belong in the
// published surface.
function buildGlb(doc: Readonly<GltfDocument>): Uint8Array {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(doc));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunkLength = jsonBytes.length + jsonPad;
  const total = 12 + 8 + jsonChunkLength + 8;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // magic 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunkLength, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.length + i] = 0x20; // the JSON chunk pads with spaces
  view.setUint32(20 + jsonChunkLength, 0, true);
  view.setUint32(24 + jsonChunkLength, 0x004e4942, true); // 'BIN\0'
  return out;
}

function toDataUri(...arrays: readonly ArrayBufferView[]): string {
  let total = 0;
  for (const array of arrays) total += array.byteLength;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), offset);
    offset += array.byteLength;
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:application/octet-stream;base64,${btoa(binary)}`;
}
