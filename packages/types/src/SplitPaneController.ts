import type { Entity } from './Entity';
import type { GuiControllerOptions, GuiOrientation } from './GuiController';
import type { Node2D } from './Node2D';
import type { Signal } from './Signal';

declare const SplitPaneControllerTypeKey: unique symbol;

export interface SplitPaneController extends Entity {
  readonly [SplitPaneControllerTypeKey]?: void;
}

export interface SplitPaneControllerOptions extends GuiControllerOptions {
  divider: Node2D;
  firstRegion: Node2D;
  maximumFirst?: number;
  minimumFirst?: number;
  minimumSecond?: number;
  orientation?: GuiOrientation;
  position?: number;
  secondRegion: Node2D;
  totalSize?: number;
}

export interface SplitPaneControllerSignals {
  onChange: Signal<(position: number) => void>;
}
