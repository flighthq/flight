import { createAnimationTrack } from '@flighthq/animation/contract';
import { createTransform3D } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createBlinnPhongMaterial } from '@flighthq/materials/contract';
import { createMeshGeometry } from '@flighthq/mesh/contract';
import { createScene3DFromDocument } from '@flighthq/scene3d/contract';
import type { Scene3D } from '@flighthq/types/contract';
import type {
  ImportDiagnostic,
  Material,
  MaterialLike,
  MeshMorph,
  MorphTarget,
  Scene3DDocument,
  Scene3DDocumentAnimation,
  Scene3DDocumentMesh,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MeshKind, Scene3DAnimationPathWeights } from '@flighthq/types/contract';

import {
  MD2_ANORMS,
  MD2_COMPRESSED_VERTEX_SIZE,
  MD2_FRAME_HEADER_SIZE,
  MD2_FRAME_FPS,
  MD2_FRAME_NAME_SIZE,
  MD2_HEADER_SIZE,
  MD2_MAGIC,
  MD2_SKIN_SIZE,
  MD2_TEXCOORD_SIZE,
  MD2_TRIANGLE_SIZE,
  MD2_VERSION,
} from './md2Schema';
import {
  CANONICAL_FLOATS_PER_VERTEX,
  CANONICAL_LAYOUT,
  createExternalTextureRef,
  reverseTriangleWinding,
} from './shared';

// Parses an id Software MD2 (Quake 2) binary model into a Scene3D. Frame 0 is the base pose of a single
// Mesh node; every subsequent frame becomes a morph target (position/normal deltas from frame 0), so
// the mesh carries a MeshMorph for its vertex-frame animation (createScene3DFromMd2 folds the clip that drives it
// — see agents/morph-target-animation.md, where MD2 is the legacy validation case for the morph
// deformer). Compressed vertices are decompressed using each frame's scale and translate vectors, and
// normals are resolved from the 162-entry Anorms lookup table. UV coordinates are scaled from integer
// texture-space values to 0-1 using the header's skinWidth and skinHeight.
//
// Because MD2 triangles reference vertex and texcoord indices independently (like OBJ), the parser
// re-indexes using a dedup map keyed by "vertIdx/texIdx" to build the canonical interleaved vertex
// buffer, remembering each deduped vertex's source MD2 vertex index so the per-frame morph deltas map
// through the same re-indexing. MD2's oddities — byte-quantized frames, the normal LUT, the Z-up→Y-up
// rotation, and the clockwise-front winding it preserves — stay quarantined here; the emitted morph
// targets are plain Y-up float deltas.
//
// Malformed input records an ImportDiagnostic (into an engaged collector) and returns an empty Scene3D rather than throwing. Convenience over
// `createScene3DFromDocument(parseMd2(bytes))`.
export function createScene3DFromMd2(bytes: Readonly<Uint8Array>, diagnostics?: ImportDiagnostic[]): Scene3D {
  return createScene3DFromDocument(parseMd2(bytes, diagnostics));
}

// Parses an id Software MD2 (Quake 2) binary model into a format-neutral Scene3DDocument: one Mesh node
// whose base pose is frame 0 and whose per-frame vertex animation is carried as a MeshMorph (each later
// frame a position/normal delta target), plus one weights animation driving that morph. Assemble into a
// live Scene3D with `createScene3DFromDocument`. Malformed input returns an empty document, recording an ImportDiagnostic when a collector is engaged.
export function parseMd2(bytes: Readonly<Uint8Array>, diagnostics?: ImportDiagnostic[]): Scene3DDocument {
  if (bytes.length < MD2_HEADER_SIZE) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md2.header-too-short', 'parseMd2', {
      byteLength: bytes.length,
    });
    return emptyMd2Document();
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const magic = view.getInt32(0, true);
  if (magic !== MD2_MAGIC) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md2.bad-magic', 'parseMd2', {
      magic: (magic >>> 0).toString(16),
    });
    return emptyMd2Document();
  }

  const version = view.getInt32(4, true);
  if (version !== MD2_VERSION) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md2.unsupported-version', 'parseMd2', {
      version,
    });
    return emptyMd2Document();
  }

  const skinWidth = view.getInt32(8, true);
  const skinHeight = view.getInt32(12, true);
  // The two header fields the parser previously never read, and the reason to read them: the frame
  // stride and the file extent are each declared TWICE. `frameSize` states the stride the writer used;
  // `offEnd` states the file's own total size. Recomputing the stride from `numVertices` and bounding it
  // against a limit derived from that same `numVertices` is tautological — if the count is wrong the bound
  // is wrong by exactly the amount needed to keep passing. An independent anchor is the only thing that
  // can catch it.
  const declaredFrameSize = view.getInt32(16, true);
  const numSkins = view.getInt32(20, true);
  const numVertices = view.getInt32(24, true);
  const numTexCoords = view.getInt32(28, true);
  const numTriangles = view.getInt32(32, true);
  const numFrames = view.getInt32(40, true);
  const offSkins = view.getInt32(44, true);
  const offTexCoords = view.getInt32(48, true);
  const offTriangles = view.getInt32(52, true);
  const offFrames = view.getInt32(56, true);
  const declaredEnd = view.getInt32(64, true);

  if (numFrames < 1) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md2.no-frames', 'parseMd2');
    return emptyMd2Document();
  }

  if (numTriangles < 1) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md2.no-triangles', 'parseMd2');
    return emptyMd2Document();
  }

  // Validate that the buffer contains the data regions we need — including every frame (each frame is
  // its own header + compressed-vertex block, laid contiguously from offFrames).
  // Counts and offsets are signed int32 straight out of the file. A negative count sizes a typed array
  // and throws; a negative offset is worse, because it passes every upper-bound test — the read simply
  // starts before the region and imports whatever precedes it, or, through raw byte indexing, reads
  // `undefined` and fabricates data from it.
  if (
    numVertices < 0 ||
    numTexCoords < 0 ||
    numSkins < 0 ||
    offSkins < 0 ||
    offTexCoords < 0 ||
    offTriangles < 0 ||
    offFrames < 0
  ) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md2.negative-header-field', 'parseMd2', {
      byteLength: bytes.length,
    });
    return emptyMd2Document();
  }

  const frameStride = MD2_FRAME_HEADER_SIZE + numVertices * MD2_COMPRESSED_VERTEX_SIZE;
  // The independent check (axis 9): the writer's own stride, compared against the one derived from
  // numVertices. They disagree when numVertices is wrong or the writer padded frames, and either way
  // every frame after the first is then read from a drifting offset — decoding a neighbouring frame's
  // bytes as scale/translate floats, which are finite, plausible, and completely wrong.
  if (declaredFrameSize > 0 && declaredFrameSize !== frameStride) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md2.frame-size-mismatch', 'parseMd2', {
      actual: frameStride,
      expected: declaredFrameSize,
    });
    return emptyMd2Document();
  }

  const skinsEnd = offSkins + numSkins * MD2_SKIN_SIZE;
  const texCoordsEnd = offTexCoords + numTexCoords * MD2_TEXCOORD_SIZE;
  const trianglesEnd = offTriangles + numTriangles * MD2_TRIANGLE_SIZE;
  const allFramesEnd = offFrames + numFrames * frameStride;

  // Skins stay OUT of this fatal check on purpose: a skin is an optional texture name, so a truncated skin
  // table degrades the material and leaves the geometry intact — it keeps its per-record Drop. What
  // `offSkins` lacked was the LOWER bound, and that is what let it fabricate a 64-byte name out of
  // out-of-buffer reads instead of faulting; the negative-field rejection above closes that, without
  // escalating an optional section's truncation into a dead file.
  if (texCoordsEnd > bytes.length || trianglesEnd > bytes.length || allFramesEnd > bytes.length) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md2.truncated-data-region', 'parseMd2', {
      byteLength: bytes.length,
    });
    return emptyMd2Document();
  }

  // The second independent anchor: the file's own declared size. A disagreement means the header and the
  // bytes describe different files, and nothing else in the header can reveal that.
  if (declaredEnd > 0 && declaredEnd !== bytes.length) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'md2.file-size-mismatch', 'parseMd2', {
      actual: bytes.length,
      expected: declaredEnd,
    });
  }

  // MD2's sections are SIBLINGS that tile the file, not a nest, so no containment check at any depth can
  // see two of them claiming the same bytes (axis 10). Overlap decodes one kind of record as another and
  // yields a complete, finite, plausible mesh — the worst possible failure shape.
  reportMd2SectionOverlap(diagnostics, [
    { end: skinsEnd, name: 0, start: offSkins },
    { end: texCoordsEnd, name: 1, start: offTexCoords },
    { end: trianglesEnd, name: 2, start: offTriangles },
    { end: allFramesEnd, name: 3, start: offFrames },
  ]);

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
  // dequantization is per-frame; the Z-up→Y-up rotation is applied here so the morph deltas below are
  // computed entirely in Flight's Y-up space.
  const frames: readonly Md2Frame[] = readMd2Frames(
    bytes,
    view,
    offFrames,
    numFrames,
    numVertices,
    frameStride,
    diagnostics,
  );
  const base = frames[0];

  // Re-index triangles. Each MD2 triangle has 3 vertex indices and 3 texcoord indices (independent
  // indexing like OBJ). Build a dedup map keyed by "vertIdx/texIdx", remembering each deduped vertex's
  // source MD2 vertex index so the per-frame morph deltas map through the same re-indexing.
  const dedup = new Map<string, number>();
  const interleavedVertices: number[] = [];
  const sourceVertexIndices: number[] = [];
  const indices: number[] = [];

  // Out-of-range triangle indices are aggregated and reported once after the loop rather than per corner
  // — the perf contract keeps the hot per-corner loop free of per-element seam calls (a well-formed model
  // reaches neither counter).
  let outOfRangeVertexCorners = 0;
  let outOfRangeTexCoordCorners = 0;
  for (let t = 0; t < numTriangles; t++) {
    const triBase = offTriangles + t * MD2_TRIANGLE_SIZE;
    for (let c = 0; c < 3; c++) {
      const vertIdx = view.getUint16(triBase + c * 2, true);
      const texIdx = view.getUint16(triBase + 6 + c * 2, true);

      if (vertIdx >= numVertices) {
        outOfRangeVertexCorners++;
        continue;
      }
      if (texIdx >= numTexCoords) {
        outOfRangeTexCoordCorners++;
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

  if (outOfRangeVertexCorners > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'md2.triangle-vertex-index-out-of-range',
      'parseMd2',
      {
        corners: outOfRangeVertexCorners,
      },
    );
  }
  if (outOfRangeTexCoordCorners > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'md2.triangle-texcoord-index-out-of-range',
      'parseMd2',
      {
        corners: outOfRangeTexCoordCorners,
      },
    );
  }

  if (indices.length === 0) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'md2.no-valid-triangles', 'parseMd2');
    return emptyMd2Document();
  }

  // MD2 has no lighting-model parameters — each skin is a texture path, and a model's several skins are
  // alternate diffuse textures for the same mesh (one active at a time). Emit every skin as a
  // BlinnPhongMaterial in the document's materials table so a caller can swap alternates in, and bind the
  // first to the mesh's single subset. MD2's own shading is diffuse-textured.
  const document = emptyMd2Document();
  const meshMaterials: number[] = [];
  // Empty (all-null path) skin records are counted in numSkins but yield no material; tally them and flush
  // one crumb after the loop rather than reporting per skin (aggregate-once).
  let emptySkinCount = 0;
  let firstEmptySkin = -1;
  for (let s = 0; s < numSkins; s++) {
    const skinOffset = offSkins + s * MD2_SKIN_SIZE;
    if (skinOffset + MD2_SKIN_SIZE > bytes.length) {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'md2.skin-record-truncated', 'parseMd2', {
        skin: s,
      });
      break;
    }
    const skinName = readMd2SkinName(bytes, skinOffset);
    if (skinName.length === 0) {
      if (emptySkinCount === 0) firstEmptySkin = s;
      emptySkinCount++;
      continue;
    }
    const material = createBlinnPhongMaterial({
      diffuseMap: createExternalTextureRef(skinName, null, document.resources),
    }) as unknown as Material;
    // MD2's skin path is the material's authored identity — preserve it as the name.
    material.name = skinName;
    const index = document.materials.length;
    document.materials.push(material as unknown as MaterialLike);
    // Bind the first non-empty skin to the mesh; the rest stay available as alternates.
    if (meshMaterials.length === 0) meshMaterials.push(index);
  }
  if (emptySkinCount > 0) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'md2.skin-empty-path', 'parseMd2', {
      count: emptySkinCount,
      firstSkin: firstEmptySkin,
    });
  }

  // Quake II winds MD2 triangles clockwise (front-facing under its own convention); the Z-up→Y-up
  // position conversion is a determinant-+1 rotation, so it PRESERVES that winding and leaves the
  // triangles clockwise in Flight's counter-clockwise-front space. Reverse them here so front faces stay
  // front under backface culling, and so any normal derived by crossing (v1−v0)×(v2−v0) points outward
  // rather than into the model. Mirrors the MD5 and AWD importers.
  reverseTriangleWinding(indices);

  const vertices = new Float32Array(interleavedVertices);
  const indexArray = Uint32Array.from(indices);
  const geometry = createMeshGeometry({ indices: indexArray, layout: CANONICAL_LAYOUT, vertices });
  const morph = buildMd2Morph(frames, sourceVertexIndices);
  const documentMesh: Scene3DDocumentMesh = { geometry, materials: meshMaterials };
  if (morph !== null) documentMesh.morph = morph;
  document.meshes.push(documentMesh);
  document.nodes.push({ children: [], kind: MeshKind, mesh: 0, transform: createTransform3D() });
  document.scenes[0].rootNodes.push(0);

  // Realize MD2's per-frame vertex animation as weight-track channels on the generic morph substrate.
  // MD2 encodes named sub-animations by frame-name prefix ("stand01".."run06".."attack01"..), so the
  // frames are segmented into one named clip per contiguous same-prefix run rather than a single clip.
  // Within a clip, adjacent-frame weights form the two-frame lerp (a hat function) MD2 semantics call
  // for. A single-frame model has no motion and leaves `animations` empty. Channels bind mesh node 0.
  document.animations.push(...buildMd2MorphAnimations(frames, morph));

  return document;
}

// One decompressed MD2 frame in Flight's Y-up space: `positions` and `normals` are 3 floats per source
// MD2 vertex (indexed by the raw MD2 vertex index, before triangle re-indexing). `name` is the frame's
// 16-byte label, which encodes its sub-animation by an action prefix + a trailing frame number
// ("stand01".."stand40"); contiguous same-prefix runs are segmented into named clips.
interface Md2Frame {
  name: string;
  normals: Float32Array;
  positions: Float32Array;
}

// Decompresses every MD2 frame into Y-up positions + Anorms-decoded normals, indexed by the raw MD2
// vertex index. Each frame carries its own byte-quantization scale/translate (position = compressed *
// scale + translate); normals are the 162-entry Anorms unit vectors. Both are ROTATED Z-up→Y-up
// (x, y, z) → (x, z, -y) — determinant +1, a 90° turn about X, NOT a reflection — so all downstream morph
// math is in Flight's space. The distinction is load-bearing and was previously stated wrongly here: a
// reflection would flip triangle winding and make a reversal unnecessary, and a reader who believed that
// would conclude no reversal was needed. A rotation preserves winding, which is why createScene3DFromMd2
// calls reverseTriangleWinding. This is where MD2's three quantization/LUT/handedness oddities are
// quarantined.
function readMd2Frames(
  bytes: Readonly<Uint8Array>,
  view: Readonly<DataView>,
  offFrames: number,
  numFrames: number,
  numVertices: number,
  frameStride: number,
  diagnostics?: ImportDiagnostic[],
): Md2Frame[] {
  const frames: Md2Frame[] = [];
  // uint8 normal indices can exceed the 162-entry table in malformed files; collect the distinct
  // offenders and report once rather than per-vertex. Only allocated when a collector is engaged.
  const outOfRangeNormals = diagnostics ? new Set<number>() : null;
  for (let f = 0; f < numFrames; f++) {
    const frameBase = offFrames + f * frameStride;
    const scaleX = view.getFloat32(frameBase, true);
    const scaleY = view.getFloat32(frameBase + 4, true);
    const scaleZ = view.getFloat32(frameBase + 8, true);
    const translateX = view.getFloat32(frameBase + 12, true);
    const translateY = view.getFloat32(frameBase + 16, true);
    const translateZ = view.getFloat32(frameBase + 20, true);
    // The frame name (its sub-animation label) is the 16-byte field after the scale+translate vectors.
    const name = readMd2FrameName(bytes, frameBase + 24);

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
      } else if (outOfRangeNormals !== null) {
        outOfRangeNormals.add(ni);
      }
    }
    frames.push({ name, normals, positions });
  }
  if (outOfRangeNormals !== null && outOfRangeNormals.size > 0) {
    // Recover, not Drop: the geometry survives with those normals left zero.
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'md2.normal-index-out-of-range',
      'readMd2Frames',
      {
        distinctIndices: outOfRangeNormals.size,
        firstIndex: Math.min(...outOfRangeNormals),
      },
    );
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

// Segments MD2's frames into named vertex-morph clips, one per contiguous run of same-action frames.
// MD2 stores each sub-animation as a run of frames whose names share an action prefix and end in a
// frame number ("stand01".."stand40"); `md2FrameActionName` recovers that prefix, and contiguous
// same-prefix frames become one `Scene3DDocumentAnimation`. Returns an empty array for a model with no
// morph (single frame). A model whose frames carry no names collapses to one clip named 'default',
// identical to MD2's implicit single animation. Each clip binds mesh node 0.
function buildMd2MorphAnimations(frames: readonly Md2Frame[], morph: MeshMorph | null): Scene3DDocumentAnimation[] {
  if (morph === null) return [];
  const targetCount = morph.targets.length;
  if (targetCount === 0) return [];

  const animations: Scene3DDocumentAnimation[] = [];
  const usedNames = new Set<string>();
  let runStart = 0;
  for (let k = 1; k <= frames.length; k++) {
    const runAction = md2FrameActionName(frames[runStart].name);
    // Close the run at the buffer end or when the next frame's action prefix differs.
    if (k < frames.length && md2FrameActionName(frames[k].name) === runAction) continue;
    animations.push(buildMd2ActionClip(runAction, runStart, k - 1, targetCount, usedNames));
    runStart = k;
  }
  return animations;
}

// Builds one named clip for the contiguous frame run [startFrame..endFrame] (absolute frame indices).
// Frame 0 is the morph base pose (all weights zero); frame k≥1 is morph target k-1. The clip's weight
// track has one keyframe per frame at clip-local time (i / MD2_FRAME_FPS), each keyframe's full-width
// value vector activating only that frame's target — linear interpolation between adjacent keyframes
// then blends frame → frame+1, the two-frame lerp MD2 semantics call for. The track width stays the
// mesh's full morph-target count because a `weights` channel drives the whole weight array.
function buildMd2ActionClip(
  action: string,
  startFrame: number,
  endFrame: number,
  targetCount: number,
  usedNames: Set<string>,
): Scene3DDocumentAnimation {
  const count = endFrame - startFrame + 1;
  const times = new Float32Array(count);
  const values = new Float32Array(count * targetCount);
  for (let i = 0; i < count; i++) {
    const frame = startFrame + i;
    times[i] = i / MD2_FRAME_FPS;
    if (frame >= 1) values[i * targetCount + (frame - 1)] = 1;
  }
  const track = createAnimationTrack({ components: targetCount, interpolation: 'Linear', times, values });
  return {
    channels: [{ node: 0, path: Scene3DAnimationPathWeights, track }],
    duration: times[count - 1],
    name: uniqueMd2ClipName(action, usedNames),
  };
}

// Recovers the sub-animation action name from a frame name by stripping the trailing frame-number run
// ("stand01" → "stand", "run1" → "run"). Returns '' for a name that is empty or purely numeric, which
// callers map to the 'default' clip. This is the frame-name convention id Software's MD2 exporters use
// to pack multiple actions into one contiguous frame list.
function md2FrameActionName(frameName: string): string {
  return frameName.trim().replace(/\d+$/, '');
}

// Produces a clip name unique within this document. An empty action prefix becomes 'default'; a name
// already taken (two non-adjacent runs of the same action) gets a numeric suffix so name-keyed scene
// animation maps never collide.
function uniqueMd2ClipName(action: string, usedNames: Set<string>): string {
  const base = action.length > 0 ? action : 'default';
  let name = base;
  for (let n = 2; usedNames.has(name); n++) name = `${base}.${n}`;
  usedNames.add(name);
  return name;
}

// The empty Scene3DDocument returned when MD2 parsing fails or before assembly begins — every table present.
function emptyMd2Document(): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [{ rootNodes: [] }],
    skins: [],
  };
}

// Reads the fixed 16-byte null-padded ASCII frame-name field starting at `offset`, stopping at the
// first null terminator. The name encodes the frame's sub-animation (an action prefix + frame number).
function readMd2FrameName(bytes: Readonly<Uint8Array>, offset: number): string {
  const limit = offset + MD2_FRAME_NAME_SIZE;
  let end = offset;
  while (end < limit && bytes[end] !== 0) end++;
  let name = '';
  for (let i = offset; i < end; i++) name += String.fromCharCode(bytes[i]);
  return name;
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

// Reports any two declared sections that claim the same bytes. Sections with no records are skipped —
// an empty section legitimately shares an offset with whatever follows it.
function reportMd2SectionOverlap(
  diagnostics: ImportDiagnostic[] | undefined,
  sections: readonly { end: number; name: number; start: number }[],
): void {
  for (let i = 0; i < sections.length; i++) {
    const first = sections[i];
    if (first.end <= first.start) continue;
    for (let j = i + 1; j < sections.length; j++) {
      const second = sections[j];
      if (second.end <= second.start) continue;
      if (first.start < second.end && second.start < first.end) {
        reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'md2.section-overlap', 'parseMd2', {
          first: first.name,
          second: second.name,
        });
        return;
      }
    }
  }
}
