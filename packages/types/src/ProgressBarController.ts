import type { Entity } from './Entity';
import type { GuiControllerOptions, GuiOrientation } from './GuiController';
import type { Node2D } from './Node2D';

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
