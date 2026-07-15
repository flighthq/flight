import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import type { SceneNode } from '@flighthq/types';

import {
  MD2_ANORMS,
  MD2_COMPRESSED_VERTEX_SIZE,
  MD2_FRAME_HEADER_SIZE,
  MD2_HEADER_SIZE,
  MD2_MAGIC,
  MD2_TEXCOORD_SIZE,
  MD2_TRIANGLE_SIZE,
  MD2_VERSION,
} from './md2Schema';
import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT } from './shared';

// Parses an id Software MD2 (Quake 2) binary model into a Scene. The first animation frame (frame 0)
// is imported as a single Mesh node; subsequent frames are ignored. Compressed vertices are
// decompressed using the per-frame scale and translate vectors, and normals are resolved from the
// 162-entry Anorms lookup table. UV coordinates are scaled from integer texture-space values to 0-1
// using the header's skinWidth and skinHeight.
//
// Because MD2 triangles reference vertex and texcoord indices independently (like OBJ), the parser
// re-indexes using a dedup map keyed by "vertIdx/texIdx" to build the canonical interleaved vertex
// buffer.
//
// Malformed input pushes a warning and returns an empty Scene rather than throwing.
export function createSceneFromMd2(bytes: Readonly<Uint8Array>, warnings?: string[]): Scene {
  if (bytes.length < MD2_HEADER_SIZE) {
    warnings?.push('createSceneFromMd2: input is shorter than the 68-byte MD2 header');
    return createScene();
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const magic = view.getInt32(0, true);
  if (magic !== MD2_MAGIC) {
    warnings?.push(`createSceneFromMd2: invalid magic 0x${(magic >>> 0).toString(16)}, expected 0x32504449 (IDP2)`);
    return createScene();
  }

  const version = view.getInt32(4, true);
  if (version !== MD2_VERSION) {
    warnings?.push(`createSceneFromMd2: unsupported version ${version}, expected 8`);
    return createScene();
  }

  const skinWidth = view.getInt32(8, true);
  const skinHeight = view.getInt32(12, true);
  const numVertices = view.getInt32(24, true);
  const numTexCoords = view.getInt32(28, true);
  const numTriangles = view.getInt32(32, true);
  const numFrames = view.getInt32(40, true);
  const offTexCoords = view.getInt32(48, true);
  const offTriangles = view.getInt32(52, true);
  const offFrames = view.getInt32(56, true);

  if (numFrames < 1) {
    warnings?.push('createSceneFromMd2: model has no frames');
    return createScene();
  }

  if (numTriangles < 1) {
    warnings?.push('createSceneFromMd2: model has no triangles');
    return createScene();
  }

  // Validate that the buffer contains the data regions we need.
  const texCoordsEnd = offTexCoords + numTexCoords * MD2_TEXCOORD_SIZE;
  const trianglesEnd = offTriangles + numTriangles * MD2_TRIANGLE_SIZE;
  const frame0VerticesEnd = offFrames + MD2_FRAME_HEADER_SIZE + numVertices * MD2_COMPRESSED_VERTEX_SIZE;

  if (texCoordsEnd > bytes.length || trianglesEnd > bytes.length || frame0VerticesEnd > bytes.length) {
    warnings?.push('createSceneFromMd2: input is truncated; data regions extend past end of buffer');
    return createScene();
  }

  // Read texcoords: int16 s, int16 t per entry. Scale to 0-1 using skinWidth/skinHeight.
  const uvScaleS = skinWidth > 0 ? 1 / skinWidth : 0;
  const uvScaleT = skinHeight > 0 ? 1 / skinHeight : 0;
  const texS = new Float32Array(numTexCoords);
  const texT = new Float32Array(numTexCoords);
  for (let i = 0; i < numTexCoords; i++) {
    const base = offTexCoords + i * MD2_TEXCOORD_SIZE;
    texS[i] = view.getInt16(base, true) * uvScaleS;
    texT[i] = view.getInt16(base + 2, true) * uvScaleT;
  }

  // Read frame 0: scale (3 float32), translate (3 float32), name (16 chars), then compressed vertices.
  const frameBase = offFrames;
  const scaleX = view.getFloat32(frameBase, true);
  const scaleY = view.getFloat32(frameBase + 4, true);
  const scaleZ = view.getFloat32(frameBase + 8, true);
  const translateX = view.getFloat32(frameBase + 12, true);
  const translateY = view.getFloat32(frameBase + 16, true);
  const translateZ = view.getFloat32(frameBase + 20, true);

  // Decompress vertices: position = (compressed * scale) + translate.
  const verticesBase = frameBase + MD2_FRAME_HEADER_SIZE;
  const posX = new Float32Array(numVertices);
  const posY = new Float32Array(numVertices);
  const posZ = new Float32Array(numVertices);
  const normalIndices = new Uint8Array(numVertices);
  for (let i = 0; i < numVertices; i++) {
    const base = verticesBase + i * MD2_COMPRESSED_VERTEX_SIZE;
    posX[i] = bytes[base] * scaleX + translateX;
    posY[i] = bytes[base + 1] * scaleY + translateY;
    posZ[i] = bytes[base + 2] * scaleZ + translateZ;
    normalIndices[i] = bytes[base + 3];
  }

  // Re-index triangles. Each MD2 triangle has 3 vertex indices and 3 texcoord indices (independent
  // indexing like OBJ). Build a dedup map keyed by "vertIdx/texIdx".
  const dedup = new Map<string, number>();
  const interleavedVertices: number[] = [];
  const indices: number[] = [];

  for (let t = 0; t < numTriangles; t++) {
    const triBase = offTriangles + t * MD2_TRIANGLE_SIZE;
    for (let c = 0; c < 3; c++) {
      const vertIdx = view.getUint16(triBase + c * 2, true);
      const texIdx = view.getUint16(triBase + 6 + c * 2, true);

      if (vertIdx >= numVertices) {
        warnings?.push(`createSceneFromMd2: triangle ${t} vertex index ${vertIdx} out of range`);
        continue;
      }
      if (texIdx >= numTexCoords) {
        warnings?.push(`createSceneFromMd2: triangle ${t} texcoord index ${texIdx} out of range`);
        continue;
      }

      const key = `${vertIdx}/${texIdx}`;
      let idx = dedup.get(key);
      if (idx === undefined) {
        idx = interleavedVertices.length / CANONICAL_FLOATS_PER_VERTEX;

        // Position (3 floats).
        interleavedVertices.push(posX[vertIdx], posY[vertIdx], posZ[vertIdx]);

        // Normal (3 floats) from Anorms table.
        const ni = normalIndices[vertIdx];
        if (ni < MD2_ANORMS.length) {
          const normal = MD2_ANORMS[ni];
          interleavedVertices.push(normal[0], normal[1], normal[2]);
        } else {
          interleavedVertices.push(0, 0, 0);
        }

        // Tangent (4 floats) — MD2 does not carry tangents; zero-filled.
        interleavedVertices.push(0, 0, 0, 0);

        // UV (2 floats).
        interleavedVertices.push(texS[texIdx], texT[texIdx]);

        dedup.set(key, idx);
      }
      indices.push(idx);
    }
  }

  if (indices.length === 0) {
    warnings?.push('createSceneFromMd2: no valid triangle indices produced');
    return createScene();
  }

  const scene = createScene();
  const vertices = new Float32Array(interleavedVertices);
  const indexArray = Uint32Array.from(indices);
  const geometry = createMeshGeometry({ indices: indexArray, layout: CANONICAL_LAYOUT, vertices });
  const meshNode = createMesh(geometry, []) as unknown as SceneNode;
  addNodeChild(scene, meshNode);

  return scene;
}
