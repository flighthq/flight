import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, createSceneNode, setSceneNodeTransform } from '@flighthq/scene';
import type { MeshGeometry, SceneNode, VertexAttributeLayout } from '@flighthq/types';

import type { GltfBuffer, GltfComponentType, GltfDocument, GltfNode, GltfPrimitive } from './gltfSchema';

// Parses a glTF 2.0 document (JSON string or already-parsed object) into a Scene: the node hierarchy
// with transforms, plus Mesh nodes whose geometry is read from embedded (base64 data-URI) buffers.
//
// Proving slice: POSITION + optional NORMAL / TEXCOORD_0 + indices, interleaved into the canonical PBR
// vertex layout (tangents zero-filled). Not yet imported (return to these): materials/textures,
// animations/skins, sparse accessors, GLB-binary (.glb), multi-primitive meshes beyond the first, and
// interleaved (`byteStride`) attribute buffer views.
export function createSceneFromGltf(source: GltfDocument | string, warnings?: string[]): Scene {
  const doc: GltfDocument = typeof source === 'string' ? (JSON.parse(source) as GltfDocument) : source;
  const buffers = (doc.buffers ?? []).map(decodeGltfBuffer);
  const meshGeometries = (doc.meshes ?? []).map((mesh) =>
    primitiveToGeometry(doc, buffers, mesh.primitives[0], warnings),
  );

  const gltfNodes = doc.nodes ?? [];
  const sceneNodes: SceneNode[] = gltfNodes.map((node) =>
    node.mesh !== undefined ? (createMesh(meshGeometries[node.mesh], []) as unknown as SceneNode) : createSceneNode(),
  );

  for (let i = 0; i < gltfNodes.length; i++) {
    applyNodeTransform(sceneNodes[i], gltfNodes[i]);
    const children = gltfNodes[i].children;
    if (children !== undefined) {
      for (let c = 0; c < children.length; c++) addNodeChild(sceneNodes[i], sceneNodes[children[c]]);
    }
  }

  const scene = createScene();
  const roots = doc.scenes?.[doc.scene ?? 0]?.nodes ?? topLevelNodeIndices(gltfNodes);
  for (let r = 0; r < roots.length; r++) addNodeChild(scene, sceneNodes[roots[r]]);
  return scene;
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

function primitiveToGeometry(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  primitive: Readonly<GltfPrimitive>,
  warnings?: string[],
): MeshGeometry {
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
  const uv =
    primitive.attributes.TEXCOORD_0 !== undefined
      ? readAccessor(doc, buffers, primitive.attributes.TEXCOORD_0, warnings)
      : null;

  const vertices = new Float32Array(vertexCount * CANONICAL_FLOATS_PER_VERTEX);
  for (let v = 0; v < vertexCount; v++) {
    const o = v * CANONICAL_FLOATS_PER_VERTEX;
    vertices[o] = position.data[v * 3];
    vertices[o + 1] = position.data[v * 3 + 1];
    vertices[o + 2] = position.data[v * 3 + 2];
    if (normal !== null) {
      vertices[o + 3] = normal.data[v * 3];
      vertices[o + 4] = normal.data[v * 3 + 1];
      vertices[o + 5] = normal.data[v * 3 + 2];
    }
    if (uv !== null) {
      vertices[o + 10] = uv.data[v * 2];
      vertices[o + 11] = uv.data[v * 2 + 1];
    }
  }

  // glTF index accessors are ubyte/ushort/uint; normalize to Uint32Array (createMeshGeometry promotes/
  // accepts 16- or 32-bit index buffers).
  const indices =
    primitive.indices !== undefined
      ? Uint32Array.from(readAccessor(doc, buffers, primitive.indices, warnings).data)
      : undefined;
  return createMeshGeometry({ indices, layout: CANONICAL_LAYOUT, vertices });
}

// Decodes a glTF accessor into a flat typed array (no de-striding: assumes tightly-packed bufferViews).
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
  const componentCount = TYPE_COMPONENTS[accessor.type];
  const byteOffset = bytes.byteOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const count = accessor.count * componentCount;
  return { count: accessor.count, data: typedView(bytes.buffer, accessor.componentType, byteOffset, count) };
}

function typedView(
  buffer: ArrayBufferLike,
  componentType: GltfComponentType,
  byteOffset: number,
  count: number,
): ArrayLike<number> {
  switch (componentType) {
    case 5120:
      return new Int8Array(buffer, byteOffset, count);
    case 5121:
      return new Uint8Array(buffer, byteOffset, count);
    case 5122:
      return new Int16Array(buffer, byteOffset, count);
    case 5123:
      return new Uint16Array(buffer, byteOffset, count);
    case 5125:
      return new Uint32Array(buffer, byteOffset, count);
    default:
      return new Float32Array(buffer, byteOffset, count);
  }
}

// Decodes a buffer's base64 data URI into bytes. Only embedded data URIs are supported today (external
// `.bin` URIs require a loader/fetch seam, added later).
function decodeGltfBuffer(buffer: Readonly<GltfBuffer>): Uint8Array {
  const uri = buffer.uri ?? '';
  const comma = uri.indexOf(',');
  const base64 = uri.startsWith('data:') && comma >= 0 ? uri.slice(comma + 1) : uri;
  return decodeBase64(base64);
}

// Portable base64 decode that works in Node.js (Vitest) and browsers alike, avoiding the
// browser-only atob() global.
function decodeBase64(s: string): Uint8Array {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const stripped = s.replace(/[^A-Za-z0-9+/]/g, '');
  const pad = stripped.length % 4;
  const padded = pad > 0 ? stripped + '='.repeat(4 - pad) : stripped;
  const out: number[] = [];
  for (let i = 0; i < padded.length; i += 4) {
    const n =
      (table.indexOf(padded[i]) << 18) |
      (table.indexOf(padded[i + 1]) << 12) |
      (table.indexOf(padded[i + 2]) << 6) |
      table.indexOf(padded[i + 3]);
    out.push((n >> 16) & 0xff);
    if (padded[i + 2] !== '=') out.push((n >> 8) & 0xff);
    if (padded[i + 3] !== '=') out.push(n & 0xff);
  }
  return new Uint8Array(out);
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

const TYPE_COMPONENTS: Record<string, number> = { MAT2: 4, MAT3: 9, MAT4: 16, SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// The canonical interleaved PBR vertex layout the mesh builders and scene-{gl,wgpu} renderers share:
// position(3) + normal(3) + tangent(4) + uv0(2), stride 48 bytes / 12 floats. Mirrored here (mesh keeps
// the source-of-truth const private); kept in sync structurally.
const CANONICAL_FLOATS_PER_VERTEX = 12;
const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};
