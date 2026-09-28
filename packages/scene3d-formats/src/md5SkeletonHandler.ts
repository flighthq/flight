import {
  composeMatrix4,
  conjugateQuaternion,
  createMatrix4,
  createQuaternion,
  createTransform3D,
  inverseMatrix4,
  multiplyQuaternion,
  rotateVector3ByQuaternion,
  setQuaternion,
  setVector3,
} from '@flighthq/geometry/contract';
import type {
  Matrix4,
  Md5DropTally,
  Md5Joint,
  Md5SectionHandler,
  Scene3DDocument,
  Scene3DDocumentSkin,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MD5_SKELETON_FEATURE, Node3DKind } from '@flighthq/types/contract';

import { tallyMd5Drop } from './md5Parse.ts';
import { convertPositionsZUpToYUp, convertQuaternionsZUpToYUp } from './shared.ts';

/**
 * Emits the `joints { }` block as the document's skeleton — a group node plus one node per joint — and the
 * skin every mesh section binds.
 *
 * ★ THIS ONE IS A CONTENT TOGGLE, NOT A DEPENDENCY BOUNDARY, and the distinction is worth stating because
 * the other MD5 handler is the opposite. Omitting the material handler drops `@flighthq/materials` from the
 * build; omitting this one drops no package at all, since the geometry path needs `@flighthq/geometry`
 * either way. What it drops is the joint nodes and the skin, which is the right choice for a caller who
 * wants the bind pose as static geometry and will never pose it.
 *
 * It records the skin index on the context because the meshes are assembled at a later dispatch point and
 * have to read it back.
 *
 * ★ THE BUILDER LIVES HERE NOW, NOT IN THE PARSER. `buildMd5SkeletonDocument` and the cycle check it needs were retained
 * in `md5Parse.ts` while this handler was a one-line call into them, which made the handler a shim over 170 lines of
 * skeleton interpretation held by the file every MD5 caller parses through. The identity is unchanged — it is the same
 * exported function, and `tallyMd5Drop` stays the parser's shared drop plumbing, read from here as the material handler
 * reads `createExternalTextureRef`.
 */
export const md5SkeletonHandler: Readonly<Md5SectionHandler> = {
  collect(context) {
    if (context.joints.length === 0) return;
    context.skin = context.document.skins.length;
    context.document.skins.push(buildMd5SkeletonDocument(context.joints, context.document, context.drops));
  },
  feature: MD5_SKELETON_FEATURE,
};

/**
 * The skeleton family, as the list a selective caller names.
 *
 * ★ IT LIVES BESIDE ITS HANDLER BECAUSE OF WHERE IT USED TO LIVE. Both family constants sat in
 * `md5SectionRegistry.ts` next to `md5AllSectionHandlers`, so naming EITHER family imported that module and linked BOTH
 * handlers — 8,392 measured bytes (65,336 → 56,944), including `@flighthq/materials`, for a caller who asked for the
 * skeleton alone.
 * A family constant is one element long; keeping it here is what makes naming it cost one handler.
 */
export const md5SkeletonFamily: readonly Md5SectionHandler[] = [md5SkeletonHandler];

// Emits an MD5 joint list into a Scene3DDocument as a "skeleton" group node + one joint node per MD5 joint
// (with its parent-RELATIVE local transform), and returns the Scene3DDocumentSkin whose joints are those node
// indices and whose inverse-bind is derived from the ABSOLUTE bind world. Appends the nodes to
// `document.nodes` and wires the skeleton-group node as a scene root plus each joint under its parent joint
// (roots under the group) via `children` index lists.
export function buildMd5SkeletonDocument(
  joints: readonly Md5Joint[],
  document: Scene3DDocument,
  md5Drops: Map<string, Md5DropTally> | null,
): Scene3DDocumentSkin {
  const skeletonRootIndex = document.nodes.length;
  document.nodes.push({ children: [], kind: Node3DKind, name: 'skeleton', transform: createTransform3D() });
  document.scenes[0].rootNodes.push(skeletonRootIndex);

  // Convert joint positions and orientations from Z-up to Y-up.
  const jointPositions: number[] = [];
  const jointOrientations: number[] = [];
  for (const joint of joints) {
    jointPositions.push(joint.positionX, joint.positionY, joint.positionZ);
    jointOrientations.push(joint.orientationX, joint.orientationY, joint.orientationZ, joint.orientationW);
  }
  convertPositionsZUpToYUp(jointPositions);
  convertQuaternionsZUpToYUp(jointOrientations);

  const jointNodeIndices: number[] = [];
  for (let j = 0; j < joints.length; j++) {
    jointNodeIndices.push(document.nodes.length);
    document.nodes.push({ children: [], kind: Node3DKind, name: joints[j].name, transform: createTransform3D() });
  }

  // The .md5mesh joints are ABSOLUTE (object-space) transforms, but the Node3D hierarchy composes parent
  // × child, so each joint's LOCAL transform must be its transform relative to its parent: localQuat =
  // parentAbsQuat⁻¹ · absQuat, localPos = parentAbsQuat⁻¹ · (absPos − parentAbsPos). This is the crux MD5
  // skinning gets wrong two ways: setting the absolute transform directly as the local (double-accumulates →
  // explodes under animation), or flattening the skeleton (breaks the .md5anim frames, which are
  // parent-RELATIVE and rely on the hierarchy to compose to absolute — see parseMd5Anim). With bind
  // converted to relative here and anim already relative, both pose the same nested joints consistently.
  // Roots (parentIndex < 0) keep their absolute transform as local.
  const parentConj = createQuaternion();
  const relPos = { x: 0, y: 0, z: 0 };
  const relQuat = createQuaternion();
  for (let j = 0; j < joints.length; j++) {
    const pi = j * 3;
    const qi = j * 4;
    const parentIndex = joints[j].parentIndex;
    let localPx = jointPositions[pi];
    let localPy = jointPositions[pi + 1];
    let localPz = jointPositions[pi + 2];
    let localQx = jointOrientations[qi];
    let localQy = jointOrientations[qi + 1];
    let localQz = jointOrientations[qi + 2];
    let localQw = jointOrientations[qi + 3];
    // Self-parent and cycles are excluded HERE too, not only in the nesting pass below: a joint that took
    // the parent-relative branch while the nesting pass treated it as a root would have its transform
    // made relative to a parent it is never composed against, which double-counts nothing and silently
    // misplaces it.
    if (parentIndex >= 0 && parentIndex < joints.length && parentIndex !== j && !isMd5JointCycle(joints, j)) {
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
    } else if (parentIndex !== -1) {
      // Every parent that is neither a real joint nor the -1 root sentinel lands here, and it is one
      // report rather than only the too-large half: `parentIndex < -1` used to match no branch at all and
      // was silently indistinguishable from a legitimate root, while `>= length` was correctly reported.
      // A joint naming ITSELF is included because `addNodeChild` throws on a self-child, out of a parser
      // documented never to throw.
      tallyMd5Drop(md5Drops, ImportDiagnosticSeverity.Recover, 'md5mesh.joint-parent-out-of-range', '', {
        firstJoint: j,
        firstParent: parentIndex,
      });
    }
    const transform = document.nodes[jointNodeIndices[j]].transform;
    setVector3(transform.position, localPx, localPy, localPz);
    setQuaternion(transform.rotation, localQx, localQy, localQz, localQw);
  }

  // Nest by parent index so parent × child composition reconstructs each joint's absolute world transform
  // from the parent-relative locals set above; roots hang under the skeleton group.
  for (let j = 0; j < joints.length; j++) {
    const parentIndex = joints[j].parentIndex;
    // `isMd5JointCycle` covers what a self-check alone cannot: `addNodeChildAt` rejects a node parented to
    // itself but never walks the ancestor chain, so a two-joint cycle would be built into a detached
    // subgraph hanging off nothing, silently absent from the skeleton it belongs to.
    if (parentIndex >= 0 && parentIndex < joints.length && parentIndex !== j && !isMd5JointCycle(joints, j)) {
      document.nodes[jointNodeIndices[parentIndex]].children.push(jointNodeIndices[j]);
    } else {
      document.nodes[skeletonRootIndex].children.push(jointNodeIndices[j]);
    }
  }

  // Derive each joint's inverse-bind matrix from its ABSOLUTE (Y-up) bind world transform: inverseBind =
  // (compose(absPos, absQuat, 1))⁻¹. MD5 joints are already absolute, so no hierarchy walk is needed — this
  // is exactly what the live scene path produced by letting createSkeleton3D derive the palette from the
  // joint nodes' world transforms (which recompose to these absolutes).
  const inverseBind: Matrix4[] = [];
  const bindWorld = createMatrix4();
  for (let j = 0; j < joints.length; j++) {
    const pi = j * 3;
    const qi = j * 4;
    composeMatrix4(
      bindWorld,
      { x: jointPositions[pi], y: jointPositions[pi + 1], z: jointPositions[pi + 2] },
      {
        w: jointOrientations[qi + 3],
        x: jointOrientations[qi],
        y: jointOrientations[qi + 1],
        z: jointOrientations[qi + 2],
      },
      { x: 1, y: 1, z: 1 },
    );
    const inv = createMatrix4();
    inverseMatrix4(inv, bindWorld);
    inverseBind.push(inv);
  }

  return { inverseBind, joints: jointNodeIndices };
}

// Whether joint `start`'s parent chain loops back to it rather than reaching a root.
//
// A cycle is not merely wrong data: composing parent-relative transforms around one has no fixed point,
// and the hierarchy builder only rejects a node parented directly to itself, so a two-joint loop would be
// assembled into a subgraph detached from the skeleton and silently missing from the model. Bounded by
// the joint count, so a cycle terminates the walk rather than the walk terminating the import.
function isMd5JointCycle(joints: readonly Md5Joint[], start: number): boolean {
  let cursor = joints[start].parentIndex;
  for (let steps = 0; steps < joints.length; steps++) {
    if (cursor < 0 || cursor >= joints.length) return false;
    if (cursor === start) return true;
    cursor = joints[cursor].parentIndex;
  }
  return true;
}
