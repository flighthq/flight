import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, getNodeChildren, invalidateNodeLocalTransform } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, createSceneNode, isMesh, setSceneNodeTransform } from '@flighthq/scene';
import { createSkeleton3D } from '@flighthq/skeleton3d';
import type { Mesh, MeshGeometry, SceneNode, Skin } from '@flighthq/types';

import type { GltfBuffer, GltfComponentType, GltfDocument, GltfNode, GltfPrimitive } from './gltfSchema';

// Parses a binary glTF (`.glb`) container into a Scene. The 12-byte header (magic `glTF`, version,
// length) is validated, then the chunk stream is walked to extract the embedded JSON document and the
// optional BIN chunk; the BIN chunk backs any buffer that has no `uri`. Malformed containers return an
// empty Scene and push a warning rather than throwing.
export function createSceneFromGlb(bytes: Readonly<Uint8Array>, warnings?: string[]): Scene {
  const container = readGlbContainer(bytes, warnings);
  if (container === null) return createScene();
  return buildSceneFromGltfDocument(container.document, container.binary, warnings);
}

// Parses a glTF 2.0 document (JSON string or already-parsed object) into a Scene: the node hierarchy
// with transforms, plus Mesh nodes whose geometry is read from embedded (base64 data-URI) buffers. A
// malformed JSON string returns an empty Scene and pushes a warning rather than throwing.
//
// Imported today: POSITION + optional NORMAL / TANGENT / TEXCOORD_0 + indices, interleaved into the
// canonical PBR vertex layout (or the skinned layout when JOINTS_0/WEIGHTS_0 are present); skins
// (joint hierarchy + inverse-bind matrices bound to the mesh via `mesh.skin`); every `primitives[]`
// entry of a mesh (multi-primitive → sub-mesh children); strided (`byteStride`) and normalized-integer
// accessors. Not yet imported (return to these): materials/textures, animations, sparse accessors, and
// external (`.bin`) buffer URIs.
export function createSceneFromGltf(source: GltfDocument | string, warnings?: string[]): Scene {
  let doc: GltfDocument;
  if (typeof source === 'string') {
    try {
      doc = JSON.parse(source) as GltfDocument;
    } catch {
      warnings?.push('createSceneFromGltf: source is not valid JSON; returning empty scene');
      return createScene();
    }
  } else {
    doc = source;
  }
  return buildSceneFromGltfDocument(doc, null, warnings);
}

function applyNodeTransform(node: SceneNode, gltfNode: Readonly<GltfNode>): void {
  if (gltfNode.matrix !== undefined) {
    node.localMatrix.m.set(gltfNode.matrix);
    invalidateNodeLocalTransform(node);
    return;
  }
  const t = gltfNode.translation;
  const r = gltfNode.rotation;
  const s = gltfNode.scale;
  if (t === undefined && r === undefined && s === undefined) return;
  setSceneNodeTransform(
    node,
    { x: t?.[0] ?? 0, y: t?.[1] ?? 0, z: t?.[2] ?? 0 },
    { w: r?.[3] ?? 1, x: r?.[0] ?? 0, y: r?.[1] ?? 0, z: r?.[2] ?? 0 },
    { x: s?.[0] ?? 1, y: s?.[1] ?? 1, z: s?.[2] ?? 1 },
  );
}

// Builds the scene from a parsed document plus an optional GLB binary chunk (null for the JSON path).
function buildSceneFromGltfDocument(
  doc: Readonly<GltfDocument>,
  binary: Readonly<Uint8Array> | null,
  warnings?: string[],
): Scene {
  if (doc === null || typeof doc !== 'object') {
    warnings?.push('createSceneFromGltf: document is not an object; returning empty scene');
    return createScene();
  }
  const version = doc.asset?.version;
  if (version === undefined || !isSupportedGltfVersion(version)) {
    warnings?.push(`createSceneFromGltf: unsupported glTF asset.version '${version ?? '(missing)'}' (expected 2.x)`);
  }
  if (doc.extensionsRequired !== undefined) {
    for (const extension of doc.extensionsRequired) {
      warnings?.push(`createSceneFromGltf: required extension '${extension}' is not supported and was ignored`);
    }
  }

  const buffers = (doc.buffers ?? []).map((buffer) => decodeGltfBuffer(buffer, binary, warnings));
  // Each mesh maps to the list of geometries built from its primitives (one geometry per primitive).
  const meshGeometries = (doc.meshes ?? []).map((mesh) =>
    mesh.primitives.map((primitive) => primitiveToGeometry(doc, buffers, primitive, warnings)),
  );

  const gltfNodes = doc.nodes ?? [];
  const sceneNodes: SceneNode[] = gltfNodes.map((node) =>
    node.mesh !== undefined ? buildMeshSceneNode(meshGeometries[node.mesh]) : createSceneNode(),
  );

  for (let i = 0; i < gltfNodes.length; i++) {
    applyNodeTransform(sceneNodes[i], gltfNodes[i]);
    const children = gltfNodes[i].children;
    if (children !== undefined) {
      for (let c = 0; c < children.length; c++) addNodeChild(sceneNodes[i], sceneNodes[children[c]]);
    }
  }

  // Skin pass: a node carrying both `mesh` and `skin` instances a skinned mesh. Run it after every
  // node exists (and its transform is applied) so the skin's joint references resolve to the built,
  // rest-posed SceneNodes and their inverse-bind capture is correct.
  for (let i = 0; i < gltfNodes.length; i++) {
    const skinIndex = gltfNodes[i].skin;
    if (skinIndex === undefined || gltfNodes[i].mesh === undefined) continue;
    const skin = buildGltfSkin(doc, buffers, skinIndex, sceneNodes, warnings);
    if (skin !== null) applySkinToMeshNodes(sceneNodes[i], skin);
  }

  const scene = createScene();
  const roots = doc.scenes?.[doc.scene ?? 0]?.nodes ?? topLevelNodeIndices(gltfNodes);
  for (let r = 0; r < roots.length; r++) addNodeChild(scene, sceneNodes[roots[r]]);
  return scene;
}

// Attaches a skin to the Mesh node(s) a glTF node produced: directly when the node is itself a Mesh
// (single-primitive), or to each Mesh child when it is the transform-only group of a multi-primitive
// mesh. The skin object is shared across a multi-primitive mesh's parts — they share one skeleton.
function applySkinToMeshNodes(node: SceneNode, skin: Readonly<Skin>): void {
  if (isMesh(node)) {
    (node as Mesh).skin = skin;
    return;
  }
  const children = getNodeChildren(node);
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as unknown as SceneNode;
    if (isMesh(child)) (child as unknown as Mesh).skin = skin;
  }
}

// Builds a Skin from a glTF `skins[]` entry: resolves the joint node indices to the constructed
// SceneNodes, reads the inverse-bind matrices accessor (one column-major MAT4 per joint; identity per
// the spec when absent), and carries the joint names + optional skeleton-root node. Returns null when
// the skin index is out of range.
function buildGltfSkin(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  skinIndex: number,
  sceneNodes: readonly SceneNode[],
  warnings?: string[],
): Skin | null {
  const gltfSkin = doc.skins?.[skinIndex];
  if (gltfSkin === undefined) {
    warnings?.push(`buildGltfSkin: skin ${skinIndex} not found in document`);
    return null;
  }

  const joints: SceneNode[] = [];
  const names: string[] = [];
  for (let j = 0; j < gltfSkin.joints.length; j++) {
    const jointNodeIndex = gltfSkin.joints[j];
    const node = sceneNodes[jointNodeIndex];
    if (node === undefined) {
      warnings?.push(`buildGltfSkin: skin ${skinIndex} joint references missing node ${jointNodeIndex}`);
      continue;
    }
    joints.push(node);
    names.push(doc.nodes?.[jointNodeIndex]?.name ?? '');
  }

  const jointCount = joints.length;
  let inverseBindMatrices: Float32Array;
  if (gltfSkin.inverseBindMatrices !== undefined) {
    inverseBindMatrices = Float32Array.from(readAccessor(doc, buffers, gltfSkin.inverseBindMatrices, warnings).data);
  } else {
    // Spec default: identity per joint (the joints are authored pre-transformed).
    inverseBindMatrices = new Float32Array(jointCount * 16);
    for (let j = 0; j < jointCount; j++) {
      const base = j * 16;
      inverseBindMatrices[base] = 1;
      inverseBindMatrices[base + 5] = 1;
      inverseBindMatrices[base + 10] = 1;
      inverseBindMatrices[base + 15] = 1;
    }
  }

  const hasNames = names.some((name) => name.length > 0);
  const skeleton = createSkeleton3D(joints, inverseBindMatrices, hasNames ? names : null);
  const skeletonRoot = gltfSkin.skeleton !== undefined ? (sceneNodes[gltfSkin.skeleton] ?? null) : null;
  return { skeleton, skeletonRoot };
}

// Turns a mesh's per-primitive geometries into a scene node. A single-primitive mesh becomes the Mesh
// node directly; a multi-primitive mesh becomes a transform-only group with one child Mesh per
// primitive (each an independent drawable, so multi-material meshes keep every subset).
function buildMeshSceneNode(geometries: readonly MeshGeometry[] | undefined): SceneNode {
  if (geometries === undefined || geometries.length === 0) return createSceneNode();
  if (geometries.length === 1) return createMesh(geometries[0], []) as unknown as SceneNode;
  const group = createSceneNode();
  for (let i = 0; i < geometries.length; i++)
    addNodeChild(group, createMesh(geometries[i], []) as unknown as SceneNode);
  return group;
}

// Decodes a buffer into bytes. A `data:` URI base64-decodes; a buffer with no `uri` is backed by the
// GLB binary chunk when present. External (`.bin`) URIs and uri-less buffers without a binary chunk are
// unsupported today and decode to empty with a warning.
function decodeGltfBuffer(
  buffer: Readonly<GltfBuffer>,
  binary: Readonly<Uint8Array> | null,
  warnings?: string[],
): Uint8Array {
  const uri = buffer.uri;
  if (uri === undefined) {
    if (binary !== null) return binary as Uint8Array;
    warnings?.push('decodeGltfBuffer: buffer has no uri and no GLB binary chunk; returning empty buffer');
    return new Uint8Array(0);
  }
  const comma = uri.indexOf(',');
  if (!uri.startsWith('data:') || comma < 0) {
    warnings?.push('decodeGltfBuffer: only embedded data-URI buffers are supported; returning empty buffer');
    return new Uint8Array(0);
  }
  return decodeBase64(uri.slice(comma + 1));
}

// Portable base64 decode that works in Node.js (Vitest) and browsers alike, avoiding the
// browser-only atob() global.
function decodeBase64(s: string): Uint8Array {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const stripped = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < stripped.length; i += 4) {
    // A trailing quantum shorter than 4 chars encodes 1 or 2 bytes; the absent sextets contribute
    // zero to the value and their bytes are not emitted. (`indexOf` must not feed -1 into the bit
    // math, or it poisons the high byte — the reason padding is stripped and length-checked here.)
    const c0 = table.indexOf(stripped[i]);
    const c1 = table.indexOf(stripped[i + 1]);
    const c2 = i + 2 < stripped.length ? table.indexOf(stripped[i + 2]) : -1;
    const c3 = i + 3 < stripped.length ? table.indexOf(stripped[i + 3]) : -1;
    const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
    out.push((n >> 16) & 0xff);
    if (c2 >= 0) out.push((n >> 8) & 0xff);
    if (c3 >= 0) out.push(n & 0xff);
  }
  return new Uint8Array(out);
}

function isSupportedGltfVersion(version: string): boolean {
  return Number.parseInt(version, 10) === 2;
}

// Normalizes a raw integer component to its float range per the glTF spec: unsigned types map onto
// [0, 1] by dividing by their max; signed types map onto [-1, 1] via max(c / MAX, -1). Float
// components pass through unchanged.
function normalizeComponent(componentType: GltfComponentType, value: number): number {
  switch (componentType) {
    case 5120:
      return Math.max(value / 127, -1);
    case 5121:
      return value / 255;
    case 5122:
      return Math.max(value / 32767, -1);
    case 5123:
      return value / 65535;
    case 5125:
      return value / 4294967295;
    default:
      return value;
  }
}

function primitiveToGeometry(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  primitive: Readonly<GltfPrimitive>,
  warnings?: string[],
): MeshGeometry {
  if (primitive.mode !== undefined && primitive.mode !== 4) {
    warnings?.push(
      `primitiveToGeometry: primitive mode ${primitive.mode} is not triangles (4); geometry imported as-is`,
    );
  }
  const positionIndex = primitive.attributes.POSITION;
  if (positionIndex === undefined) {
    warnings?.push('primitiveToGeometry: primitive has no POSITION attribute; returning empty geometry');
    return createMeshGeometry({ layout: CANONICAL_LAYOUT, vertices: new Float32Array(0) });
  }
  const position = readAccessor(doc, buffers, positionIndex, warnings);
  const vertexCount = position.count;
  const normal =
    primitive.attributes.NORMAL !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.NORMAL, warnings)
      : null;
  const tangent =
    primitive.attributes.TANGENT !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.TANGENT, warnings)
      : null;
  const uv =
    primitive.attributes.TEXCOORD_0 !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.TEXCOORD_0, warnings)
      : null;

  // A primitive is skinned when it carries both influence channels; it then emits the skinned layout
  // (joints0/weights0 past uv0). JOINTS_0 is unsigned-integer indices (not normalized); WEIGHTS_0 is
  // float or normalized-integer weights, renormalized per vertex so any quantization drift still sums 1.
  const joints =
    primitive.attributes.JOINTS_0 !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.JOINTS_0, warnings)
      : null;
  const weights =
    primitive.attributes.WEIGHTS_0 !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.WEIGHTS_0, warnings)
      : null;
  const skinned = joints !== null && weights !== null;

  const floatsPerVertex = skinned ? SKINNED_FLOATS_PER_VERTEX : CANONICAL_FLOATS_PER_VERTEX;
  const vertices = new Float32Array(vertexCount * floatsPerVertex);
  for (let v = 0; v < vertexCount; v++) {
    const o = v * floatsPerVertex;
    vertices[o] = position.data[v * 3];
    vertices[o + 1] = position.data[v * 3 + 1];
    vertices[o + 2] = position.data[v * 3 + 2];
    if (normal !== null) {
      vertices[o + 3] = normal.data[v * 3];
      vertices[o + 4] = normal.data[v * 3 + 1];
      vertices[o + 5] = normal.data[v * 3 + 2];
    }
    if (tangent !== null) {
      vertices[o + 6] = tangent.data[v * 4];
      vertices[o + 7] = tangent.data[v * 4 + 1];
      vertices[o + 8] = tangent.data[v * 4 + 2];
      vertices[o + 9] = tangent.data[v * 4 + 3];
    }
    if (uv !== null) {
      vertices[o + 10] = uv.data[v * 2];
      vertices[o + 11] = uv.data[v * 2 + 1];
    }
    if (skinned) {
      vertices[o + 12] = joints.data[v * 4];
      vertices[o + 13] = joints.data[v * 4 + 1];
      vertices[o + 14] = joints.data[v * 4 + 2];
      vertices[o + 15] = joints.data[v * 4 + 3];
      const w0 = weights.data[v * 4];
      const w1 = weights.data[v * 4 + 1];
      const w2 = weights.data[v * 4 + 2];
      const w3 = weights.data[v * 4 + 3];
      const sum = w0 + w1 + w2 + w3;
      const inv = sum > 0 ? 1 / sum : 0;
      vertices[o + 16] = w0 * inv;
      vertices[o + 17] = w1 * inv;
      vertices[o + 18] = w2 * inv;
      vertices[o + 19] = w3 * inv;
    }
  }

  // glTF index accessors are ubyte/ushort/uint; normalize to Uint32Array (createMeshGeometry promotes/
  // accepts 16- or 32-bit index buffers).
  const indices =
    primitive.indices !== undefined
      ? Uint32Array.from(readAccessor(doc, buffers, primitive.indices, warnings).data)
      : undefined;
  return createMeshGeometry({
    indices,
    layout: skinned ? CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT : CANONICAL_LAYOUT,
    vertices,
  });
}

// Decodes a glTF accessor into a flat array, de-striding per `bufferView.byteStride` and decoding
// `normalized` integer attributes to their float ranges. Reads through a DataView (little-endian, as
// the spec mandates) so unaligned accessor/bufferView offsets are safe. Normalized accessors return a
// Float32Array; others return an array of the accessor's native component type (so uint32 index values
// stay exact).
function readAccessor(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  accessorIndex: number,
  warnings?: string[],
): { count: number; data: ArrayLike<number> } {
  const accessor = doc.accessors?.[accessorIndex];
  if (accessor === undefined) {
    warnings?.push(`readAccessor: accessor ${accessorIndex} not found in document`);
    return { count: 0, data: new Float32Array(0) };
  }
  const bufferViewIndex = accessor.bufferView ?? -1;
  const view = bufferViewIndex >= 0 ? doc.bufferViews?.[bufferViewIndex] : undefined;
  if (view === undefined) {
    warnings?.push(`readAccessor: bufferView ${bufferViewIndex} not found for accessor ${accessorIndex}`);
    return { count: 0, data: new Float32Array(0) };
  }
  const bytes = buffers[view.buffer];
  if (bytes === undefined) {
    warnings?.push(`readAccessor: buffer ${view.buffer} not found for accessor ${accessorIndex}`);
    return { count: 0, data: new Float32Array(0) };
  }

  const componentCount = TYPE_COMPONENTS[accessor.type];
  const componentByteSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  const elementByteSize = componentCount * componentByteSize;
  const stride = view.byteStride !== undefined && view.byteStride > 0 ? view.byteStride : elementByteSize;
  const baseOffset = bytes.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const dataView = new DataView(bytes.buffer);
  const normalize = accessor.normalized === true && accessor.componentType !== 5126;
  const total = accessor.count * componentCount;
  const out = normalize ? new Float32Array(total) : createComponentArray(accessor.componentType, total);

  for (let i = 0; i < accessor.count; i++) {
    const elementOffset = baseOffset + i * stride;
    for (let c = 0; c < componentCount; c++) {
      const raw = readComponent(dataView, accessor.componentType, elementOffset + c * componentByteSize);
      out[i * componentCount + c] = normalize ? normalizeComponent(accessor.componentType, raw) : raw;
    }
  }
  return { count: accessor.count, data: out };
}

// Reads one component at a byte offset, little-endian per the glTF spec.
function readComponent(view: Readonly<DataView>, componentType: GltfComponentType, offset: number): number {
  switch (componentType) {
    case 5120:
      return view.getInt8(offset);
    case 5121:
      return view.getUint8(offset);
    case 5122:
      return view.getInt16(offset, true);
    case 5123:
      return view.getUint16(offset, true);
    case 5125:
      return view.getUint32(offset, true);
    default:
      return view.getFloat32(offset, true);
  }
}

// Walks a GLB container: validates the 12-byte header and returns the parsed JSON document plus the
// optional BIN chunk. Returns null (with a warning) on any malformed header or chunk.
function readGlbContainer(
  bytes: Readonly<Uint8Array>,
  warnings?: string[],
): { binary: Uint8Array | null; document: GltfDocument } | null {
  if (bytes.byteLength < GLB_HEADER_BYTES) {
    warnings?.push('createSceneFromGlb: byte length is smaller than the 12-byte GLB header');
    return null;
  }
  const source = bytes as Uint8Array;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    warnings?.push("createSceneFromGlb: magic is not 'glTF'; not a GLB container");
    return null;
  }
  const version = view.getUint32(4, true);
  if (version !== 2) {
    warnings?.push(`createSceneFromGlb: unsupported GLB container version ${version} (expected 2)`);
    return null;
  }
  const declaredLength = view.getUint32(8, true);
  const end = Math.min(declaredLength, source.byteLength);

  let document: GltfDocument | null = null;
  let binary: Uint8Array | null = null;
  let offset = GLB_HEADER_BYTES;
  while (offset + GLB_CHUNK_HEADER_BYTES <= end) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + GLB_CHUNK_HEADER_BYTES;
    if (dataStart + chunkLength > end) {
      warnings?.push('createSceneFromGlb: chunk length runs past the end of the container');
      break;
    }
    const chunkData = source.subarray(dataStart, dataStart + chunkLength);
    if (chunkType === GLB_JSON_CHUNK && document === null) {
      const json = new TextDecoder().decode(chunkData);
      try {
        document = JSON.parse(json) as GltfDocument;
      } catch {
        warnings?.push('createSceneFromGlb: JSON chunk is not valid JSON');
        return null;
      }
    } else if (chunkType === GLB_BIN_CHUNK && binary === null) {
      binary = chunkData;
    }
    offset = dataStart + chunkLength;
  }

  if (document === null) {
    warnings?.push('createSceneFromGlb: no JSON chunk found in the container');
    return null;
  }
  return { binary, document };
}

function topLevelNodeIndices(nodes: readonly Readonly<GltfNode>[]): number[] {
  const referenced = new Set<number>();
  for (const node of nodes) {
    if (node.children !== undefined) for (const c of node.children) referenced.add(c);
  }
  const roots: number[] = [];
  for (let i = 0; i < nodes.length; i++) if (!referenced.has(i)) roots.push(i);
  return roots;
}

type ComponentArray = Float32Array | Int8Array | Int16Array | Uint8Array | Uint16Array | Uint32Array;

// Allocates a typed array matching the accessor's component type, so integer (e.g. uint32 index)
// values survive without a float round-trip.
function createComponentArray(componentType: GltfComponentType, length: number): ComponentArray {
  switch (componentType) {
    case 5120:
      return new Int8Array(length);
    case 5121:
      return new Uint8Array(length);
    case 5122:
      return new Int16Array(length);
    case 5123:
      return new Uint16Array(length);
    case 5125:
      return new Uint32Array(length);
    default:
      return new Float32Array(length);
  }
}

const COMPONENT_BYTE_SIZE: Record<GltfComponentType, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { MAT2: 4, MAT3: 9, MAT4: 16, SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// GLB container constants: the header magic (`glTF` little-endian), chunk-type tags (`JSON` and
// `BIN\0` little-endian), and the fixed header/chunk-header byte sizes.
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;

// The canonical interleaved PBR vertex layout the mesh builders and scene-{gl,wgpu} renderers share:
import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT } from './shared';

// Floats per vertex in the skinned record (position/normal/tangent/uv0/joints0/weights0), derived
// from the shared skinned layout so the two never drift.
const SKINNED_FLOATS_PER_VERTEX = CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.stride / 4;
