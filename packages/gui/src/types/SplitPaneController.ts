import type { Node2D } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { GuiControllerOptions, GuiOrientation } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';

declare const SplitPaneControllerTypeKey: unique symbol;

export interface SplitPaneController extends Entity {
  readonly [SplitPaneControllerTypeKey]?: void;
}

export interface SplitPaneControllerOptions extends GuiControllerOptions {
  divider: Node2D;
  firstRegion: Node2D;
  maximumFirst?: number;
  minimumFirst?: number;
  minimumSecond?: number;
  orientation?: GuiOrientation;
  position?: number;
  secondRegion: Node2D;
  totalSize?: number;
}

export interface SplitPaneControllerSignals {
  onChange: Signal<number>;
}
