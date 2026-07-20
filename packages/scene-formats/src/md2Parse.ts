import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation';
import { createBlinnPhongMaterial } from '@flighthq/materials';
import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, getNodeChildren } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, isMesh } from '@flighthq/scene';
import type {
  AnimationChannel,
  AnimationClip,
  Material,
  Mesh,
  MeshMorph,
  MorphTarget,
  SceneNode,
} from '@flighthq/types';
import { SceneAnimationPathWeights } from '@flighthq/types';

import {
  MD2_ANORMS,
  MD2_COMPRESSED_VERTEX_SIZE,
  MD2_FRAME_HEADER_SIZE,
  MD2_FRAME_FPS,
  MD2_HEADER_SIZE,
  MD2_MAGIC,
  MD2_SKIN_SIZE,
  MD2_TEXCOORD_SIZE,
  MD2_TRIANGLE_SIZE,
  MD2_VERSION,
} from './md2Schema';
import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT, createExternalTextureRef } from './shared';

// Parses an id Software MD2 (Quake 2) binary model into a Scene. Frame 0 is the base pose of a single
// Mesh node; every subsequent frame becomes a morph target (position/normal deltas from frame 0), so
// the mesh carries a MeshMorph for its vertex-frame animation (createSceneFromMd2 folds the clip that drives it
// — see agents/morph-target-animation.md, where MD2 is the legacy validation case for the morph
// deformer). Compressed vertices are decompressed using each frame's scale and translate vectors, and
// normals are resolved from the 162-entry Anorms lookup table. UV coordinates are scaled from integer
// texture-space values to 0-1 using the header's skinWidth and skinHeight.
//
// Because MD2 triangles reference vertex and texcoord indices independently (like OBJ), the parser
// re-indexes using a dedup map keyed by "vertIdx/texIdx" to build the canonical interleaved vertex
// buffer, remembering each deduped vertex's source MD2 vertex index so the per-frame morph deltas map
// through the same re-indexing. MD2's oddities — byte-quantized frames, the normal LUT, and the Z-up→
// Y-up reflection — stay quarantined here; the emitted morph targets are plain Y-up float deltas.
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
  const numSkins = view.getInt32(20, true);
  const numVertices = view.getInt32(24, true);
  const numTexCoords = view.getInt32(28, true);
  const numTriangles = view.getInt32(32, true);
  const numFrames = view.getInt32(40, true);
  const offSkins = view.getInt32(44, true);
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

  // Validate that the buffer contains the data regions we need — including every frame (each frame is
  // its own header + compressed-vertex block, laid contiguously from offFrames).
  const frameStride = MD2_FRAME_HEADER_SIZE + numVertices * MD2_COMPRESSED_VERTEX_SIZE;
  const texCoordsEnd = offTexCoords + numTexCoords * MD2_TEXCOORD_SIZE;
  const trianglesEnd = offTriangles + numTriangles * MD2_TRIANGLE_SIZE;
  const allFramesEnd = offFrames + numFrames * frameStride;

  if (texCoordsEnd > bytes.length || trianglesEnd > bytes.length || allFramesEnd > bytes.length) {
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

  // Decompress every frame into per-vertex Y-up positions + Anorms-decoded normals. Frame 0 is the base
  // pose; the rest become morph targets. Each frame carries its own quantization scale/translate, so
  // dequantization is per-frame; the Z-up→Y-up reflection is applied here so the morph deltas below are
  // computed entirely in Flight's Y-up space.
  const frames: readonly Md2Frame[] = readMd2Frames(bytes, view, offFrames, numFrames, numVertices, frameStride);
  const base = frames[0];

  // Re-index triangles. Each MD2 triangle has 3 vertex indices and 3 texcoord indices (independent
  // indexing like OBJ). Build a dedup map keyed by "vertIdx/texIdx", remembering each deduped vertex's
  // source MD2 vertex index so the per-frame morph deltas map through the same re-indexing.
  const dedup = new Map<string, number>();
  const interleavedVertices: number[] = [];
  const sourceVertexIndices: number[] = [];
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
        const p = vertIdx * 3;
        // Position (3 floats), base-frame Y-up.
        interleavedVertices.push(base.positions[p], base.positions[p + 1], base.positions[p + 2]);
        // Normal (3 floats), base-frame Y-up.
        interleavedVertices.push(base.normals[p], base.normals[p + 1], base.normals[p + 2]);
        // Tangent (4 floats) — MD2 does not carry tangents; zero-filled.
        interleavedVertices.push(0, 0, 0, 0);
        // UV (2 floats).
        interleavedVertices.push(texS[texIdx], texT[texIdx]);

        sourceVertexIndices.push(vertIdx);
        dedup.set(key, idx);
      }
      indices.push(idx);
    }
  }

  if (indices.length === 0) {
    warnings?.push('createSceneFromMd2: no valid triangle indices produced');
    return createScene();
  }

  // MD2 has no lighting-model parameters — its material is the skin: a texture path. Decode the first
  // skin (models commonly carry exactly one) to a BlinnPhongMaterial whose diffuseMap references that
  // path; MD2's own shading is diffuse-textured. Extra skins are alternate textures for the same mesh,
  // not additional materials, so only the first is attached.
  const materials: Material[] = [];
  if (numSkins >= 1 && offSkins + MD2_SKIN_SIZE <= bytes.length) {
    const skinName = readMd2SkinName(bytes, offSkins);
    if (skinName.length > 0) {
      const material = createBlinnPhongMaterial({
        diffuseMap: createExternalTextureRef(skinName),
      }) as unknown as Material;
      // MD2's skin path is the material's authored identity — preserve it as the name.
      material.name = skinName;
      materials.push(material);
    }
  }

  const scene = createScene();
  const vertices = new Float32Array(interleavedVertices);
  const indexArray = Uint32Array.from(indices);
  const geometry = createMeshGeometry({ indices: indexArray, layout: CANONICAL_LAYOUT, vertices });
  const mesh = createMesh(geometry, materials);
  const morph = buildMd2Morph(frames, sourceVertexIndices);
  if (morph !== null) mesh.morph = morph;
  addNodeChild(scene.root, mesh as unknown as SceneNode);

  // Realize MD2's per-frame vertex animation as one weight-track clip on the generic morph substrate:
  // MD2's frames are semantically a two-frame lerp at each instant, so the clip's per-frame weight track
  // has exactly the two adjacent frames' weights non-zero (a hat function). A single-frame model has no
  // motion and leaves `animations` empty.
  const clip = buildMd2MorphClip(scene.root);
  if (clip !== null) (scene.animations as AnimationClip[]).push(clip);

  return scene;
}

// One decompressed MD2 frame in Flight's Y-up space: `positions` and `normals` are 3 floats per source
// MD2 vertex (indexed by the raw MD2 vertex index, before triangle re-indexing).
interface Md2Frame {
  normals: Float32Array;
  positions: Float32Array;
}

// Decompresses every MD2 frame into Y-up positions + Anorms-decoded normals, indexed by the raw MD2
// vertex index. Each frame carries its own byte-quantization scale/translate (position = compressed *
// scale + translate); normals are the 162-entry Anorms unit vectors. Both are reflected Z-up→Y-up
// (x, y, z) → (x, z, -y) so all downstream morph math is in Flight's space. This is where MD2's three
// quantization/LUT/handedness oddities are quarantined.
function readMd2Frames(
  bytes: Readonly<Uint8Array>,
  view: Readonly<DataView>,
  offFrames: number,
  numFrames: number,
  numVertices: number,
  frameStride: number,
): Md2Frame[] {
  const frames: Md2Frame[] = [];
  for (let f = 0; f < numFrames; f++) {
    const frameBase = offFrames + f * frameStride;
    const scaleX = view.getFloat32(frameBase, true);
    const scaleY = view.getFloat32(frameBase + 4, true);
    const scaleZ = view.getFloat32(frameBase + 8, true);
    const translateX = view.getFloat32(frameBase + 12, true);
    const translateY = view.getFloat32(frameBase + 16, true);
    const translateZ = view.getFloat32(frameBase + 20, true);

    const verticesBase = frameBase + MD2_FRAME_HEADER_SIZE;
    const positions = new Float32Array(numVertices * 3);
    const normals = new Float32Array(numVertices * 3);
    for (let i = 0; i < numVertices; i++) {
      const b = verticesBase + i * MD2_COMPRESSED_VERTEX_SIZE;
      const px = bytes[b] * scaleX + translateX;
      const py = bytes[b + 1] * scaleY + translateY;
      const pz = bytes[b + 2] * scaleZ + translateZ;
      const p = i * 3;
      // Z-up → Y-up: (x, y, z) → (x, z, -y).
      positions[p] = px;
      positions[p + 1] = pz;
      positions[p + 2] = -py;

      const ni = bytes[b + 3];
      if (ni < MD2_ANORMS.length) {
        const n = MD2_ANORMS[ni];
        normals[p] = n[0];
        normals[p + 1] = n[2];
        normals[p + 2] = -n[1];
      }
    }
    frames.push({ normals, positions });
  }
  return frames;
}

// Builds a MeshMorph whose targets are frames 1..N as position/normal deltas from frame 0 (the base),
// re-indexed to the deduped vertex order via `sourceVertexIndices`. Returns null for a single-frame
// model (no motion, so no morph). The weight array starts all-zero (the base pose); the folded clip
// drives it. tangentDeltas is always null — MD2 carries no tangents.
function buildMd2Morph(frames: readonly Md2Frame[], sourceVertexIndices: readonly number[]): MeshMorph | null {
  if (frames.length < 2) return null;
  const base = frames[0];
  const vertexCount = sourceVertexIndices.length;
  const targets: MorphTarget[] = [];
  for (let f = 1; f < frames.length; f++) {
    const frame = frames[f];
    const positionDeltas = new Float32Array(vertexCount * 3);
    const normalDeltas = new Float32Array(vertexCount * 3);
    for (let v = 0; v < vertexCount; v++) {
      const src = sourceVertexIndices[v] * 3;
      const dst = v * 3;
      positionDeltas[dst] = frame.positions[src] - base.positions[src];
      positionDeltas[dst + 1] = frame.positions[src + 1] - base.positions[src + 1];
      positionDeltas[dst + 2] = frame.positions[src + 2] - base.positions[src + 2];
      normalDeltas[dst] = frame.normals[src] - base.normals[src];
      normalDeltas[dst + 1] = frame.normals[src + 1] - base.normals[src + 1];
      normalDeltas[dst + 2] = frame.normals[src + 2] - base.normals[src + 2];
    }
    targets.push({ normalDeltas, positionDeltas, tangentDeltas: null });
  }
  return { targets, weights: new Float32Array(targets.length) };
}

// Builds the vertex-morph AnimationClip for the mesh createSceneFromMd2 produced, or null when it has no
// morph (a single-frame model, or no mesh). Frame 0 is the base pose; each morph target is frame i+1.
// The clip is a single `weights` track whose value block per keyframe is the full weight vector: at
// keyframe for frame k it sets weight[k-1] = 1 and all others 0 (frame 0 = all-zero base). Linear
// interpolation between adjacent keyframes then blends frame i → i+1 — the two-frame lerp MD2 semantics
// call for, realized as a hat function over the shared generic morph sink. Times are k / MD2_FRAME_FPS.
function buildMd2MorphClip(root: Readonly<SceneNode>): ReturnType<typeof createAnimationClip> | null {
  const mesh = findMd2Mesh(root);
  if (mesh === null || mesh.morph == null) return null;
  const targetCount = mesh.morph.targets.length;
  if (targetCount === 0) return null;

  const frameCount = targetCount + 1; // targets are frames 1..N; frame 0 is the base
  const times = new Float32Array(frameCount);
  const values = new Float32Array(frameCount * targetCount);
  for (let k = 0; k < frameCount; k++) {
    times[k] = k / MD2_FRAME_FPS;
    // Frame k activates target index k-1 (frame 0 leaves all weights zero — the base pose).
    if (k >= 1) values[k * targetCount + (k - 1)] = 1;
  }
  const track = createAnimationTrack({ components: targetCount, interpolation: 'Linear', times, values });
  const channel: AnimationChannel = createAnimationChannel(track, { node: mesh, path: SceneAnimationPathWeights });
  return createAnimationClip([channel]);
}

// The first Mesh node directly under a scene (createSceneFromMd2 parents exactly one), or null.
function findMd2Mesh(root: Readonly<SceneNode>): Mesh | null {
  const children = getNodeChildren(root);
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as unknown as SceneNode;
    if (isMesh(child)) return child as unknown as Mesh;
  }
  return null;
}

// Reads a fixed 64-byte null-padded ASCII skin path record starting at `offset`, stopping at the
// first null terminator.
function readMd2SkinName(bytes: Readonly<Uint8Array>, offset: number): string {
  const limit = offset + MD2_SKIN_SIZE;
  let end = offset;
  while (end < limit && bytes[end] !== 0) end++;
  let name = '';
  for (let i = offset; i < end; i++) name += String.fromCharCode(bytes[i]);
  return name;
}
