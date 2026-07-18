import type { Scene } from '@flighthq/scene';
import type { AnimationClip } from '@flighthq/types';

// The result of importing a model file whose format carries more than geometry: the scene(s) plus the
// animation clips that drive them. It is the assembly layer's return shape — `import<Format>` functions
// (importGltf, importAwd, …) produce it, parsing once so the clips' targetRefs reference the very same
// SceneNode instances that live in `scene`/`scenes` (node identity never leaves the importer). The
// geometry-only `createSceneFrom<Format>` primitives stay separate so a caller that only wants the
// scene tree-shakes the animation code out entirely.
//
// `scene` is the file's primary/default scene; `scenes` lists every scene it declares (a one-element
// array for the single-scene formats, the full set for glTF). `animations` is empty when the file
// declares none.
export interface SceneImport {
  animations: readonly AnimationClip[];
  scene: Scene;
  scenes: readonly Scene[];
}
