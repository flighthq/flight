import type { Entity } from './Entity';
import type { GuiControllerOptions, GuiOrientation } from './GuiController';
import type { Node2D } from './Node2D';
import type { Signal } from './Signal';

declare const SliderControllerTypeKey: unique symbol;

export interface SliderController extends Entity {
  readonly [SliderControllerTypeKey]?: void;
}

export interface SliderControllerOptions extends GuiControllerOptions {
  maximum?: number;
  minimum?: number;
  orientation?: GuiOrientation;
  step?: number;
  thumb: Node2D;
  track: Node2D;
  value?: number;
}

export interface SliderControllerSignals {
  onChange: Signal<(value: number) => void>;
}
