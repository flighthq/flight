import type { AnimationClip } from './AnimationClip';
import type { Entity, EntityRuntime } from './Entity';
import type { Node3D } from './Node3D';
import type { Scene3DMetadata } from './Scene3DMetadata';

// A Scene3D is a 3D content document, not a node in the graph: it owns a `root` Node3D plus the sidecar data
// a model file carries alongside geometry — `animations` and provenance `metadata`. Materials and cameras are
// deliberately absent: they live on the nodes in `root` and are reached by walking it, so they are not
// duplicated here. Because a Scene3D is an Entity rather than a Node3D it cannot be nested as a child —
// grafting imported content into a world is `addNodeChild(world.root, loaded.root)`, and the loaded document
// keeps its clips.
//
// `animations` is a name→clip map (a plain, mutable Record) — the animation library the scene owns. Read and
// write it directly: `scene.animations['walk']`, `scene.animations['walk'] = clip`, `'walk' in
// scene.animations`, `delete scene.animations['walk']`. The clip stays anonymous bedrock; the action name is
// the map key, not a field on the clip. In-file formats (glTF, AWD) key by the file's animation name;
// split-file formats (MD5) leave it empty and the caller composes (parse the `.md5anim`, then assign a key).
export interface Scene3D extends Entity {
  animations: Record<string, AnimationClip>;
  metadata: Scene3DMetadata | null;
  root: Node3D;
}

export type Scene3DRuntime = EntityRuntime;
