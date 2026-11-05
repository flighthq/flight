import type { Node2D } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { GuiControllerOptions } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';

declare const TreeViewControllerTypeKey: unique symbol;

export interface TreeViewController extends Entity {
  readonly [TreeViewControllerTypeKey]?: void;
}

export interface TreeViewControllerItem {
  children?: readonly Readonly<TreeViewControllerItem>[];
  expanded?: boolean;
  visual: Node2D;
}

export interface TreeViewControllerOptions extends GuiControllerOptions {
  items: readonly Readonly<TreeViewControllerItem>[];
  selectedItem?: TreeViewControllerItem | null;
}

export interface TreeViewControllerSignals {
  onActivate: Signal<Readonly<TreeViewControllerItem>>;
  onExpandChange: Signal<readonly [item: Readonly<TreeViewControllerItem>, expanded: boolean]>;
  onSelect: Signal<Readonly<TreeViewControllerItem> | null>;
}
