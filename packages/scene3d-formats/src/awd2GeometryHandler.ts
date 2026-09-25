import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createMeshGeometry,
} from '@flighthq/mesh/contract';
import type { Awd2BlockHandler, Awd2ParsedGeometry, ImportDiagnostic, SkinInfluence } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { awdDataTypeByteSize, readAwdDataValue, readAwdString, skipAwdAttrList } from './awd2Reader.ts';
import {
  AWD2_BLOCK_TRIANGLE_GEOMETRY,
  AWD2_STREAM_INDICES,
  AWD2_STREAM_JOINT_INDICES,
  AWD2_STREAM_JOINT_WEIGHTS,
  AWD2_STREAM_NORMALS,
  AWD2_STREAM_POSITIONS,
  AWD2_STREAM_TANGENTS,
  AWD2_STREAM_UVS,
} from './awd2Schema.ts';
import {
  CANONICAL_FLOATS_PER_VERTEX,
  CANONICAL_LAYOUT,
  negateVec3Z,
  packSkinInfluences,
  reverseTriangleWinding,
  reverseVertexTriangleWinding,
  SKINNED_FLOATS_PER_VERTEX,
} from './shared.ts';

// Triangle geometry: the vertex streams a mesh is drawn from. This is the one handler a build that
// renders anything at all registers, and the only one that reaches @flighthq/mesh.

export const awd2TriangleGeometryHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_TRIANGLE_GEOMETRY],
  parse(state, block) {
    state.geometries.set(
      block.blockId,
      parseTriangleGeometryBlock(
        block.view,
        block.source,
        block.dataStart,
        block.dataEnd,
        block.geometryWide,
        state.diagnostics,
      ),
    );
  },
};

// Parses a TriangleGeometry block (type 1). Layout:
// name(VarString) → numSubMeshes(uint16) → NumAttrList → per sub-mesh:
//   totalByteLen(uint32) → NumAttrList → streams → UserAttrList
function parseTriangleGeometryBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  geometryWide: boolean,
  diagnostics?: ImportDiagnostic[],
): Awd2ParsedGeometry[] {
  const dv = view as DataView;
  let offset = start;

  // Guard the name in two steps: the 2-byte VarString length prefix, then its declared payload — otherwise a
  // truncated name payload slips past readAwdString (which does not bound-check) and mislabels the next
  // guard's field as 'num-submeshes' when the missing bytes actually belong to the name.
  if (offset + 2 > end || offset + 2 + dv.getUint16(offset, true) > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.geometry-truncated',
      'parseTriangleGeometryBlock',
      {
        field: 'name',
      },
    );
    return [];
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.geometry-truncated',
      'parseTriangleGeometryBlock',
      {
        field: 'num-submeshes',
      },
    );
    return [];
  }
  const numSubMeshes = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const geometries: Awd2ParsedGeometry[] = [];

  for (let s = 0; s < numSubMeshes; s++) {
    if (offset + 4 > end) {
      // The sub-mesh header is truncated: this and every remaining sub-mesh of the block are omitted.
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.submesh-truncated',
        'parseTriangleGeometryBlock',
        {
          firstSubMesh: s,
        },
      );
      break;
    }
    const subMeshByteLen = dv.getUint32(offset, true);
    const subMeshEnd = offset + 4 + subMeshByteLen;
    offset += 4;

    // NumAttrList for sub-mesh properties.
    offset = skipAwdAttrList(view, offset, end);

    let positions: number[] | null = null;
    let indices: number[] | null = null;
    let uvs: number[] | null = null;
    let normals: number[] | null = null;
    let tangents: number[] | null = null;
    let jointIndices: number[] | null = null;
    let jointWeights: number[] | null = null;

    // Read streams until we reach the sub-mesh byte boundary (leaving room for UserAttrList).
    while (offset + 6 <= subMeshEnd) {
      const streamType = dv.getUint8(offset);
      offset += 1;
      const dataType = dv.getUint8(offset);
      offset += 1;
      const streamByteLength = dv.getUint32(offset, true);
      offset += 4;

      if (offset + streamByteLength > end) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'awd2.stream-data-past-end',
          'parseTriangleGeometryBlock',
        );
        break;
      }

      // AWD stores per-vertex joint indices as uint16 (Away3D reads them with readUnsignedShort),
      // regardless of the stream's declared data type — exporters write float32 in that field but
      // pack the payload as tight uint16 indices. Read them as uint16 by byte length; the paired
      // weight stream is genuine float32 and goes through the generic reader below.
      if (streamType === AWD2_STREAM_JOINT_INDICES) {
        const jointCount = Math.floor(streamByteLength / 2);
        const values: number[] = [];
        for (let i = 0; i < jointCount; i++) values.push(dv.getUint16(offset + i * 2, true));
        jointIndices = values;
        offset += streamByteLength;
        continue;
      }

      const elementSize = awdDataTypeByteSize(dataType);
      const count = Math.floor(streamByteLength / elementSize);

      const values: number[] = [];
      for (let i = 0; i < count; i++) {
        values.push(readAwdDataValue(view, offset + i * elementSize, dataType));
      }
      offset += streamByteLength;

      switch (streamType) {
        case AWD2_STREAM_POSITIONS:
          positions = values;
          break;
        case AWD2_STREAM_INDICES:
          indices = values;
          break;
        case AWD2_STREAM_UVS:
          uvs = values;
          break;
        case AWD2_STREAM_NORMALS:
          normals = values;
          break;
        case AWD2_STREAM_TANGENTS:
          tangents = values;
          break;
        case AWD2_STREAM_JOINT_WEIGHTS:
          jointWeights = values;
          break;
        default:
          break;
      }
    }

    // UserAttrList for sub-mesh.
    offset = skipAwdAttrList(view, offset, end);

    if (positions === null || positions.length < 3) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.submesh-no-positions',
        'parseTriangleGeometryBlock',
      );
      continue;
    }

    // Convert from AWD's left-handed Y-up to Flight's right-handed Y-up. Joint indices/weights are
    // index/scalar data — unaffected by the handedness flip, which the skeleton transforms mirror.
    negateVec3Z(positions);
    if (normals !== null) negateVec3Z(normals);
    if (tangents !== null) negateVec3Z(tangents);
    // The reflection above flips triangle winding whether or not the sub-mesh shipped indices. Indexed
    // geometry is corrected here; a non-indexed sub-mesh is corrected on the assembled vertex records
    // below, once they exist. Correcting only the indexed case left non-indexed geometry inside out.
    if (indices !== null) reverseTriangleWinding(indices);

    const vertexCount = positions.length / 3;

    // A sub-mesh is skinned when it carries both influence streams; it then emits the skinned layout
    // (joints0/weights0 past uv0) and feeds the shared packSkinInfluences path. AWD lists an arbitrary
    // number of influences per vertex (shambler uses 8); the top four by weight are kept, renormalized.
    let jointsPerVertex = 0;
    if (jointIndices !== null && jointWeights !== null && vertexCount > 0) {
      jointsPerVertex = Math.floor(jointWeights.length / vertexCount);
      if (jointsPerVertex < 1 || jointIndices.length < vertexCount * jointsPerVertex) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'awd2.skin-streams-mismatch',
          'parseTriangleGeometryBlock',
        );
        jointsPerVertex = 0;
      }
    }
    const skinned = jointsPerVertex > 0;

    const floatsPerVertex = skinned ? SKINNED_FLOATS_PER_VERTEX : CANONICAL_FLOATS_PER_VERTEX;
    const vertices = new Float32Array(vertexCount * floatsPerVertex);
    const jointScratch = [0, 0, 0, 0];
    const weightScratch = [0, 0, 0, 0];

    for (let v = 0; v < vertexCount; v++) {
      const o = v * floatsPerVertex;
      vertices[o] = positions[v * 3];
      vertices[o + 1] = positions[v * 3 + 1];
      vertices[o + 2] = positions[v * 3 + 2];

      if (normals !== null && v * 3 + 2 < normals.length) {
        vertices[o + 3] = normals[v * 3];
        vertices[o + 4] = normals[v * 3 + 1];
        vertices[o + 5] = normals[v * 3 + 2];
      }

      if (tangents !== null && v * 3 + 2 < tangents.length) {
        vertices[o + 6] = tangents[v * 3];
        vertices[o + 7] = tangents[v * 3 + 1];
        vertices[o + 8] = tangents[v * 3 + 2];
        // Tangent W is the bitangent handedness the shader reconstructs the bitangent with (B = W·N×T).
        // AWD's tangent stream is xyz only, so W must be synthesized: Away3D derives the bitangent as
        // N×T in its LEFT-handed space (one handedness for the whole mesh), and the left→right-handed
        // conversion above (negateVec3Z on N and T is a det=-1 reflection) flips that handedness. So the
        // correct sign in Flight's right-handed space is AWD2_TANGENT_HANDEDNESS. Left 0 (no bitangent) for
        // a vertex the tangent stream does not cover.
        vertices[o + 9] = AWD2_TANGENT_HANDEDNESS;
      }

      if (uvs !== null && v * 2 + 1 < uvs.length) {
        vertices[o + 10] = uvs[v * 2];
        vertices[o + 11] = uvs[v * 2 + 1];
      }

      if (skinned) {
        const influences: SkinInfluence[] = [];
        for (let k = 0; k < jointsPerVertex; k++) {
          const weight = jointWeights![v * jointsPerVertex + k];
          if (weight > 0)
            influences.push({
              jointIndex: jointIndices![v * jointsPerVertex + k],
              weight,
            });
        }
        packSkinInfluences(influences, jointScratch, weightScratch);
        vertices[o + 12] = jointScratch[0];
        vertices[o + 13] = jointScratch[1];
        vertices[o + 14] = jointScratch[2];
        vertices[o + 15] = jointScratch[3];
        vertices[o + 16] = weightScratch[0];
        vertices[o + 17] = weightScratch[1];
        vertices[o + 18] = weightScratch[2];
        vertices[o + 19] = weightScratch[3];
      }
    }

    if (indices === null) reverseVertexTriangleWinding(vertices, floatsPerVertex);

    const indexArray = indices !== null ? Uint32Array.from(indices) : undefined;
    const geometry = createMeshGeometry({
      indices: indexArray,
      layout: skinned ? CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT : CANONICAL_LAYOUT,
      vertices,
    });
    // Regenerate normals only when the sub-mesh carried none, matching the shared emitter; authored
    // AWD normals (present on skinned models like the shambler) are kept. Not gated on indices:
    // computeMeshGeometryNormals walks a non-indexed stream as sequential triangles, so gating it left
    // non-indexed sub-meshes with the zero normals every lit material then normalizes to nothing.
    if (normals === null) computeMeshGeometryNormals(geometry, geometry);
    // Away3D commonly ships meshes with UVs but NO tangent stream and derives tangents at load time. With
    // no stream the tangent frame above is left zero, so a normal-mapped material renders black (its
    // sampled normal has no basis to transform through). Synthesize a tangent basis (xyz + handedness W)
    // from positions/normals/UVs — the -1 W this yields for real AWD geometry is render-confirmed correct.
    // Only when the stream is absent and there are UVs; an authored tangent stream is kept untouched.
    // The per-triangle UV gradient this needs comes from the shared triangle walker, which reads a
    // non-indexed stream as sequential triangles, so indices are not a precondition.
    if (tangents === null && uvs !== null) {
      computeMeshGeometryTangents(geometry, geometry);
    }
    geometries.push({ geometry, skinned });
  }

  return geometries;
}

// Bitangent handedness written into every AWD tangent's W (B = W·normal×tangent). AWD carries no W and
// Away3D uses a single mesh-wide handedness (bitangent = normal×tangent in its left-handed space); the
// left→right-handed conversion (negateVec3Z, det = -1) inverts it, making -1 the correct Flight-space
// sign. Kept as one named constant so a render proof against a normal-mapped fixture (shambler) can flip
// it in one place if Away3D's convention proves to be the opposite chirality.
const AWD2_TANGENT_HANDEDNESS = -1;
