import type { SceneNode } from './SceneNode';
export interface SceneRaycastOptions {
  backfaceCull?: boolean;
  maxDistance?: number;
  predicate?: (node: Readonly<SceneNode>) => boolean;
}
