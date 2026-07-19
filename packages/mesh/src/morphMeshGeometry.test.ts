import type { MeshMorph, VertexAttributeLayout } from '@flighthq/types';

import { createMeshGeometry } from './meshGeometry';
import { blendMeshGeometryMorph, captureMeshMorphBindPose } from './morphMeshGeometry';

// A canonical PBR record (position + normal + tangent(w) + uv0), stride 48 bytes.
const CANONICAL_LAYOUT: VertexAttributeLayout = {
  attributes: [
    { byteOffset: 0, format: 'float32x3', semantic: 'position' },
    { byteOffset: 12, format: 'float32x3', semantic: 'normal' },
    { byteOffset: 24, format: 'float32x4', semantic: 'tangent' },
    { byteOffset: 40, format: 'float32x2', semantic: 'uv0' },
  ],
  stride: 48,
};

// A minimal position-only record, stride 12 bytes — exercises the null normal/tangent path.
const POSITION_LAYOUT: VertexAttributeLayout = {
  attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
  stride: 12,
};

function positionOnlyGeometry(positions: readonly number[]) {
  return createMeshGeometry({ layout: POSITION_LAYOUT, vertices: new Float32Array(positions) });
}

describe('morphMeshGeometry', () => {
  describe('blendMeshGeometryMorph', () => {
    it('applies base + Σ wᵢ·targetᵢ to positions', () => {
      const geometry = positionOnlyGeometry([0, 0, 0, 1, 0, 0]);
      const bindPose = captureMeshMorphBindPose(geometry);
      const morph: MeshMorph = {
        targets: [
          { normalDeltas: null, positionDeltas: new Float32Array([0, 1, 0, 0, 2, 0]), tangentDeltas: null },
          { normalDeltas: null, positionDeltas: new Float32Array([0, 0, 3, 0, 0, 4]), tangentDeltas: null },
        ],
        weights: new Float32Array([0.5, 2]),
      };

      blendMeshGeometryMorph(geometry, morph, bindPose);

      // vertex 0: (0,0,0) + 0.5*(0,1,0) + 2*(0,0,3) = (0, 0.5, 6)
      // vertex 1: (1,0,0) + 0.5*(0,2,0) + 2*(0,0,4) = (1, 1, 8)
      expect(Array.from(geometry.vertices)).toEqual([0, 0.5, 6, 1, 1, 8]);
    });

    it('bumps geometry.version so backends re-upload', () => {
      const geometry = positionOnlyGeometry([0, 0, 0]);
      const bindPose = captureMeshMorphBindPose(geometry);
      const before = geometry.version;
      blendMeshGeometryMorph(
        geometry,
        {
          targets: [{ normalDeltas: null, positionDeltas: new Float32Array([1, 1, 1]), tangentDeltas: null }],
          weights: new Float32Array([1]),
        },
        bindPose,
      );
      expect(geometry.version).toBe(before + 1);
    });

    it('leaves the base pose when all weights are zero', () => {
      const geometry = positionOnlyGeometry([2, 3, 4]);
      const bindPose = captureMeshMorphBindPose(geometry);
      blendMeshGeometryMorph(
        geometry,
        {
          targets: [{ normalDeltas: null, positionDeltas: new Float32Array([9, 9, 9]), tangentDeltas: null }],
          weights: new Float32Array([0]),
        },
        bindPose,
      );
      expect(Array.from(geometry.vertices)).toEqual([2, 3, 4]);
    });

    it('is idempotent across frames — reblends from the base, not the last result', () => {
      const geometry = positionOnlyGeometry([0, 0, 0]);
      const bindPose = captureMeshMorphBindPose(geometry);
      const morph: MeshMorph = {
        targets: [{ normalDeltas: null, positionDeltas: new Float32Array([1, 0, 0]), tangentDeltas: null }],
        weights: new Float32Array([1]),
      };
      blendMeshGeometryMorph(geometry, morph, bindPose);
      blendMeshGeometryMorph(geometry, morph, bindPose);
      expect(Array.from(geometry.vertices)).toEqual([1, 0, 0]);
    });

    it('morphs normals and tangent xyz but leaves tangent w and uv0 intact', () => {
      // One vertex: position (0,0,0), normal (0,0,1), tangent (1,0,0, w=1), uv0 (0.25,0.75).
      const geometry = createMeshGeometry({
        layout: CANONICAL_LAYOUT,
        vertices: new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0.25, 0.75]),
      });
      const bindPose = captureMeshMorphBindPose(geometry);
      blendMeshGeometryMorph(
        geometry,
        {
          targets: [
            {
              normalDeltas: new Float32Array([0, 1, 0]),
              positionDeltas: new Float32Array([5, 0, 0]),
              tangentDeltas: new Float32Array([0, 0, 2]),
            },
          ],
          weights: new Float32Array([1]),
        },
        bindPose,
      );

      const v = Array.from(geometry.vertices);
      expect(v.slice(0, 3)).toEqual([5, 0, 0]); // position
      expect(v.slice(3, 6)).toEqual([0, 1, 1]); // normal
      expect(v.slice(6, 10)).toEqual([1, 0, 2, 1]); // tangent xyz morphed, w=1 intact
      expect(v.slice(10, 12)).toEqual([0.25, 0.75]); // uv0 intact
    });
  });

  describe('captureMeshMorphBindPose', () => {
    it('captures the base position pose and allocates blend scratch', () => {
      const geometry = positionOnlyGeometry([1, 2, 3, 4, 5, 6]);
      const bindPose = captureMeshMorphBindPose(geometry);
      expect(Array.from(bindPose.positions)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(bindPose.blendedPositions.length).toBe(6);
      expect(bindPose.normals).toBeNull();
      expect(bindPose.tangents).toBeNull();
      expect(bindPose.blendedNormals).toBeNull();
      expect(bindPose.blendedTangents).toBeNull();
    });

    it('captures normal and tangent-xyz base attributes when the layout carries them', () => {
      const geometry = createMeshGeometry({
        layout: CANONICAL_LAYOUT,
        vertices: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0]),
      });
      const bindPose = captureMeshMorphBindPose(geometry);
      expect(Array.from(bindPose.normals!)).toEqual([0, 1, 0]);
      expect(Array.from(bindPose.tangents!)).toEqual([1, 0, 0]);
      expect(bindPose.blendedNormals!.length).toBe(3);
      expect(bindPose.blendedTangents!.length).toBe(3);
    });
  });
});
