import type { Node2D } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { GuiControllerOptions } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';
import type { ScrollBarController } from './ScrollBarController.ts';

declare const ListControllerTypeKey: unique symbol;

export interface ListController extends Entity {
  readonly [ListControllerTypeKey]?: void;
}

export interface ListControllerOptions extends GuiControllerOptions {
  content: Node2D;
  items: readonly Node2D[];
  scrollBar?: ScrollBarController;
  selectable?: boolean;
  selectedIndex?: number;
  viewport: Node2D;
}

export interface ListControllerSignals {
  onActivate: Signal<number>;
  onSelect: Signal<number>;
}
