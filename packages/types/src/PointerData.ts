import type { Node } from './Node';

export interface PointerData {
  altKey: boolean;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  currentTarget: Node<symbol, object> | null;
  deltaX: number;
  deltaY: number;
  localX: number;
  localY: number;
  metaKey: boolean;
  pointerId: number;
  pointerType: PointerType;
  shiftKey: boolean;
  target: Node<symbol, object> | null;
  worldX: number;
  worldY: number;
  x: number;
  y: number;
}

export type PointerType = 'mouse' | 'pen' | 'touch' | 'unknown';
