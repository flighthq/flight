import type { FocusManager } from '@flighthq/interaction/contract';
import type { Node2D } from '@flighthq/scene2d/contract';
import type { Signal } from '@flighthq/signals/contract';

import type { GuiControllerOptions } from './GuiController.ts';
import type { GuiEntity as Entity } from './GuiEntity.ts';

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
