import type { Signal } from '@flighthq/signals/contract';

import type { Entity } from './Entity.ts';
import type { GuiControllerOptions } from './GuiController.ts';
import type { Node2D } from './Node2D.ts';

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
