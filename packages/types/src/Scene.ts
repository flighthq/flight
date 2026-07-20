import type { AnimationClip } from './AnimationClip';
import type { Entity, EntityRuntime } from './Entity';
import type { SceneMetadata } from './SceneMetadata';
import type { SceneNode } from './SceneNode';

// A Scene is a 3D content document, not a node in the graph: it owns a `root` SceneNode plus the sidecar data
// a model file carries alongside geometry — `animations` (cross-cutting clips whose channels target nodes
// throughout the tree, with no other home) and provenance `metadata`. Materials and cameras are deliberately
// absent: they live on the nodes in `root` and are reached by walking it, so they are not duplicated here.
// Because a Scene is an Entity rather than a SceneNode it cannot be nested as a child — grafting imported
// content into a world is `addNodeChild(world.root, loaded.root)`, and the loaded document keeps its clips.
export interface Scene extends Entity {
  animations: readonly AnimationClip[];
  metadata: SceneMetadata | null;
  root: SceneNode;
}

export type SceneRuntime = EntityRuntime;
