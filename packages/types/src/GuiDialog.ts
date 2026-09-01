import type { Entity } from './Entity';
import type { FocusManager } from './FocusManager';
import type { GuiControllerOptions } from './GuiController';
import type { Node2D } from './Node2D';
import type { Signal } from './Signal';

declare const GuiDialogTypeKey: unique symbol;

export interface GuiDialog extends Entity {
  readonly [GuiDialogTypeKey]?: void;
}

export type GuiDialogCloseReason = 'accepted' | 'cancelled' | 'dismissed';

export interface GuiDialogCloseResult {
  readonly entryId: string;
  readonly reason: GuiDialogCloseReason;
  readonly value?: unknown;
}

export interface GuiDialogEntry {
  readonly dismissOnBackdrop?: boolean;
  readonly id: string;
  readonly initialFocus?: Node2D;
  readonly root: Node2D;
}

export interface GuiDialogOptions extends GuiControllerOptions {
  readonly backdrop?: Node2D;
  readonly focusManager?: FocusManager<Node2D>;
}

export interface GuiDialogSignals {
  readonly onActiveChange: Signal<(entry: Readonly<GuiDialogEntry> | null) => void>;
  readonly onClose: Signal<(result: Readonly<GuiDialogCloseResult>) => void>;
  readonly onQueueChange: Signal<() => void>;
}
