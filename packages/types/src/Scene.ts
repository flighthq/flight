import type { Node, NullScene } from './Node';
import type { SceneAlign } from './SceneAlign';
import type { SceneScaleMode } from './SceneScaleMode';

export interface Scene<Kind extends symbol = typeof NullScene> {
  align: SceneAlign;
  root: Node<Kind> | null;
  scaleMode: SceneScaleMode;
}
