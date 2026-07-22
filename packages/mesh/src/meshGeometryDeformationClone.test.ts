import type { MeshMorph } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  createMeshGeometry,
  getMeshGeometryMorphBindPose,
  getMeshGeometrySkinBindPose,
  setMeshGeometryMorphBindPose,
  setMeshGeometrySkinBindPose,
} from './meshGeometry';
import { cloneMeshGeometryForDeformation } from './meshGeometryDeformationClone';
import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT } from './meshGeometryLayout';
import { blendMeshGeometryMorph, captureMeshMorphBindPose } from './morphMeshGeometry';

describe('cloneMeshGeometryForDeformation', () => {
  it('restores captured morph base after the source has already deformed', () => {
    const vertices = new Float32Array(20);
    vertices[0] = 1;
    vertices[4] = 1;
    const source = createMeshGeometry({ layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, vertices });
    const bindPose = captureMeshMorphBindPose(source);
    setMeshGeometryMorphBindPose(source, bindPose);
    const morph: MeshMorph = {
      targets: [{ normalDeltas: null, positionDeltas: new Float32Array([5, 0, 0]), tangentDeltas: null }],
      weights: new Float32Array([1]),
    };
    blendMeshGeometryMorph(source, morph, bindPose);
    expect(source.vertices[0]).toBe(6);

    const clone = cloneMeshGeometryForDeformation(source);

    expect(clone.vertices[0]).toBe(1);
    expect(clone.vertices).not.toBe(source.vertices);
    expect(getMeshGeometryMorphBindPose(clone)).toBeNull();
    expect(getMeshGeometrySkinBindPose(clone)).toBeNull();
    expect(clone.bounds?.min.x).toBe(1);
    expect(clone.bounds?.max.x).toBe(1);
  });

  it('restores a captured skin base when no deeper morph base exists', () => {
    const vertices = new Float32Array(20);
    vertices[0] = 9;
    vertices[4] = 9;
    const source = createMeshGeometry({ layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, vertices });
    setMeshGeometrySkinBindPose(source, {
      joints: new Float32Array(4),
      normals: new Float32Array([0, 1, 0]),
      positions: new Float32Array([1, 2, 3]),
      skinnedNormals: new Float32Array(3),
      skinnedPositions: new Float32Array(3),
      weights: new Float32Array(4),
    });

    const clone = cloneMeshGeometryForDeformation(source);

    expect(Array.from(clone.vertices.slice(0, 6))).toEqual([1, 2, 3, 0, 1, 0]);
    expect(getMeshGeometrySkinBindPose(clone)).toBeNull();
  });
});
