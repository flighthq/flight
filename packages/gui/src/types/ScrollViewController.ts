import type { Node2D } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { GuiControllerOptions } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';
import type { ScrollBarController } from './ScrollBarController.ts';

declare const ScrollViewControllerTypeKey: unique symbol;

export interface ScrollViewController extends Entity {
  readonly [ScrollViewControllerTypeKey]?: void;
}

export interface ScrollViewControllerOptions extends GuiControllerOptions {
  content: Node2D;
  horizontalScrollBar?: ScrollBarController;
  mouseWheelEnabled?: boolean;
  viewport: Node2D;
  verticalScrollBar?: ScrollBarController;
}

export interface ScrollViewControllerSignals {
  onScroll: Signal<readonly [x: number, y: number]>;
}
