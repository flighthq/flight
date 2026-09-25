import type { Entity } from './Entity.ts';
import type { GuiControllerOptions } from './GuiController.ts';
import type { Node2D } from './Node2D.ts';
import type { Vector2Like } from './Vector2.ts';

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
