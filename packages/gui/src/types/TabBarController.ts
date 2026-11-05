import type { Node2D } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { GuiControllerOptions } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';

declare const TabBarControllerTypeKey: unique symbol;

export interface TabBarController extends Entity {
  readonly [TabBarControllerTypeKey]?: void;
}

export interface TabBarControllerItem {
  selectedState: Node2D;
  unselectedState: Node2D;
}

export interface TabBarControllerOptions extends GuiControllerOptions {
  selectedIndex?: number;
  tabs: readonly Readonly<TabBarControllerItem>[];
}

export interface TabBarControllerSignals {
  onChange: Signal<number>;
}
