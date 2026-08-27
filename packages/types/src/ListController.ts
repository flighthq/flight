import type { Entity } from './Entity';
import type { GuiControllerOptions } from './GuiController';
import type { Node2D } from './Node2D';
import type { ScrollBarController } from './ScrollBarController';
import type { Signal } from './Signal';

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
  onActivate: Signal<(index: number) => void>;
  onSelect: Signal<(index: number) => void>;
}
