import { createEntity } from '@flighthq/entity';
import type { Scene, SceneNode } from '@flighthq/types';
import { SceneNodeKind } from '@flighthq/types';

import { createSceneNode } from './sceneNode';

// Re-export the Scene document type so `@flighthq/scene` stays its import site.
export type { Scene } from '@flighthq/types';

// Allocates a Scene: a 3D content document Entity that owns a `root` SceneNode (allocated here), not a node in
// the graph. Composes createEntity for the runtime slot; `animations`/`metadata` start empty and the importers
// (`createSceneFrom*`) fill them. `obj` configures the root node (`enabled`/`name`).
export function createScene(obj?: Readonly<Partial<Pick<SceneNode, 'enabled' | 'name'>>>): Scene {
  const root = createSceneNode(SceneNodeKind, obj);
  return createEntity({ animations: [] as readonly never[], metadata: null, root }) as Scene;
}
