import {
  conjugateQuaternion,
  createQuaternion,
  multiplyQuaternion,
  rotateVector3ByQuaternion,
} from '@flighthq/geometry';
import { createBlinnPhongMaterial } from '@flighthq/materials';
import { CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT, computeMeshGeometryNormals, createMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene, createSceneNode, setSceneNodeTransform } from '@flighthq/scene';
import { createSkeleton3D } from '@flighthq/skeleton3d';
import type { AnimationClip, Material, Mesh, SceneNode, Skeleton3D } from '@flighthq/types';

import { parseMd5Anim } from './md5AnimParse';
import type { Md5Joint, Md5Mesh, Md5Vertex, Md5Weight } from './md5Schema';
import type { SceneImport } from './sceneImport';
import type { SkinInfluence } from './shared';
import {
  convertPositionsZUpToYUp,
  convertQuaternionsZUpToYUp,
  createExternalTextureRef,
  findSceneSkeletonJoints,
  packSkinInfluences,
  SKINNED_FLOATS_PER_VERTEX,
} from './shared';

// Parses an id Tech 4 MD5 mesh file (.md5mesh) into a Scene. The ASCII line-oriented format
// contains a skeleton (joints) and one or more mesh sections. Each mesh section becomes a
// separate Mesh child of the scene root. The joints form a nested SceneNode hierarchy under a
// "skeleton" group. The subtlety that MD5 skinning gets wrong: .md5mesh joint transforms are
// ABSOLUTE (object-space), but .md5anim frames are parent-RELATIVE — so the bind pose here is
// converted absolute→relative before nesting (so parent × child rebuilds the absolute world), while
// parseMd5Anim drives its already-relative values onto the same nested joints. Both then pose one
// consistent hierarchy. See the absolute→relative conversion in the skeleton build below.
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

  // Build skeleton hierarchy as SceneNode tree. The skin (below) references these joint nodes by
  // identity, so parseMd5Anim can pose the same nodes the mesh deforms from.
  let skeleton: Skeleton3D | null = null;
  let skeletonRoot: SceneNode | null = null;
  if (joints.length > 0) {
    skeletonRoot = createSceneNode(undefined, { name: 'skeleton' });
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

    // The .md5mesh joints are ABSOLUTE (object-space) transforms, but the SceneNode hierarchy composes
    // parent × child, so each joint's LOCAL transform must be its transform relative to its parent:
    // localQuat = parentAbsQuat⁻¹ · absQuat, localPos = parentAbsQuat⁻¹ · (absPos − parentAbsPos). This
    // is the crux MD5 skinning gets wrong two ways: setting the absolute transform directly as the local
    // (double-accumulates → explodes under animation), or flattening the skeleton (breaks the .md5anim
    // frames, which are parent-RELATIVE and rely on the hierarchy to compose to absolute — see
    // parseMd5Anim). With bind converted to relative here and anim already relative, both pose the same
    // nested joints consistently. Roots (parentIndex < 0) keep their absolute transform as local.
    const parentConj = createQuaternion();
    const relPos = { x: 0, y: 0, z: 0 };
    const relQuat = createQuaternion();
    for (let j = 0; j < joints.length; j++) {
      const joint = joints[j];
      const node = createSceneNode(undefined, { name: joint.name });
      const pi = j * 3;
      const qi = j * 4;
      const parentIndex = joint.parentIndex;
      let localPx = jointPositions[pi];
      let localPy = jointPositions[pi + 1];
      let localPz = jointPositions[pi + 2];
      let localQx = jointOrientations[qi];
      let localQy = jointOrientations[qi + 1];
      let localQz = jointOrientations[qi + 2];
      let localQw = jointOrientations[qi + 3];
      if (parentIndex >= 0 && parentIndex < joints.length) {
        const ppi = parentIndex * 3;
        const pqi = parentIndex * 4;
        conjugateQuaternion(parentConj, {
          w: jointOrientations[pqi + 3],
          x: jointOrientations[pqi],
          y: jointOrientations[pqi + 1],
          z: jointOrientations[pqi + 2],
        });
        rotateVector3ByQuaternion(
          relPos,
          {
            x: localPx - jointPositions[ppi],
            y: localPy - jointPositions[ppi + 1],
            z: localPz - jointPositions[ppi + 2],
          },
          parentConj,
        );
        multiplyQuaternion(relQuat, parentConj, { w: localQw, x: localQx, y: localQy, z: localQz });
        localPx = relPos.x;
        localPy = relPos.y;
        localPz = relPos.z;
        localQx = relQuat.x;
        localQy = relQuat.y;
        localQz = relQuat.z;
        localQw = relQuat.w;
      } else if (parentIndex >= joints.length) {
        warnings?.push(`createSceneFromMd5Mesh: joint ${j} has out-of-range parent index ${parentIndex}`);
      }
      setSceneNodeTransform(
        node,
        { x: localPx, y: localPy, z: localPz },
        { w: localQw, x: localQx, y: localQy, z: localQz },
        { x: 1, y: 1, z: 1 },
      );
      jointNodes.push(node);
    }

    // Nest by parent index so parent × child composition reconstructs each joint's absolute world
    // transform from the parent-relative locals set above; roots hang under the skeleton group.
    for (let j = 0; j < joints.length; j++) {
      const parentIndex = joints[j].parentIndex;
      if (parentIndex >= 0 && parentIndex < jointNodes.length) {
        addNodeChild(jointNodes[parentIndex], jointNodes[j]);
      } else {
        addNodeChild(skeletonRoot, jointNodes[j]);
      }
    }

    addNodeChild(scene, skeletonRoot);

    // Capture the current (bind) pose as the skin's rest pose: createSkeleton3D with no explicit
    // inverse-bind matrices derives them from the joint nodes' world transforms, which are set to
    // the MD5 rest pose above. Shared by every mesh section — they skin from the same skeleton.
    const jointNames = joints.map((joint) => joint.name);
    skeleton = createSkeleton3D(jointNodes, undefined, jointNames);
  }

  // Build mesh geometry from weighted vertices. Each vertex bakes its bind-pose position from the
  // joint influences (as before) and, unlike before, keeps those influences as the skinned layout's
  // joints0/weights0 channels so the mesh can be re-deformed every frame from an animated skeleton.
  for (let m = 0; m < meshes.length; m++) {
    const md5Mesh = meshes[m];
    const vertices: number[] = [];
    const indices: number[] = [];

    // Reused per-vertex influence scratch (up to 4 joint/weight pairs, top-by-bias).
    const jointScratch = [0, 0, 0, 0];
    const weightScratch = [0, 0, 0, 0];

    for (let v = 0; v < md5Mesh.vertices.length; v++) {
      const vert = md5Mesh.vertices[v];
      let px = 0;
      let py = 0;
      let pz = 0;
      const influences: SkinInfluence[] = [];

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
        influences.push({ jointIndex: weight.jointIndex, weight: weight.bias });
      }

      packSkinInfluences(influences, jointScratch, weightScratch);

      // Position (3 floats) in MD5's native Z-up space; batch-converted below.
      vertices.push(px, py, pz);
      // Normal (3 floats) — MD5 mesh carries none; zero-filled here, regenerated after Y-up convert.
      vertices.push(0, 0, 0);
      // Tangent (4 floats) — MD5 mesh does not carry tangents; zero-filled.
      vertices.push(0, 0, 0, 0);
      // UV (2 floats).
      vertices.push(vert.u, vert.v);
      // joints0 (4 floats) — the influencing joint indices, carried as float indices.
      vertices.push(jointScratch[0], jointScratch[1], jointScratch[2], jointScratch[3]);
      // weights0 (4 floats) — the blend weights, renormalized to sum 1 (or all-zero for no influence).
      vertices.push(weightScratch[0], weightScratch[1], weightScratch[2], weightScratch[3]);
    }

    // Convert vertex positions from Z-up to Y-up in the interleaved buffer (positions only; the
    // stride walk skips the other channels).
    convertPositionsZUpToYUp(vertices, SKINNED_FLOATS_PER_VERTEX, 0);

    // Indices are stored directly.
    for (let t = 0; t < md5Mesh.indices.length; t++) {
      indices.push(md5Mesh.indices[t]);
    }

    if (indices.length > 0) {
      const geometry = createMeshGeometry({
        indices: Uint32Array.from(indices),
        layout: CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
        vertices: new Float32Array(vertices),
      });
      // MD5 carries no normals; derive them from the Y-up bind-pose positions and winding.
      computeMeshGeometryNormals(geometry, geometry);
      // MD5's per-section `shader` names the material/texture the mesh uses. MD5 has no lighting-model
      // parameters, so decode it as a BlinnPhongMaterial (the id Tech texture-and-lighting model)
      // whose diffuseMap references the shader path; resolution of that path is the caller's step.
      const materials: Material[] =
        md5Mesh.shader.length > 0
          ? [createBlinnPhongMaterial({ diffuseMap: createExternalTextureRef(md5Mesh.shader) }) as unknown as Material]
          : [];
      const meshNode: Mesh = createMesh(geometry, materials);
      if (skeleton !== null) meshNode.skin = { skeleton, skeletonRoot };
      addNodeChild(scene, meshNode as unknown as SceneNode);
    }
  }

  return scene;
}

// Imports an MD5 model as a whole: the mesh's scene (skeleton + skinned meshes) plus, when the paired
// `.md5anim` source is supplied, its skeletal animation folded into one call. The assembly-tier sibling
// of createSceneFromMd5Mesh. MD5 splits mesh and animation across two files, so `animSource` is a
// separate argument (unlike AWD's single-file importAwd); when omitted, `animations` is empty. The clip
// binds to the scene's own skeleton joints, so posing it deforms the skinned mesh with no caller
// threading. MD5 declares a single scene, so `scenes` is a one-element array.
export function importMd5Mesh(meshSource: string, animSource?: string, warnings?: string[]): SceneImport {
  const scene = createSceneFromMd5Mesh(meshSource, warnings);
  let clip: AnimationClip | null = null;
  if (animSource !== undefined) {
    const joints = findSceneSkeletonJoints(scene);
    clip = joints !== null ? parseMd5Anim(animSource, joints, warnings) : null;
  }
  return { animations: clip !== null ? [clip] : [], scene, scenes: [scene] };
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
