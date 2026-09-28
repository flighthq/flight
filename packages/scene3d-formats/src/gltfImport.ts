import { createScene3DsFromDocument } from '@flighthq/scene3d/contract';
import type {
  GltfCoreFeatureHandler,
  GltfDocument,
  GltfImportOptions,
  ImportDiagnostic,
  Scene3D,
  Scene3DDocument,
} from '@flighthq/types/contract';

import {
  createScene3DFromGlbWithCoreFeatureHandlers,
  createScene3DFromGltfWithCoreFeatureHandlers,
  parseGlbWithCoreFeatureHandlers,
  parseGltfWithCoreFeatureHandlers,
} from './gltfParse.ts';
import { registerGltfAnimationHandlers } from './registerGltfAnimationHandlers.ts';
import { registerGltfCameraHandlers } from './registerGltfCameraHandlers.ts';
import { registerGltfSkinHandlers } from './registerGltfSkinHandlers.ts';

/**
 * The zero-config glTF entry points: every optional CORE feature Flight ships, resolved for the caller.
 *
 * ★ THIS MODULE EXISTS SO THE SELECTIVE CORE CAN NAME NO PRESET. `gltfParse.ts` used to declare these six
 * wrappers, and with them the `getFullGltfCoreFeatureHandlers` below, so the module holding
 * `parseGltfWithCoreFeatureHandlers` — the entry point whose entire purpose is taking the handler list it is
 * given — named the animation, camera and skin registrars. esbuild shook that reference out (a selective parse
 * with an empty list measured 83,073 raw bytes either way, carrying no family marker), so it cost nothing; but
 * a source-level claim cannot be gated while it is false, and the reference was one reachable edge away from
 * putting all three families into every caller's graph.
 *
 * Extensions are deliberately NOT resolved here. A zero-config caller gets the core features and reports each
 * present extension unsupported, which is what `registerAllGltfHandlers` is for — the material-extension family
 * alone measures 21,577 raw bytes, more than the three core families together.
 */
export function createScene3DFromGlb(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3D {
  return createScene3DFromGlbWithCoreFeatureHandlers(bytes, getFullGltfCoreFeatureHandlers(), diagnostics, options);
}

// Parses a glTF 2.0 document (JSON string or already-parsed object) into a Scene3D — the file's default scene
// (`doc.scene`). Convenience over `createScene3DFromDocument(parseGltf(source), defaultScene3D)`; a malformed
// JSON string returns an empty Scene3D.
export function createScene3DFromGltf(
  source: GltfDocument | string,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3D {
  return createScene3DFromGltfWithCoreFeatureHandlers(source, getFullGltfCoreFeatureHandlers(), diagnostics, options);
}

// Parses a binary glTF (`.glb`) container into every scene it declares (`Scene3D[]`), each carrying its
// geometry; the file's animation clips are attached to scene INDEX 0. Malformed containers return an empty
// array.
//
// ★ INDEX 0, NOT THE DEFAULT SCENE, AND THE COMMENT USED TO SAY OTHERWISE. Measured against a document
// declaring `scene: 1`: the clips land on `scenes[0]` and `scenes[1]` gets none. Behavior is unchanged and
// pinned in `gltfImport.test.ts`; only the claim is corrected. The attachment is
// `createScene3DsFromDocument`'s, in `@flighthq/scene3d`.
export function createScene3DsFromGlb(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3D[] {
  return createScene3DsFromDocument(parseGlb(bytes, diagnostics, options));
}

// Parses a glTF 2.0 document into every scene it declares (`Scene3D[]`), each carrying its geometry; the
// file's animation clips are attached to scene index 0 (see createScene3DsFromGlb). Reach for this over
// createScene3DFromGltf when the file declares multiple scenes. A malformed JSON string returns an empty array.
export function createScene3DsFromGltf(
  source: GltfDocument | string,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3D[] {
  return createScene3DsFromDocument(parseGltf(source, diagnostics, options));
}

// Parses a binary glTF (`.glb`) container into a format-neutral Scene3DDocument. The 12-byte header (magic
// `glTF`, version, length) is validated, then the chunk stream is walked to extract the embedded JSON
// document and the optional BIN chunk; the BIN chunk backs any buffer that has no `uri`. `options` supplies
// external buffer bytes and a base path for any external URIs the GLB still references. Malformed containers
// return an empty document and push a warning rather than throwing. Assemble it into a live Scene3D with
// `createScene3DFromDocument`.
export function parseGlb(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3DDocument {
  return parseGlbWithCoreFeatureHandlers(bytes, getFullGltfCoreFeatureHandlers(), diagnostics, options);
}

// Parses a glTF 2.0 document (JSON string or already-parsed object) into a format-neutral Scene3DDocument:
// the node hierarchy with transforms, meshes (inline geometry + materials), skins, morph, and animation.
// A malformed JSON string returns an empty document and pushes a warning rather than throwing. Assemble it
// into a live Scene3D with `createScene3DFromDocument`.
//
// Imported today: POSITION + optional NORMAL / TANGENT / TEXCOORD_0 + indices, interleaved into the
// canonical PBR vertex layout (or the skinned layout when JOINTS_0/WEIGHTS_0 are present); skins (joint
// hierarchy + inverse-bind matrices); every `primitives[]` entry of a mesh (multi-primitive → sub-mesh
// child nodes); strided (`byteStride`) and normalized-integer accessors; sparse accessors; materials
// (metallic-roughness PBR → StandardPbrMaterial); textures with their sampler (wrap/filter), color space
// (srgb for baseColor/emissive, linear for data maps), and KHR_texture_transform UV remap, resolving
// embedded bytes to Embedded refs and external URIs to External refs (against `options.basePath`); external
// (`.bin`) buffers via `options.externalBuffers`.
export function parseGltf(
  source: GltfDocument | string,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3DDocument {
  return parseGltfWithCoreFeatureHandlers(source, getFullGltfCoreFeatureHandlers(), diagnostics, options);
}

// The optional core-feature families a zero-config parse resolves, in registration order. A fresh list per
// call: the parser owns no ambient registry, and handing the same array to two parses would let one caller's
// later `registerGltfCoreFeatureHandler` override reach the other.
function getFullGltfCoreFeatureHandlers(): GltfCoreFeatureHandler[] {
  const handlers: GltfCoreFeatureHandler[] = [];
  registerGltfAnimationHandlers(handlers);
  registerGltfCameraHandlers(handlers);
  registerGltfSkinHandlers(handlers);
  return handlers;
}
