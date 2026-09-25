import type { Entity } from './Entity.ts';
import type { GuiControllerOptions } from './GuiController.ts';
import type { Node2D } from './Node2D.ts';
import type { Signal } from './Signal.ts';

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
