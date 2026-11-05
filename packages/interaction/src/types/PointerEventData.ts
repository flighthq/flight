import type { PointerType } from '@flighthq/input/contract';
import type { NodeAny } from '@flighthq/node/contract';

export interface PointerEventData {
  altKey: boolean;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  currentTarget: NodeAny | null;
  deltaX: number;
  deltaY: number;
  localX: number;
  localY: number;
  metaKey: boolean;
  pointerId: number;
  pointerType: PointerType;
  shiftKey: boolean;
  target: NodeAny | null;
  worldX: number;
  worldY: number;
  x: number;
  y: number;
}
