import type { Entity } from './Entity';
import type { GuiControllerOptions } from './GuiController';
import type { Node2D } from './Node2D';
import type { Vector2Like } from './Vector2';

declare const TooltipControllerTypeKey: unique symbol;

export interface TooltipController extends Entity {
  readonly [TooltipControllerTypeKey]?: void;
}

export interface TooltipControllerOptions extends GuiControllerOptions {
  content: Node2D;
  delay?: number;
  offset?: Readonly<Vector2Like>;
  target: Node2D;
}
