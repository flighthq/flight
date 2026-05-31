import type { MouseWheelMode } from './MouseWheelMode';
import type { PointerType } from './PointerData';

export interface InputPointerData {
  altKey: boolean;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  deltaX: number;
  deltaY: number;
  isPrimary: boolean;
  metaKey: boolean;
  pointerId: number;
  pointerType: PointerType;
  shiftKey: boolean;
  wheelMode: MouseWheelMode;
  x: number;
  y: number;
}
