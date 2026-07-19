import { createScene } from '@flighthq/scene';
import type { Camera, Mesh, SceneLights, SceneNode } from '@flighthq/sdk';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  addNodeChild,
  createAmbientLight,
  createCamera,
  createDirectionalLight,
  createMesh,
  createMeshGeometry,
  createPerspectiveProjection,
  createQuaternion,
  createSceneNode,
  createSkeleton3D,
  createStandardPbrMaterial,
  createVector3,
  normalizeVector3,
  setCameraViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  copyQuaternion,
  invalidateNodeLocalTransform,
  updateMeshSkin,
} from '@flighthq/sdk';

import { render } from './render';

// createScene collides in the @flighthq/sdk barrel (exported by both @flighthq/node and
// @flighthq/scene), so import the 3D scene version directly from its package.

// Skeleton example: a multi-segment tube mesh deformed by CPU skinning. Four joints form a chain
// along the Y axis; sinusoidal rotations on the Z axis produce a smooth undulating wave. The mesh
// carries its skin binding (joints0/weights0) in its geometry, and each frame is deformed by a
// single updateMeshSkin call after the joints are posed — no hand-rolled palette, re-interleave, or
// re-upload. This is the same recipe the MD5/glTF importers produce; the geometry here is built by
// hand only because the example ships no asset.

const JOINT_COUNT = 4;
const SEGMENTS_PER_JOINT = 6;
const RADIAL_SEGMENTS = 12;
const SEGMENT_HEIGHT = 0.5;
const TUBE_RADIUS = 0.5;
const TOTAL_HEIGHT = JOINT_COUNT * SEGMENTS_PER_JOINT * SEGMENT_HEIGHT;
// Canonical skinned record: position(3) + normal(3) + tangent(4) + uv0(2) + joints0(4) + weights0(4).
const FLOATS_PER_VERTEX = 20;

const heightSegments = JOINT_COUNT * SEGMENTS_PER_JOINT;
const verticesPerRing = RADIAL_SEGMENTS + 1;
const ringCount = heightSegments + 1;
const vertexCount = verticesPerRing * ringCount;
const indexCount = RADIAL_SEGMENTS * heightSegments * 6;

const vertices = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
const indices = new Uint16Array(indexCount);

// A tube centered at the origin, extending along +Y. Each ring's vertices are weighted to the two
// nearest joints so the surface bends smoothly across joint boundaries — this is the skin binding,
// baked once into the geometry's joints0/weights0 channels.
for (let ring = 0; ring < ringCount; ring++) {
  const y = -TOTAL_HEIGHT / 2 + (ring / heightSegments) * TOTAL_HEIGHT;
  const v = ring / heightSegments;

  const jointFrac = (ring / heightSegments) * (JOINT_COUNT - 1);
  const lowerJoint = Math.min(Math.floor(jointFrac), JOINT_COUNT - 2);
  const upperJoint = lowerJoint + 1;
  const blend = jointFrac - lowerJoint;

  for (let seg = 0; seg <= RADIAL_SEGMENTS; seg++) {
    const angle = (seg / RADIAL_SEGMENTS) * Math.PI * 2;
    const nx = Math.cos(angle);
    const nz = Math.sin(angle);

    const vi = (ring * verticesPerRing + seg) * FLOATS_PER_VERTEX;
    // position
    vertices[vi] = nx * TUBE_RADIUS;
    vertices[vi + 1] = y;
    vertices[vi + 2] = nz * TUBE_RADIUS;
    // normal (radial outward)
    vertices[vi + 3] = nx;
    vertices[vi + 4] = 0;
    vertices[vi + 5] = nz;
    // tangent (along the ring circumference, w=1 for right-handed bitangent)
    vertices[vi + 6] = -nz;
    vertices[vi + 7] = 0;
    vertices[vi + 8] = nx;
    vertices[vi + 9] = 1;
    // uv0
    vertices[vi + 10] = seg / RADIAL_SEGMENTS;
    vertices[vi + 11] = v;
    // joints0 (the two influencing joint indices)
    vertices[vi + 12] = lowerJoint;
    vertices[vi + 13] = upperJoint;
    vertices[vi + 14] = 0;
    vertices[vi + 15] = 0;
    // weights0 (linear blend between them, summing to 1)
    vertices[vi + 16] = 1 - blend;
    vertices[vi + 17] = blend;
    vertices[vi + 18] = 0;
    vertices[vi + 19] = 0;
  }
}

// Triangle indices: two triangles per quad between adjacent rings.
let idx = 0;
for (let ring = 0; ring < heightSegments; ring++) {
  for (let seg = 0; seg < RADIAL_SEGMENTS; seg++) {
    const a = ring * verticesPerRing + seg;
    const b = a + verticesPerRing;
    indices[idx++] = a;
    indices[idx++] = b;
    indices[idx++] = a + 1;
    indices[idx++] = a + 1;
    indices[idx++] = b;
    indices[idx++] = b + 1;
  }
}

const geometry = createMeshGeometry({
  indices,
  layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  vertices,
});

// Build the joint hierarchy as SceneNodes in a chain along Y. Joint 0 is the root at the bottom of
// the tube; each successive joint is offset upward by the segment span.
const scene = createScene();

const jointSpacing = TOTAL_HEIGHT / (JOINT_COUNT - 1);
const jointNodes: SceneNode[] = [];
for (let j = 0; j < JOINT_COUNT; j++) {
  const node = createSceneNode();
  if (j === 0) {
    node.position.y = -TOTAL_HEIGHT / 2;
    invalidateNodeLocalTransform(node);
    addNodeChild(scene, node);
  } else {
    node.position.y = jointSpacing;
    invalidateNodeLocalTransform(node);
    addNodeChild(jointNodes[j - 1], node);
  }
  jointNodes.push(node);
}

// createSkeleton3D with no explicit inverse-bind matrices captures the current joint poses as the
// bind (rest) pose. Binding it to the mesh via the skin is all it takes to make the mesh skinnable.
const material = createStandardPbrMaterial({ baseColor: 0xe08040ff, metallic: 0, roughness: 0.45 });
const mesh: Mesh = createMesh(geometry, [material]);
mesh.skin = { skeleton: createSkeleton3D(jointNodes) };
addNodeChild(scene, mesh);

const camera: Camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: 800 / 600, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(6, 4, 10), createVector3(0, 0, 0), createVector3(0, 1, 0));

const directionalDirection = createVector3(-1, -0.5, -0.7);
normalizeVector3(directionalDirection, directionalDirection);
const lights: SceneLights = {
  ambient: createAmbientLight({ color: 0x6080b0ff, intensity: 0.2 }),
  directional: createDirectionalLight({ color: 0xffffffff, direction: directionalDirection, intensity: 3 }),
};

const q = createQuaternion();
const zAxis = createVector3(0, 0, 1);

function animate(time: number): void {
  const t = time * 0.001;

  // Pose each joint with a sinusoidal Z-axis rotation; a per-joint phase offset gives a traveling wave.
  for (let j = 0; j < JOINT_COUNT; j++) {
    setQuaternionFromAxisAngle(q, zAxis, Math.sin(t * 2 + j * 1.2) * 0.3);
    copyQuaternion(jointNodes[j].rotation, q);
    invalidateNodeLocalTransform(jointNodes[j]);
  }

  // One call deforms the mesh from the posed skeleton and marks the geometry for re-upload.
  updateMeshSkin(mesh);

  render(scene, camera, lights);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
