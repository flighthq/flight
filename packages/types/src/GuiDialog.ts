import type { Entity } from './Entity.ts';
import type { FocusManager } from './FocusManager.ts';
import type { GuiControllerOptions } from './GuiController.ts';
import type { Node2D } from './Node2D.ts';
import type { Signal } from './Signal.ts';

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
  readonly onActiveChange: Signal<Readonly<GuiDialogEntry> | null>;
  readonly onClose: Signal<Readonly<GuiDialogCloseResult>>;
  readonly onQueueChange: Signal<void>;
}
