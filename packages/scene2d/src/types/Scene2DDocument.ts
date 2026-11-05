import type { Node2D } from './Node2D.ts';
import type { Scene2DEntity } from './Scene2DEntity.ts';
export interface Scene2DSlotReference extends Scene2DEntity {
  content: Node2D | null;
  linkage: string | null;
  name: string;
  required: boolean;
  target: Node2D;
}
