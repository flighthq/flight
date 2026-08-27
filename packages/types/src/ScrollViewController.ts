import type { Entity } from './Entity';
import type { GuiControllerOptions } from './GuiController';
import type { Node2D } from './Node2D';
import type { ScrollBarController } from './ScrollBarController';
import type { Signal } from './Signal';

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
  onScroll: Signal<(x: number, y: number) => void>;
}
