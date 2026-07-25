import { getNodeChildren } from '@flighthq/node';
import { isMesh } from '@flighthq/scene';
import type { Mesh, SceneNode } from '@flighthq/types';

// Walks a built scene for the first skinned mesh and returns its skeleton's joint nodes — the same node
// handles the skin was bound to, so an animation clip bound to them deforms the mesh. Null when the scene
// has no skinned mesh.
//
// This is the PUBLIC joint-finder for the multi-clip skeletal-import workflow: import the mesh once, then
// bind several animations to its skeleton by name-safe joint handles rather than re-collecting them by
// hand. For a single `.md5anim` prefer the `importMd5Mesh(meshSource, animSource)` composer, which uses
// this internally; for MULTIPLE clips against one mesh, `createSceneFromMd5Mesh` produces a scene with no
// animation, and this finds the joints each `parseMd5Anim` binds to:
//
//   const scene = createSceneFromMd5Mesh(meshSource);
//   const joints = findSceneSkeletonJoints(scene.root)!;
//   scene.animations['walk'] = parseMd5Anim(walkSource, joints)!;
//   scene.animations['run'] = parseMd5Anim(runSource, joints)!;
//
// Use this rather than hand-rolling `getNodeChildByName(root, 'skeleton')` + a manual descendant walk: the
// MD5/AWD anim binders match channels to joints by NAME, so any joint set carrying the right names works,
// but this returns the skin's own joint array directly — the canonical, order-and-name-correct handle set.
export function findSceneSkeletonJoints(root: Readonly<SceneNode>): readonly SceneNode[] | null {
  const stack: SceneNode[] = [...getNodeChildren(root)];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (isMesh(node)) {
      const skin = (node as unknown as Mesh).skin;
      if (skin != null) return skin.skeleton.joints;
    }
    stack.push(...getNodeChildren(node));
  }
  return null;
}
