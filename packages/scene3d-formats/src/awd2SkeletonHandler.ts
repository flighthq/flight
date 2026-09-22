import { createAnimationTrack } from '@flighthq/animation/contract';
import {
  copyMatrix4,
  createMatrix4,
  createTransform3D,
  decomposeMatrix4ToTransform3D,
  inverseMatrix4,
  multiplyMatrix4,
  setMatrix4Identity,
} from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  Awd2BlockHandler,
  Awd2ParsedJoint,
  Awd2ParsedSkeleton,
  Awd2ParsedSkeletonAnimation,
  Awd2ParsedSkeletonPose,
  ImportDiagnostic,
  AnimationTrack,
  Matrix4,
  Scene3DDocument,
  Scene3DDocumentAnimationChannel,
  Scene3DDocumentAnimation,
  Scene3DDocumentSkin,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  Node3DKind,
  Scene3DAnimationPathRotation,
  Scene3DAnimationPathScale,
  Scene3DAnimationPathTranslation,
} from '@flighthq/types/contract';
import type { Awd2ParseState } from '@flighthq/types/contract';

import { awdTransformToMatrix4, readAwdString, readAwdTransform, hasNonUnitScale, skipAwdAttrList } from './awd2Reader';
import { AWD2_BLOCK_SKELETON, AWD2_BLOCK_SKELETON_ANIMATION, AWD2_BLOCK_SKELETON_POSE } from './awd2Schema';

// Skeletons, their poses, and the animations that sequence them. This handler owns the only reach into
// @flighthq/animation, so a build that does not register it links no animation code at all.
//
// Poses and animations are DEFERRED: a pose is written against a joint count the skeleton block carries,
// so it cannot be read until that block has been. The walk locates them on the first pass and parses them
// on the second, which is what the `deferred` flag buys — one flag instead of a hard-coded list of which
// block types arrive late.

// The skeleton itself, read on the first pass because everything else here is written against it.
export const awd2SkeletonBlockHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_SKELETON],
  parse(state, block) {
    const skeleton = parseSkeletonBlock(
      block.view,
      block.source,
      block.dataStart,
      block.dataEnd,
      block.matrixWide,
      state.diagnostics,
    );
    if (skeleton !== null) state.skeletons.set(block.blockId, skeleton);
  },
  build(state) {
    buildAwd2SkeletonNodes(state);
  },
};

// A pose is written against its skeleton's joint count, so it cannot be read until that block has been.
export const awd2SkeletonPoseHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_SKELETON_POSE],
  deferred: true,
  parse(state, block) {
    const pose = parseSkeletonPoseBlock(
      block.view,
      block.source,
      block.dataStart,
      block.dataEnd,
      block.matrixWide,
      state.diagnostics,
    );
    if (pose !== null) state.skeletonPoses.set(block.blockId, pose);
  },
};

// An animation sequences poses by block id, so it too waits for the first pass to finish.
export const awd2SkeletonAnimationHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_SKELETON_ANIMATION],
  deferred: true,
  parse(state, block) {
    const animation = parseSkeletonAnimationBlock(
      block.view,
      block.source,
      block.dataStart,
      block.dataEnd,
      state.diagnostics,
    );
    if (animation !== null) state.skeletonAnimations.set(block.blockId, animation);
  },
  build(state) {
    // Bound by joint NODE INDEX, so the channels address the same joints the skin does.
    if (state.skeletonJointNodeIndices.length === 0) return;
    state.document.animations.push(...buildAwd2DocumentAnimations(state));
  },
};

// Builds the file's skeleton once as document nodes: a skeleton-group node plus joint nodes carrying their
// bind-pose local transforms, and one skin whose joints are those node indices. AWD binds a mesh to a
// skeleton through an animator block Flight does not parse yet, so with the common single-skeleton file
// every skinned mesh binds to that one skeleton.
function buildAwd2SkeletonNodes(state: Awd2ParseState): void {
  if (state.skeletons.size === 0) return;
  const built = buildAwdSkeletonDocument(state.skeletons.values().next().value!, state.document, state.diagnostics);
  state.skeletonJointNodeIndices = built.jointNodeIndices;
  state.skinIndex = state.document.skins.length;
  state.document.skins.push(built.skin);
  state.document.scenes[0].rootNodes.push(built.skeletonRootIndex);
  if (state.skeletons.size > 1) {
    reportImportDiagnostic(state.diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.multiple-skeletons', 'parseAwd2', {
      skeletons: state.skeletons.size,
    });
  }
}

// Parses a Skeleton block (type 101). Layout:
// name(VarString) → jointCount(uint16) → NumAttrList → per joint:
//   jointId(uint16) → parentId(uint16, 1-based, 0=root) → name(VarString)
//   → matrix4x3(12 × floatSize) → NumAttrList → UserAttrList
function parseSkeletonBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): Awd2ParsedSkeleton | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-truncated',
      'parseSkeletonBlock',
      {
        field: 'name',
      },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-truncated',
      'parseSkeletonBlock',
      {
        field: 'jointCount',
      },
    );
    return null;
  }
  const jointCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const joints: Awd2ParsedJoint[] = [];
  for (let j = 0; j < jointCount; j++) {
    // Joint ID (sequential, 0-based).
    if (offset + 4 > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-truncated',
        'parseSkeletonBlock',
        {
          field: 'jointFields',
        },
      );
      return null;
    }
    offset += 2; // skip jointId (implicit from array position)
    const parentIndex = dv.getUint16(offset, true);
    offset += 2;

    if (offset + 2 > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-truncated',
        'parseSkeletonBlock',
        {
          field: 'jointName',
        },
      );
      return null;
    }
    const jointNameResult = readAwdString(view, source, offset);
    offset = jointNameResult.end;

    const floatSize = matrixWide ? 8 : 4;
    if (offset + 12 * floatSize > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-truncated',
        'parseSkeletonBlock',
        {
          field: 'jointTransform',
        },
      );
      return null;
    }
    const transformResult = readAwdTransform(view, offset, matrixWide);
    offset = transformResult.end;

    offset = skipAwdAttrList(view, offset, end);
    offset = skipAwdAttrList(view, offset, end);

    joints.push({
      name: jointNameResult.value,
      parentIndex,
      transform: transformResult.transform,
    });
  }

  return { joints, name: nameResult.value };
}

// Parses a SkeletonPose block (type 102). Layout:
// name(VarString) → jointCount(uint16) → NumAttrList → per joint:
//   hasTransform(uint8) → optional matrix4x3(12 × floatSize)
function parseSkeletonPoseBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): Awd2ParsedSkeletonPose | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-pose-truncated',
      'parseSkeletonPoseBlock',
      {
        field: 'name',
      },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-pose-truncated',
      'parseSkeletonPoseBlock',
      {
        field: 'jointCount',
      },
    );
    return null;
  }
  const jointCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const jointTransforms: (Float64Array | null)[] = [];
  for (let j = 0; j < jointCount; j++) {
    if (offset + 1 > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-pose-truncated',
        'parseSkeletonPoseBlock',
        {
          field: 'hasTransform',
        },
      );
      return null;
    }
    const hasTransform = dv.getUint8(offset);
    offset += 1;

    if (hasTransform !== 0) {
      const floatSize = matrixWide ? 8 : 4;
      if (offset + 12 * floatSize > end) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Drop,
          'awd2.skeleton-pose-truncated',
          'parseSkeletonPoseBlock',
          {
            field: 'jointTransform',
          },
        );
        return null;
      }
      const transformResult = readAwdTransform(view, offset, matrixWide);
      offset = transformResult.end;
      jointTransforms.push(transformResult.transform);
    } else {
      jointTransforms.push(null);
    }
  }

  return { jointTransforms, name: nameResult.value };
}

// Parses a SkeletonAnimation block (type 103). Layout:
// name(VarString) → frameCount(uint16) → NumAttrList → per frame:
//   poseBlockId(uint32) → duration(uint16, milliseconds)
function parseSkeletonAnimationBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  diagnostics?: ImportDiagnostic[],
): Awd2ParsedSkeletonAnimation | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-animation-truncated',
      'parseSkeletonAnimationBlock',
      {
        field: 'name',
      },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-animation-truncated',
      'parseSkeletonAnimationBlock',
      {
        field: 'frameCount',
      },
    );
    return null;
  }
  const poseCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const poses: { duration: number; poseBlockId: number }[] = [];
  for (let p = 0; p < poseCount; p++) {
    if (offset + 4 > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-animation-truncated',
        'parseSkeletonAnimationBlock',
        {
          field: 'poseBlockId',
        },
      );
      return null;
    }
    const poseBlockId = dv.getUint32(offset, true);
    offset += 4;

    if (offset + 2 > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-animation-truncated',
        'parseSkeletonAnimationBlock',
        {
          field: 'poseDuration',
        },
      );
      return null;
    }
    const duration = dv.getUint16(offset, true);
    offset += 2;

    poses.push({ duration, poseBlockId });
  }

  return { name: nameResult.value, poses };
}

// Emits an AWD skeleton block into a Scene3DDocument as a "skeleton" group node + one joint node per AWD
// joint (with its bind-pose local transform), plus a Scene3DDocumentSkin whose joints are those node indices
// and whose inverseBind are the AWD joint matrices (which ARE the inverse bind pose). Appends the nodes to
// `document.nodes` and returns the skeleton-group node index, the joint node indices (in AWD joint order,
// for animation binding), and the skin. The parent chain is wired through the joint nodes' `children` index
// lists (AWD parent index is 1-based, 0 = root; roots hang under the group). Each joint's LOCAL transform
// is seeded to the bind pose so the skinned mesh renders undeformed until the animation poses the joints —
// the same math the live scene path used, decomposed to a Transform3D for the document node.
function buildAwdSkeletonDocument(
  parsedSkeleton: Readonly<Awd2ParsedSkeleton>,
  document: Scene3DDocument,
  diagnostics: ImportDiagnostic[] | undefined,
): {
  jointNodeIndices: number[];
  skeletonRootIndex: number;
  skin: Scene3DDocumentSkin;
} {
  const jointCount = parsedSkeleton.joints.length;

  const skeletonRootIndex = document.nodes.length;
  document.nodes.push({
    children: [],
    kind: Node3DKind,
    name: 'skeleton',
    transform: createTransform3D(),
  });

  const jointNodeIndices: number[] = [];
  for (let j = 0; j < jointCount; j++) {
    jointNodeIndices.push(document.nodes.length);
    document.nodes.push({
      children: [],
      kind: Node3DKind,
      name: parsedSkeleton.joints[j].name || undefined,
      transform: createTransform3D(),
    });
  }

  for (let j = 0; j < jointCount; j++) {
    const parentIndex1 = parsedSkeleton.joints[j].parentIndex;
    if (parentIndex1 > 0 && parentIndex1 - 1 < jointCount) {
      document.nodes[jointNodeIndices[parentIndex1 - 1]].children.push(jointNodeIndices[j]);
    } else {
      document.nodes[skeletonRootIndex].children.push(jointNodeIndices[j]);
    }
  }

  // The AWD skeleton joint matrix is the joint's INVERSE bind pose (model→joint at bind), not a local
  // transform — see the AWD format and AwayJS's AWDParser (joint.inverseBindPose). So carry it as the skin's
  // explicit inverse-bind palette, and seed each joint's LOCAL transform to the bind pose so the rig renders
  // undeformed until the animation poses the joints. Bind world = inverseBind⁻¹, and a joint's bind-local =
  // parentBindWorld⁻¹ · jointBindWorld (roots use bind world directly). The animation clip then overrides
  // these locals per frame; the skinning palette is jointWorld · inverseBind, which is identity at bind
  // (undeformed) and the pose delta once animated.
  const inverseBind: Matrix4[] = [];
  const bindWorld: Matrix4[] = [];
  for (let j = 0; j < jointCount; j++) {
    const invBind = createMatrix4();
    awdTransformToMatrix4(invBind, parsedSkeleton.joints[j].transform);
    inverseBind.push(invBind);
    const bw = createMatrix4();
    // The joint matrix is raw file data, so it can be singular — a collapsed bind pose, a zero-scale
    // joint, or a corrupt block. `inverseMatrix4` then fills `bw` with NaN and says so; taking the
    // substitute keeps that NaN out of `bindWorld`, which the parent chain below reads and every
    // descendant would otherwise inherit.
    //
    // IDENTITY, not a dropped joint. What is computed here is only the joint's BIND-LOCAL transform,
    // whose stated job is to render the rig undeformed until the animation poses it; identity gives a
    // finite, neutral pose that keeps the joint (and its children) present and animatable. Dropping the
    // joint's influence instead would mean editing the skin — but the palette entry is `inverseBind`,
    // pushed straight from the file above and never derived from this inverse, so influence is not this
    // site's to drop. Recovering here and leaving the palette alone keeps the two independent, which is
    // what lets one bad joint cost its own bind pose rather than the whole model.
    if (!inverseMatrix4(bw, invBind)) {
      setMatrix4Identity(bw);
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'awd2.joint-matrix-singular', 'parseAwd2', {
        joint: parsedSkeleton.joints[j].name || String(j),
        jointIndex: j,
      });
    }
    bindWorld.push(bw);
  }

  const invParent = createMatrix4();
  const local = createMatrix4();
  for (let j = 0; j < jointCount; j++) {
    const parentIndex1 = parsedSkeleton.joints[j].parentIndex;
    if (parentIndex1 > 0 && parentIndex1 - 1 < jointCount) {
      // Every `bindWorld` entry is now either a genuine inverse (hence invertible) or the identity
      // substituted above, so this cannot currently fail. It is still checked rather than trusted: the
      // invariant lives in a different loop, and a later edit that pushes an unvalidated matrix would
      // otherwise reintroduce silent NaN here with nothing to catch it.
      if (!inverseMatrix4(invParent, bindWorld[parentIndex1 - 1])) setMatrix4Identity(invParent);
      multiplyMatrix4(local, invParent, bindWorld[j]);
    } else {
      copyMatrix4(local, bindWorld[j]);
    }
    decomposeMatrix4ToTransform3D(document.nodes[jointNodeIndices[j]].transform, local);
  }

  const skin: Scene3DDocumentSkin = { inverseBind, joints: jointNodeIndices };
  return { jointNodeIndices, skeletonRootIndex, skin };
}

// The file's skeleton animations as document animations, bound by joint node index.
//
// This used to re-walk the whole block stream to find the pose and animation blocks, because the first
// walk did not parse them. The deferred handlers do, so the blocks are already in the state and the
// second walk is gone — which is the duplication the composable registry was meant to remove, not just
// a tidier way to spell it.
function buildAwd2DocumentAnimations(state: Awd2ParseState): Scene3DDocumentAnimation[] {
  const skeleton = state.skeletons.values().next().value;
  if (skeleton === undefined || state.skeletonAnimations.size === 0) return [];
  const jointCount = skeleton.joints.length;

  const animations: Scene3DDocumentAnimation[] = [];
  let index = 0;
  for (const parsedAnimation of state.skeletonAnimations.values()) {
    const built = buildAwdDocumentAnimation(
      parsedAnimation,
      jointCount,
      state.skeletonPoses,
      state.skeletonJointNodeIndices,
      state.diagnostics,
    );
    if (built !== null) {
      built.name = parsedAnimation.name || `animation${index}`;
      animations.push(built);
    }
    index++;
  }
  return animations;
}

// Builds one Scene3DDocumentAnimation from a parsed AWD skeleton-animation block: samples each pose's per-joint
// local matrix into a translation + rotation track bound to the matching joint node INDEX. Null when it has
// no poses. Mirrors buildAwdSkeletonAnimationClip's per-joint sampling, emitting document channels.
function buildAwdDocumentAnimation(
  parsedAnimation: Readonly<Awd2ParsedSkeletonAnimation>,
  jointCount: number,
  poseBlocks: ReadonlyMap<number, Awd2ParsedSkeletonPose>,
  jointNodeIndices: readonly number[],
  diagnostics?: ImportDiagnostic[],
): Scene3DDocumentAnimation | null {
  const poseCount = parsedAnimation.poses.length;
  if (poseCount === 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.animation-no-poses',
      'buildAwdDocumentAnimation',
    );
    return null;
  }

  const times: number[] = [];
  let timeAccumulator = 0;
  for (let p = 0; p < poseCount; p++) {
    times.push(timeAccumulator);
    timeAccumulator += parsedAnimation.poses[p].duration / 1000;
  }

  const poseMatrix = createMatrix4();
  const poseTransform = createTransform3D();
  const channels: Scene3DDocumentAnimationChannel[] = [];
  // See buildAwdSkeletonAnimationClip: aggregate the distinct missing pose blocks, report once.
  const missingPoseBlocks = diagnostics ? new Set<number>() : null;
  for (let j = 0; j < jointCount; j++) {
    if (j >= jointNodeIndices.length) break;
    const translationValues: number[] = [];
    const rotationValues: number[] = [];
    const scaleValues: number[] = [];
    let hasScale = false;
    for (let p = 0; p < poseCount; p++) {
      const poseBlockId = parsedAnimation.poses[p].poseBlockId;
      const pose = poseBlocks.get(poseBlockId);
      if (pose === undefined) {
        missingPoseBlocks?.add(poseBlockId);
        translationValues.push(0, 0, 0);
        rotationValues.push(0, 0, 0, 1);
        scaleValues.push(1, 1, 1);
      } else if (j < pose.jointTransforms.length && pose.jointTransforms[j] !== null) {
        const transform = pose.jointTransforms[j]!;
        translationValues.push(transform[9], transform[10], transform[11]);
        // Decompose rotation + scale from the pose basis (see the live-clip path for why decompose,
        // not setQuaternionFromMatrix4 alone).
        awdTransformToMatrix4(poseMatrix, transform);
        decomposeMatrix4ToTransform3D(poseTransform, poseMatrix);
        rotationValues.push(
          poseTransform.rotation.x,
          poseTransform.rotation.y,
          poseTransform.rotation.z,
          poseTransform.rotation.w,
        );
        scaleValues.push(poseTransform.scale.x, poseTransform.scale.y, poseTransform.scale.z);
        if (hasNonUnitScale(poseTransform.scale.x, poseTransform.scale.y, poseTransform.scale.z)) hasScale = true;
      } else {
        translationValues.push(0, 0, 0);
        rotationValues.push(0, 0, 0, 1);
        scaleValues.push(1, 1, 1);
      }
    }

    const translationTrack: AnimationTrack = createAnimationTrack({
      components: 3,
      times,
      values: translationValues,
    });
    channels.push({
      node: jointNodeIndices[j],
      path: Scene3DAnimationPathTranslation,
      track: translationTrack,
    });

    const rotationTrack: AnimationTrack = createAnimationTrack({
      components: 4,
      quaternion: true,
      times,
      values: rotationValues,
    });
    channels.push({
      node: jointNodeIndices[j],
      path: Scene3DAnimationPathRotation,
      track: rotationTrack,
    });

    if (hasScale) {
      const scaleTrack: AnimationTrack = createAnimationTrack({
        components: 3,
        times,
        values: scaleValues,
      });
      channels.push({
        node: jointNodeIndices[j],
        path: Scene3DAnimationPathScale,
        track: scaleTrack,
      });
    }
  }

  if (missingPoseBlocks !== null && missingPoseBlocks.size > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'awd2.pose-block-missing',
      'buildAwdDocumentAnimation',
      {
        distinctPoseBlocks: missingPoseBlocks.size,
        firstPoseBlock: Math.min(...missingPoseBlocks),
      },
    );
  }
  return { channels, duration: timeAccumulator, name: parsedAnimation.name };
}
