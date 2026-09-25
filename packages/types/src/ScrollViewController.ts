import type { Entity } from './Entity.ts';
import type { GuiControllerOptions } from './GuiController.ts';
import type { Node2D } from './Node2D.ts';
import type { ScrollBarController } from './ScrollBarController.ts';
import type { Signal } from './Signal.ts';

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
