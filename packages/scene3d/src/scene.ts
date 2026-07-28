import { createEntity } from '@flighthq/entity/contract';
import type { Scene3D, Node3D } from '@flighthq/types/contract';
import { Node3DKind } from '@flighthq/types/contract';

import { createNode3D } from './sceneNode';

// Re-export the Scene3D document type so `@flighthq/scene3d` stays its import site.

// Allocates a Scene3D: a 3D content document Entity that owns a `root` Node3D (allocated here), not a node in
// the graph. Composes createEntity for the runtime slot; `animations`/`metadata` start empty and the importers
// (`createScene3DFrom*`) fill them. `obj` configures the root node (`enabled`/`name`).
export function createScene3D(obj?: Readonly<Partial<Pick<Node3D, 'enabled' | 'name'>>>): Scene3D {
  const root = createNode3D(Node3DKind, obj);
  return createEntity({ animations: {}, metadata: null, resources: [], root }) as Scene3D;
}
