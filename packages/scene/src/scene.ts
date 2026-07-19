import type { SceneNode } from '@flighthq/types';
import { SceneNodeKind } from '@flighthq/types';

import { createSceneNode } from './sceneNode';

// The 3D scene-graph root. A Scene is just a SceneNode at the top of the hierarchy — "what
// exists" — with no observer state of its own (the camera and lights are draw-arguments, not
// scene members). It is a transform-only group node; Mesh and bare SceneNode children attach to
// it with addNodeChild and render via prepareSceneRender + drawScene.
//
// (Distinct from @flighthq/node's 2D `Scene` align/scaleMode descriptor; this is the 3D node
// family's root, so it is a SceneNode, not a layout wrapper.)
export type Scene = SceneNode;

// Allocates a Scene root node. Defaults to SceneNodeKind so it participates in the SceneNode
// hierarchy family; pass a custom kind to introduce a custom root node type, and optional initial
// `enabled`/`name`. The returned node has an identity transform and no children.
export function createScene(obj?: Readonly<Partial<Pick<Scene, 'enabled' | 'name'>>>): Scene {
  return createSceneNode(SceneNodeKind, obj);
}
