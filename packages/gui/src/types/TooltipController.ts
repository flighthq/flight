import type { Vector2Like } from '@flighthq/geometry/contract';
import type { Node2D } from '@flighthq/scene2d/contract';

import type { GuiControllerOptions } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';

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
