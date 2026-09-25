import type { Entity } from './Entity.ts';
import type { GuiControllerOptions, GuiOrientation } from './GuiController.ts';
import type { Node2D } from './Node2D.ts';
import type { Signal } from './Signal.ts';

declare const ScrollBarControllerTypeKey: unique symbol;

export interface ScrollBarController extends Entity {
  readonly [ScrollBarControllerTypeKey]?: void;
}

export interface ScrollBarControllerOptions extends GuiControllerOptions {
  downButton?: Node2D;
  lineSize?: number;
  maximum?: number;
  minimum?: number;
  orientation?: GuiOrientation;
  pageSize?: number;
  repeatInterval?: number;
  thumb: Node2D;
  track: Node2D;
  upButton?: Node2D;
  value?: number;
}

export interface ScrollBarControllerSignals {
  onChange: Signal<(value: number) => void>;
}
