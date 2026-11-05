import type { Node2D } from './Node2D.ts';
import type { Node2DAnimationPath } from './Node2DAnimationPath.ts';
export interface Node2DAnimationTarget {
  node: Node2D;
  path: Node2DAnimationPath;
}
