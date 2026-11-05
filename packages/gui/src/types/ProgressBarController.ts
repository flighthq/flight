import type { Node2D } from '@flighthq/scene2d/contract';

import type { GuiControllerOptions, GuiOrientation } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';

declare const ProgressBarControllerTypeKey: unique symbol;

export interface ProgressBarController extends Entity {
  readonly [ProgressBarControllerTypeKey]?: void;
}

export interface ProgressBarControllerOptions extends GuiControllerOptions {
  fill: Node2D;
  maximum?: number;
  minimum?: number;
  orientation?: GuiOrientation;
  track: Node2D;
  value?: number;
}
