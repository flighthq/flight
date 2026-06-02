import type { SceneNode } from './SceneNode';

export interface PointerData {
  altKey: boolean;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  currentTarget: SceneNode<symbol, object> | null;
  deltaX: number;
  deltaY: number;
  localX: number;
  localY: number;
  metaKey: boolean;
  pointerId: number;
  pointerType: PointerType;
  shiftKey: boolean;
  target: SceneNode<symbol, object> | null;
  worldX: number;
  worldY: number;
  x: number;
  y: number;
}

export type PointerType = 'mouse' | 'pen' | 'touch' | 'unknown';
