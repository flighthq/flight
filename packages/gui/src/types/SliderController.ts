import type { Node2D } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { GuiControllerOptions, GuiOrientation } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';

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
  onChange: Signal<number>;
}
