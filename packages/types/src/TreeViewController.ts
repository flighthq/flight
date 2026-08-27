import type { Entity } from './Entity';
import type { GuiControllerOptions } from './GuiController';
import type { Node2D } from './Node2D';
import type { Signal } from './Signal';

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
  onActivate: Signal<(item: Readonly<TreeViewControllerItem>) => void>;
  onExpandChange: Signal<(item: Readonly<TreeViewControllerItem>, expanded: boolean) => void>;
  onSelect: Signal<(item: Readonly<TreeViewControllerItem> | null) => void>;
}
