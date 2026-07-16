import { createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, createSceneNode, setSceneNodeTransform } from '@flighthq/scene';
import type { SceneNode } from '@flighthq/types';

import type { Md5Joint, Md5Mesh, Md5Vertex, Md5Weight } from './md5Schema';
import {
  CANONICAL_FLOATS_PER_VERTEX,
  CANONICAL_LAYOUT,
  convertPositionsZUpToYUp,
  convertQuaternionsZUpToYUp,
} from './shared';

// Parses an id Tech 4 MD5 mesh file (.md5mesh) into a Scene. The ASCII line-oriented format
// contains a skeleton (joints) and one or more mesh sections. Each mesh section becomes a
// separate Mesh child of the scene root. Joint hierarchy is represented as a tree of SceneNode
// children under a "skeleton" group node, with each joint's local-space position and orientation
// applied as transforms.
//
// Vertex positions are computed from weighted joint influences: for each vertex, the final
// position is the sum of each weight's bias multiplied by the joint-space-transformed weight
// position plus the joint position.
//
// Malformed lines push a warning and are skipped; the function never throws on bad input.
export function createSceneFromMd5Mesh(source: string, warnings?: string[]): Scene {
  const scene = createScene();

  const joints: Md5Joint[] = [];
  const meshes: Md5Mesh[] = [];

  const lines = source.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line.length === 0 || line.startsWith('//')) continue;

    if (line.startsWith('MD5Version')) {
      const version = parseInt(line.split(/\s+/)[1], 10);
      if (Number.isFinite(version) && version !== 10) {
        warnings?.push(`createSceneFromMd5Mesh: unsupported MD5Version ${version} (expected 10)`);
      }
      continue;
    }

    if (line.startsWith('commandline') || line.startsWith('numJoints') || line.startsWith('numMeshes')) {
      continue;
    }

    if (line === 'joints {') {
      i = parseJointsBlock(lines, i, joints, warnings);
      continue;
    }

    if (line === 'mesh {') {
      const mesh = parseMeshBlock(lines, i, warnings);
      i = mesh.nextLine;
      meshes.push(mesh.result);
      continue;
    }
  }

  // Build skeleton hierarchy as SceneNode tree.
  if (joints.length > 0) {
    const skeletonRoot = createSceneNode(undefined, { name: 'skeleton' });
    const jointNodes: SceneNode[] = [];

    // Convert joint positions and orientations from Z-up to Y-up.
    const jointPositions: number[] = [];
    const jointOrientations: number[] = [];
    for (const joint of joints) {
      jointPositions.push(joint.positionX, joint.positionY, joint.positionZ);
      jointOrientations.push(joint.orientationX, joint.orientationY, joint.orientationZ, joint.orientationW);
    }
    convertPositionsZUpToYUp(jointPositions);
    convertQuaternionsZUpToYUp(jointOrientations);

    for (let j = 0; j < joints.length; j++) {
      const joint = joints[j];
      const node = createSceneNode(undefined, { name: joint.name });
      const pi = j * 3;
      const qi = j * 4;
      setSceneNodeTransform(
        node,
        { x: jointPositions[pi], y: jointPositions[pi + 1], z: jointPositions[pi + 2] },
        {
          w: jointOrientations[qi + 3],
          x: jointOrientations[qi],
          y: jointOrientations[qi + 1],
          z: jointOrientations[qi + 2],
        },
        { x: 1, y: 1, z: 1 },
      );
      jointNodes.push(node);
    }

    for (let j = 0; j < joints.length; j++) {
      const parentIndex = joints[j].parentIndex;
      if (parentIndex < 0) {
        addNodeChild(skeletonRoot, jointNodes[j]);
      } else if (parentIndex < jointNodes.length) {
        addNodeChild(jointNodes[parentIndex], jointNodes[j]);
      } else {
        warnings?.push(`createSceneFromMd5Mesh: joint ${j} has out-of-range parent index ${parentIndex}`);
        addNodeChild(skeletonRoot, jointNodes[j]);
      }
    }

    addNodeChild(scene, skeletonRoot);
  }

  // Build mesh geometry from weighted vertices.
  for (let m = 0; m < meshes.length; m++) {
    const md5Mesh = meshes[m];
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let v = 0; v < md5Mesh.vertices.length; v++) {
      const vert = md5Mesh.vertices[v];
      let px = 0;
      let py = 0;
      let pz = 0;

      for (let w = 0; w < vert.countWeights; w++) {
        const weightIndex = vert.startWeight + w;
        if (weightIndex >= md5Mesh.weights.length) {
          warnings?.push(`createSceneFromMd5Mesh: vertex ${v} references weight index ${weightIndex} out of range`);
          break;
        }
        const weight = md5Mesh.weights[weightIndex];
        if (weight.jointIndex < 0 || weight.jointIndex >= joints.length) {
          warnings?.push(
            `createSceneFromMd5Mesh: weight ${weightIndex} references joint index ${weight.jointIndex} out of range`,
          );
          continue;
        }
        const joint = joints[weight.jointIndex];

        // Rotate weight position by joint orientation quaternion.
        const rx = quatRotateVec3X(
          joint.orientationX,
          joint.orientationY,
          joint.orientationZ,
          joint.orientationW,
          weight.positionX,
          weight.positionY,
          weight.positionZ,
        );
        const ry = quatRotateVec3Y(
          joint.orientationX,
          joint.orientationY,
          joint.orientationZ,
          joint.orientationW,
          weight.positionX,
          weight.positionY,
          weight.positionZ,
        );
        const rz = quatRotateVec3Z(
          joint.orientationX,
          joint.orientationY,
          joint.orientationZ,
          joint.orientationW,
          weight.positionX,
          weight.positionY,
          weight.positionZ,
        );

        px += weight.bias * (joint.positionX + rx);
        py += weight.bias * (joint.positionY + ry);
        pz += weight.bias * (joint.positionZ + rz);
      }

      // Position (3 floats) in MD5's native Z-up space; batch-converted below.
      vertices.push(px, py, pz);
      // Normal (3 floats) — MD5 mesh does not carry normals; zero-filled.
      vertices.push(0, 0, 0);
      // Tangent (4 floats) — MD5 mesh does not carry tangents; zero-filled.
      vertices.push(0, 0, 0, 0);
      // UV (2 floats).
      vertices.push(vert.u, vert.v);
    }

    // Convert vertex positions from Z-up to Y-up in the interleaved buffer.
    convertPositionsZUpToYUp(vertices, CANONICAL_FLOATS_PER_VERTEX, 0);

    // Indices are stored directly.
    for (let t = 0; t < md5Mesh.indices.length; t++) {
      indices.push(md5Mesh.indices[t]);
    }

    if (indices.length > 0) {
      const geometry = createMeshGeometry({
        indices: Uint32Array.from(indices),
        layout: CANONICAL_LAYOUT,
        vertices: new Float32Array(vertices),
      });
      const meshNode = createMesh(geometry, []) as unknown as SceneNode;
      addNodeChild(scene, meshNode);
    }
  }

  return scene;
}

// Parses the joints { ... } block. Returns the line index after the closing brace.
function parseJointsBlock(
  lines: readonly string[],
  startLine: number,
  joints: Md5Joint[],
  warnings: string[] | undefined,
): number {
  let i = startLine;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line === '}') return i;
    if (line.length === 0 || line.startsWith('//')) continue;

    const joint = parseJointLine(line, warnings, i - 1);
    if (joint !== null) joints.push(joint);
  }
  warnings?.push('createSceneFromMd5Mesh: joints block was not closed');
  return i;
}

// Parses a single joint line: "name" parentIndex ( px py pz ) ( qx qy qz )
function parseJointLine(line: string, warnings: string[] | undefined, lineIndex: number): Md5Joint | null {
  // Extract the quoted name.
  const nameStart = line.indexOf('"');
  const nameEnd = line.indexOf('"', nameStart + 1);
  if (nameStart < 0 || nameEnd < 0) {
    warnings?.push(`createSceneFromMd5Mesh: malformed joint on line ${lineIndex + 1}: missing name quotes`);
    return null;
  }
  const name = line.slice(nameStart + 1, nameEnd);

  // The remainder after the closing quote contains: parentIndex ( px py pz ) ( qx qy qz )
  const rest = line.slice(nameEnd + 1).trim();
  const tokens = rest
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length < 7) {
    warnings?.push(`createSceneFromMd5Mesh: malformed joint on line ${lineIndex + 1}: not enough components`);
    return null;
  }

  const parentIndex = parseInt(tokens[0], 10);
  const positionX = parseFloat(tokens[1]);
  const positionY = parseFloat(tokens[2]);
  const positionZ = parseFloat(tokens[3]);
  const orientationX = parseFloat(tokens[4]);
  const orientationY = parseFloat(tokens[5]);
  const orientationZ = parseFloat(tokens[6]);

  if (
    !Number.isFinite(parentIndex) ||
    !Number.isFinite(positionX) ||
    !Number.isFinite(positionY) ||
    !Number.isFinite(positionZ) ||
    !Number.isFinite(orientationX) ||
    !Number.isFinite(orientationY) ||
    !Number.isFinite(orientationZ)
  ) {
    warnings?.push(`createSceneFromMd5Mesh: malformed joint on line ${lineIndex + 1}: non-numeric values`);
    return null;
  }

  // Reconstruct quaternion W from XYZ. w = sqrt(1 - x^2 - y^2 - z^2), clamped to 0 when
  // the squared sum exceeds 1 (numerical precision).
  const sumSq = orientationX * orientationX + orientationY * orientationY + orientationZ * orientationZ;
  const orientationW = sumSq < 1 ? -Math.sqrt(1 - sumSq) : 0;

  return {
    name,
    orientationW,
    orientationX,
    orientationY,
    orientationZ,
    parentIndex,
    positionX,
    positionY,
    positionZ,
  };
}

// Parses a mesh { ... } block. Returns the parsed mesh and the line index after the closing brace.
function parseMeshBlock(
  lines: readonly string[],
  startLine: number,
  warnings: string[] | undefined,
): { nextLine: number; result: Md5Mesh } {
  let shader = '';
  const vertices: Md5Vertex[] = [];
  const weights: Md5Weight[] = [];
  const indices: number[] = [];

  let i = startLine;
  while (i < lines.length) {
    const line = lines[i].trim();
    i++;

    if (line === '}') return { nextLine: i, result: { indices, shader, vertices, weights } };
    if (line.length === 0 || line.startsWith('//')) continue;

    if (line.startsWith('shader')) {
      const nameStart = line.indexOf('"');
      const nameEnd = line.indexOf('"', nameStart + 1);
      if (nameStart >= 0 && nameEnd > nameStart) {
        shader = line.slice(nameStart + 1, nameEnd);
      }
      continue;
    }

    if (line.startsWith('numverts') || line.startsWith('numtris') || line.startsWith('numweights')) {
      continue;
    }

    if (line.startsWith('vert ')) {
      const vert = parseVertLine(line, warnings, i - 1);
      if (vert !== null) vertices.push(vert);
      continue;
    }

    if (line.startsWith('tri ')) {
      const tri = parseTriLine(line, warnings, i - 1);
      if (tri !== null) {
        indices.push(tri[0], tri[1], tri[2]);
      }
      continue;
    }

    if (line.startsWith('weight ')) {
      const weight = parseWeightLine(line, warnings, i - 1);
      if (weight !== null) weights.push(weight);
      continue;
    }
  }

  warnings?.push('createSceneFromMd5Mesh: mesh block was not closed');
  return { nextLine: i, result: { indices, shader, vertices, weights } };
}

// Parses: vert vertIndex ( u v ) startWeight countWeights
function parseVertLine(line: string, warnings: string[] | undefined, lineIndex: number): Md5Vertex | null {
  const tokens = line
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  // tokens: ["vert", vertIndex, u, v, startWeight, countWeights]
  if (tokens.length < 6) {
    warnings?.push(`createSceneFromMd5Mesh: malformed vert on line ${lineIndex + 1}`);
    return null;
  }

  const u = parseFloat(tokens[2]);
  const v = parseFloat(tokens[3]);
  const startWeight = parseInt(tokens[4], 10);
  const countWeights = parseInt(tokens[5], 10);

  if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(startWeight) || !Number.isFinite(countWeights)) {
    warnings?.push(`createSceneFromMd5Mesh: malformed vert on line ${lineIndex + 1}: non-numeric values`);
    return null;
  }

  return { countWeights, startWeight, u, v };
}

// Parses: tri triIndex v0 v1 v2
function parseTriLine(
  line: string,
  warnings: string[] | undefined,
  lineIndex: number,
): readonly [number, number, number] | null {
  const tokens = line.split(/\s+/).filter((t) => t.length > 0);
  // tokens: ["tri", triIndex, v0, v1, v2]
  if (tokens.length < 5) {
    warnings?.push(`createSceneFromMd5Mesh: malformed tri on line ${lineIndex + 1}`);
    return null;
  }

  const v0 = parseInt(tokens[2], 10);
  const v1 = parseInt(tokens[3], 10);
  const v2 = parseInt(tokens[4], 10);

  if (!Number.isFinite(v0) || !Number.isFinite(v1) || !Number.isFinite(v2)) {
    warnings?.push(`createSceneFromMd5Mesh: malformed tri on line ${lineIndex + 1}: non-numeric indices`);
    return null;
  }

  return [v0, v1, v2] as const;
}

// Parses: weight weightIndex jointIndex bias ( px py pz )
function parseWeightLine(line: string, warnings: string[] | undefined, lineIndex: number): Md5Weight | null {
  const tokens = line
    .replace(/[()]/g, '')
    .split(/\s+/)
    .filter((t) => t.length > 0);
  // tokens: ["weight", weightIndex, jointIndex, bias, px, py, pz]
  if (tokens.length < 7) {
    warnings?.push(`createSceneFromMd5Mesh: malformed weight on line ${lineIndex + 1}`);
    return null;
  }

  const jointIndex = parseInt(tokens[2], 10);
  const bias = parseFloat(tokens[3]);
  const positionX = parseFloat(tokens[4]);
  const positionY = parseFloat(tokens[5]);
  const positionZ = parseFloat(tokens[6]);

  if (
    !Number.isFinite(jointIndex) ||
    !Number.isFinite(bias) ||
    !Number.isFinite(positionX) ||
    !Number.isFinite(positionY) ||
    !Number.isFinite(positionZ)
  ) {
    warnings?.push(`createSceneFromMd5Mesh: malformed weight on line ${lineIndex + 1}: non-numeric values`);
    return null;
  }

  return { bias, jointIndex, positionX, positionY, positionZ };
}

// Rotates a vector (vx, vy, vz) by quaternion (qx, qy, qz, qw) and returns the X component.
// Formula: t = 2 * cross(q.xyz, v); result = v + qw * t + cross(q.xyz, t)
function quatRotateVec3X(qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number): number {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return vx + qw * tx + (qy * tz - qz * ty);
}

// Returns the Y component of quaternion-rotated vector.
function quatRotateVec3Y(qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number): number {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return vy + qw * ty + (qz * tx - qx * tz);
}

// Returns the Z component of quaternion-rotated vector.
function quatRotateVec3Z(qx: number, qy: number, qz: number, qw: number, vx: number, vy: number, vz: number): number {
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return vz + qw * tz + (qx * ty - qy * tx);
}
