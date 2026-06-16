import type { Node, NodeTraits } from './Node';
import type { SceneAlign } from './SceneAlign';
import type { SceneScaleMode } from './SceneScaleMode';

export interface Scene<Traits extends object = NodeTraits> {
  align: SceneAlign;
  root: Node<Traits> | null;
  scaleMode: SceneScaleMode;
}
