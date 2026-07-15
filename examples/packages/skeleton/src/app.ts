import { createScene } from '@flighthq/scene';
import type { Camera, Mesh, SceneLights, SceneNode, Skeleton } from '@flighthq/sdk';
import {
  addNodeChild,
  computeSkeletonJointMatrices,
  createAmbientLight,
  createCamera,
  createCylinderMeshGeometry,
  createDirectionalLight,
  createMesh,
  createPerspectiveProjection,
  createQuaternion,
  createSceneNode,
  createSkeleton,
  createStandardPbrMaterial,
  createVector3,
  destroyMeshGeometryGlData,
  normalizeVector3,
  setCameraViewMatrix4FromLookAt,
  setQuaternionFromAxisAngle,
  setSceneNodePosition,
  setSceneNodeRotationQuaternion,
  skinVertices,
} from '@flighthq/sdk';

import { render } from './render';

// createScene collides in the @flighthq/sdk barrel (exported by both @flighthq/node and
// @flighthq/scene), so import the 3D scene version directly from its package.

// Skeleton example: a multi-segment tube mesh deformed by CPU skinning. Four joints form a chain
// along the Y axis; sinusoidal rotations on the Z axis produce a smooth undulating wave. Each
// frame, joint transforms are updated, the skin palette recomputed, and the bind-pose positions/
// normals are deformed into the live geometry via skinVertices, then re-uploaded to the GPU.

const JOINT_COUNT = 4;
const SEGMENTS_PER_JOINT = 6;
const RADIAL_SEGMENTS = 12;
const SEGMENT_HEIGHT = 0.5;
const TUBE_RADIUS = 0.15;
const TOTAL_HEIGHT = JOINT_COUNT * SEGMENTS_PER_JOINT * SEGMENT_HEIGHT;
const FLOATS_PER_VERTEX = 12; // position(3) + normal(3) + tangent(4) + uv0(2)

// Build the tube mesh as a cylinder with many height segments so skinning has enough resolution.
const heightSegments = JOINT_COUNT * SEGMENTS_PER_JOINT;
const geometry = createCylinderMeshGeometry(TUBE_RADIUS, TUBE_RADIUS, TOTAL_HEIGHT, RADIAL_SEGMENTS, false);

// The built-in cylinder may not have enough height segments for smooth bending. Build a custom
// segmented cylinder instead, producing the canonical PBR interleaved layout.
const verticesPerRing = RADIAL_SEGMENTS + 1;
const ringCount = heightSegments + 1;
const vertexCount = verticesPerRing * ringCount;
const indexCount = RADIAL_SEGMENTS * heightSegments * 6;

const vertices = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
const indices = new Uint16Array(indexCount);

// Positions and normals for a tube centered at the origin, extending along +Y from -TOTAL_HEIGHT/2
// to +TOTAL_HEIGHT/2. Each ring has RADIAL_SEGMENTS+1 vertices (the last duplicates the first for
// correct UV seam).
for (let ring = 0; ring < ringCount; ring++) {
  const y = -TOTAL_HEIGHT / 2 + (ring / heightSegments) * TOTAL_HEIGHT;
  const v = ring / heightSegments;

  for (let seg = 0; seg <= RADIAL_SEGMENTS; seg++) {
    const angle = (seg / RADIAL_SEGMENTS) * Math.PI * 2;
    const nx = Math.cos(angle);
    const nz = Math.sin(angle);
    const px = nx * TUBE_RADIUS;
    const pz = nz * TUBE_RADIUS;
    const u = seg / RADIAL_SEGMENTS;

    const vi = (ring * verticesPerRing + seg) * FLOATS_PER_VERTEX;
    // position
    vertices[vi] = px;
    vertices[vi + 1] = y;
    vertices[vi + 2] = pz;
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
    vertices[vi + 10] = u;
    vertices[vi + 11] = v;
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

// Replace the built-in geometry data with our segmented tube.
geometry.vertices = new Float32Array(vertices);
geometry.indices = new Uint16Array(indices);
geometry.subsets = [{ indexCount: indices.length, indexOffset: 0 }];
geometry.version++;

// Keep a copy of the bind-pose positions and normals for CPU skinning. skinVertices reads from
// these each frame and writes the deformed result into the live geometry.vertices buffer.
const bindPositions = new Float32Array(vertexCount * 3);
const bindNormals = new Float32Array(vertexCount * 3);
for (let v = 0; v < vertexCount; v++) {
  const src = v * FLOATS_PER_VERTEX;
  const dst = v * 3;
  bindPositions[dst] = vertices[src];
  bindPositions[dst + 1] = vertices[src + 1];
  bindPositions[dst + 2] = vertices[src + 2];
  bindNormals[dst] = vertices[src + 3];
  bindNormals[dst + 1] = vertices[src + 4];
  bindNormals[dst + 2] = vertices[src + 5];
}

// Skinning weight and joint-index buffers: 4 influences per vertex. Each vertex is weighted to
// the nearest two joints (linear blend), giving smooth bending at each joint boundary.
const jointIndices = new Uint8Array(vertexCount * 4);
const jointWeights = new Float32Array(vertexCount * 4);

for (let ring = 0; ring < ringCount; ring++) {
  // Map ring position (0..1 along the tube) to a fractional joint index. Joint 0 is at the
  // bottom, joint JOINT_COUNT-1 at the top.
  const t = ring / heightSegments;
  const jointFrac = t * (JOINT_COUNT - 1);
  const lowerJoint = Math.min(Math.floor(jointFrac), JOINT_COUNT - 2);
  const upperJoint = lowerJoint + 1;
  const blend = jointFrac - lowerJoint;

  for (let seg = 0; seg <= RADIAL_SEGMENTS; seg++) {
    const wi = (ring * verticesPerRing + seg) * 4;
    jointIndices[wi] = lowerJoint;
    jointIndices[wi + 1] = upperJoint;
    jointIndices[wi + 2] = 0;
    jointIndices[wi + 3] = 0;
    jointWeights[wi] = 1 - blend;
    jointWeights[wi + 1] = blend;
    jointWeights[wi + 2] = 0;
    jointWeights[wi + 3] = 0;
  }
}

// Scratch buffers for skinned output positions and normals (written each frame).
const skinnedPositions = new Float32Array(vertexCount * 3);
const skinnedNormals = new Float32Array(vertexCount * 3);

// Build the joint hierarchy as SceneNodes in a chain along Y. Joint 0 is the root at the bottom
// of the tube; each successive joint is offset upward by the segment span.
const scene = createScene();

const jointSpacing = TOTAL_HEIGHT / (JOINT_COUNT - 1);
const jointNodes: SceneNode[] = [];
for (let j = 0; j < JOINT_COUNT; j++) {
  const node = createSceneNode();
  if (j === 0) {
    setSceneNodePosition(node, 0, -TOTAL_HEIGHT / 2, 0);
    addNodeChild(scene, node);
  } else {
    setSceneNodePosition(node, 0, jointSpacing, 0);
    addNodeChild(jointNodes[j - 1], node);
  }
  jointNodes.push(node);
}

// Create the skeleton from the joint nodes. Omitting inverseBindMatrices captures the current
// joint poses as the bind (rest) pose automatically.
const skeleton: Skeleton = createSkeleton(jointNodes);

// PBR material: a warm orange dielectric surface.
const material = createStandardPbrMaterial({
  baseColor: 0xe08040ff,
  metallic: 0,
  roughness: 0.45,
});

const mesh: Mesh = createMesh(geometry, [material]);
addNodeChild(scene, mesh);

// Camera looking at the tube from a 3/4 angle.
const camera: Camera = createCamera({
  far: 100,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: 800 / 600, fovY: Math.PI / 4 }),
});
setCameraViewMatrix4FromLookAt(camera, createVector3(4, 2, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));

// Lighting: one white directional sun plus a cool dim ambient fill.
const directionalDirection = createVector3(-1, -0.5, -0.7);
normalizeVector3(directionalDirection, directionalDirection);
const lights: SceneLights = {
  ambient: createAmbientLight({ color: 0x6080b0ff, intensity: 0.2 }),
  directional: createDirectionalLight({
    color: 0xffffffff,
    direction: directionalDirection,
    intensity: 3,
  }),
};

// Scratch quaternion for joint rotation.
const q = createQuaternion();
const zAxis = createVector3(0, 0, 1);

function animate(time: number): void {
  const t = time * 0.001;

  // Animate each joint with a sinusoidal Z-axis rotation. A phase offset per joint produces a
  // traveling wave along the chain.
  for (let j = 0; j < JOINT_COUNT; j++) {
    const angle = Math.sin(t * 2 + j * 1.2) * 0.3;
    setQuaternionFromAxisAngle(q, zAxis, angle);
    setSceneNodeRotationQuaternion(jointNodes[j], q);
  }

  // Recompute the skin palette from the updated joint world transforms.
  computeSkeletonJointMatrices(skeleton);

  // CPU-skin the bind-pose positions/normals into the output buffers.
  skinVertices(
    skinnedPositions,
    skinnedNormals,
    bindPositions,
    bindNormals,
    jointIndices,
    jointWeights,
    skeleton.jointMatrices,
  );

  // Write skinned positions and normals back into the interleaved vertex buffer.
  for (let v = 0; v < vertexCount; v++) {
    const src = v * 3;
    const dst = v * FLOATS_PER_VERTEX;
    geometry.vertices[dst] = skinnedPositions[src];
    geometry.vertices[dst + 1] = skinnedPositions[src + 1];
    geometry.vertices[dst + 2] = skinnedPositions[src + 2];
    geometry.vertices[dst + 3] = skinnedNormals[src];
    geometry.vertices[dst + 4] = skinnedNormals[src + 1];
    geometry.vertices[dst + 5] = skinnedNormals[src + 2];
  }

  // Bump the version so scene-gl re-uploads the vertex data.
  geometry.version++;
  destroyMeshGeometryGlData(geometry);

  render(scene, camera, lights);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);
