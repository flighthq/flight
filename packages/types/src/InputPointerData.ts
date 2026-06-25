import type { MouseWheelMode } from './MouseWheelMode';
import type { PointerType } from './PointerEventData';

export interface InputPointerData {
  altKey: boolean;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  deltaX: number;
  deltaY: number;
  height: number;
  isPrimary: boolean;
  metaKey: boolean;
  pointerId: number;
  pointerType: PointerType;
  pressure: number;
  shiftKey: boolean;
  tiltX: number;
  tiltY: number;
  timeStamp: number;
  twist: number;
  wheelMode: MouseWheelMode;
  width: number;
  x: number;
  y: number;
}
