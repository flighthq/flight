import type { NullScene, SceneNode } from './SceneNode';
import type { SceneAlign } from './SceneAlign';
import type { SceneScaleMode } from './SceneScaleMode';

export interface Scene<SceneKind extends symbol = typeof NullScene> {
  align: SceneAlign;
  root: SceneNode<SceneKind> | null;
  scaleMode: SceneScaleMode;
}
