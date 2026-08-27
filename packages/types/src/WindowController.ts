import type { ButtonController } from './ButtonController';
import type { Entity } from './Entity';
import type { GuiControllerOptions } from './GuiController';
import type { Node2D } from './Node2D';
import type { Signal } from './Signal';

declare const WindowControllerTypeKey: unique symbol;

export interface WindowController extends Entity {
  readonly [WindowControllerTypeKey]?: void;
}

export interface WindowControllerOptions extends GuiControllerOptions {
  closeButton?: ButtonController;
  content?: Node2D;
  draggable?: boolean;
  frame: Node2D;
  minimumHeight?: number;
  minimumWidth?: number;
  resizable?: boolean;
  resizeHandle?: Node2D;
  titleBar?: Node2D;
}

export interface WindowControllerSignals {
  onClose: Signal<() => void>;
  onMove: Signal<(x: number, y: number) => void>;
  onResize: Signal<(width: number, height: number) => void>;
}
