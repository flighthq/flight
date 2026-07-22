import { createEntity } from '@flighthq/entity';
import { createRay3D, createVector3, setRay3D, setVector3 } from '@flighthq/geometry';
import { createMeshGeometry, createMeshGeometryFromAttributes, setMeshGeometrySubsets } from '@flighthq/mesh';
import { invalidateNodeLocalTransform } from '@flighthq/node';
import { createMesh } from '@flighthq/scene';
import type { SceneHit, VertexAttributeLayout } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createSceneHit } from './pickScene';
import {
  getSceneHitMaterial,
  getSceneHitSubsetIndex,
  getSceneHitUv0,
  getSceneHitVertexNormal,
  getSceneHitVertexTangent,
  isSceneHitFrontFacing,
} from './sceneHitAttributes';

function attributedHit(): SceneHit {
  const geometry = createMeshGeometryFromAttributes({
    indices: [0, 1, 2],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    uvs: [0, 0, 1, 0, 0, 1],
  });
  const hit = createSceneHit();
  hit.node = createMesh(geometry, []);
  hit.triangleIndex = 0;
  hit.u = 0.25;
  hit.v = 0.25;
  hit.w = 0.5;
  hit.normalZ = 1;
  return hit;
}

describe('getSceneHitMaterial', () => {
  it('returns the subset material or null for the default slot', () => {
    const hit = attributedHit();
    const material = createEntity({ kind: 'TestMaterial' });
    hit.node.materials = [material];
    expect(getSceneHitMaterial(hit)).toBe(material);
    hit.node.materials[0] = null;
    expect(getSceneHitMaterial(hit)).toBeNull();
  });
});

describe('getSceneHitSubsetIndex', () => {
  it('resolves the subset owning the hit triangle', () => {
    const hit = attributedHit();
    setMeshGeometrySubsets(hit.node.geometry, [{ indexCount: 3, indexOffset: 0 }]);
    expect(getSceneHitSubsetIndex(hit)).toBe(0);
    hit.triangleIndex = 2;
    expect(getSceneHitSubsetIndex(hit)).toBe(-1);
  });
});

describe('getSceneHitUv0', () => {
  it('barycentrically interpolates the current triangle uv', () => {
    const out = { x: 0, y: 0 };
    expect(getSceneHitUv0(out, attributedHit())).toBe(true);
    expect(out.x).toBeCloseTo(0.25);
    expect(out.y).toBeCloseTo(0.5);
  });

  it('leaves out unchanged when uv0 is absent', () => {
    const hit = positionOnlyHit();
    const out = { x: 7, y: 8 };
    expect(getSceneHitUv0(out, hit)).toBe(false);
    expect(out).toEqual({ x: 7, y: 8 });
  });
});

describe('getSceneHitVertexNormal', () => {
  it('uses inverse-transpose under non-uniform scale', () => {
    const hit = attributedHit();
    const vertices = hit.node.geometry.vertices;
    for (let vertex = 0; vertex < 3; vertex++) {
      vertices[vertex * 12 + 3] = 1;
      vertices[vertex * 12 + 4] = 1;
      vertices[vertex * 12 + 5] = 0;
    }
    setVector3(hit.node.scale, 2, 1, 1);
    invalidateNodeLocalTransform(hit.node);
    const out = createVector3();
    expect(getSceneHitVertexNormal(out, hit)).toBe(true);
    const inverseLength = 1 / Math.sqrt(1.25);
    expect(out.x).toBeCloseTo(0.5 * inverseLength);
    expect(out.y).toBeCloseTo(inverseLength);
    expect(out.z).toBeCloseTo(0);
  });

  it('leaves out unchanged when normals are absent', () => {
    const out = createVector3(7, 8, 9);
    expect(getSceneHitVertexNormal(out, positionOnlyHit())).toBe(false);
    expect(out).toMatchObject({ x: 7, y: 8, z: 9 });
  });
});

describe('getSceneHitVertexTangent', () => {
  it('transforms tangent and flips handedness under mirroring', () => {
    const hit = attributedHit();
    setVector3(hit.node.scale, -1, 1, 1);
    invalidateNodeLocalTransform(hit.node);
    const out = { w: 0, x: 0, y: 0, z: 0 };
    expect(getSceneHitVertexTangent(out, hit)).toBe(true);
    expect(out.x).toBeCloseTo(-1);
    expect(out.y).toBeCloseTo(0);
    expect(out.z).toBeCloseTo(0);
    expect(out.w).toBe(-1);
  });

  it('leaves out unchanged when tangents are absent', () => {
    const out = { w: 4, x: 1, y: 2, z: 3 };
    expect(getSceneHitVertexTangent(out, positionOnlyHit())).toBe(false);
    expect(out).toEqual({ w: 4, x: 1, y: 2, z: 3 });
  });
});

describe('isSceneHitFrontFacing', () => {
  it('compares the world ray direction with the geometric face normal', () => {
    const hit = attributedHit();
    const ray = createRay3D();
    setRay3D(ray, createVector3(0, 0, 1), createVector3(0, 0, -2));
    expect(isSceneHitFrontFacing(hit, ray)).toBe(true);
    ray.direction.z = 2;
    expect(isSceneHitFrontFacing(hit, ray)).toBe(false);
  });
});

function positionOnlyHit(): SceneHit {
  const layout: VertexAttributeLayout = {
    attributes: [{ byteOffset: 0, format: 'float32x3', semantic: 'position' }],
    stride: 12,
  };
  const geometry = createMeshGeometry({ layout, vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) });
  const hit = createSceneHit();
  hit.node = createMesh(geometry, []);
  hit.triangleIndex = 0;
  hit.u = 1;
  hit.v = 0;
  hit.w = 0;
  return hit;
}
