import type { GraphNode } from './GraphNode';

export interface PointerData {
  altKey: boolean;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  currentTarget: GraphNode<symbol, object> | null;
  deltaX: number;
  deltaY: number;
  localX: number;
  localY: number;
  metaKey: boolean;
  pointerId: number;
  pointerType: PointerType;
  shiftKey: boolean;
  target: GraphNode<symbol, object> | null;
  worldX: number;
  worldY: number;
  x: number;
  y: number;
}

export type PointerType = 'mouse' | 'pen' | 'touch' | 'unknown';
