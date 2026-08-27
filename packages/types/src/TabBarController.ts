import type { Entity } from './Entity';
import type { GuiControllerOptions } from './GuiController';
import type { Node2D } from './Node2D';
import type { Signal } from './Signal';

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
  onChange: Signal<(index: number) => void>;
}
