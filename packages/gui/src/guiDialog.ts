import { getFocusedNode, setFocusedNode } from '@flighthq/interaction/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  FocusManager,
  GuiDialog,
  GuiDialogCloseResult,
  GuiDialogEntry,
  GuiDialogOptions,
  GuiDialogSignals,
  Node2D,
} from '@flighthq/types/contract';

import {
  connectGuiInteraction,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiVisible,
} from './guiController';

interface GuiDialogFields {
  backdrop: Node2D | null;
  entries: Array<Readonly<GuiDialogEntry>>;
  focusManager: FocusManager<Node2D> | null;
  hasFocusSnapshot: boolean;
  previousFocus: Node2D | null;
  signals: GuiDialogSignals;
}

export function closeGuiDialog(dialog: GuiDialog, result: Readonly<GuiDialogCloseResult>): boolean {
  const runtime = getGuiControllerRuntime<GuiDialogFields>(dialog);
  const active = runtime.entries[0];
  if (runtime.disposed || active === undefined || active.id !== result.entryId) return false;

  runtime.entries.shift();
  setGuiVisible(runtime, active.root, false);
  const next = runtime.entries[0] ?? null;
  if (next === null) {
    setGuiVisible(runtime, runtime.backdrop, false);
    restoreGuiDialogFocus(runtime);
  } else {
    activateGuiDialogEntry(runtime, next);
  }
  emitSignal(runtime.signals.onActiveChange, next);
  emitSignal(runtime.signals.onQueueChange);
  emitSignal(runtime.signals.onClose, result);
  return true;
}

export function createGuiDialog(options: Readonly<GuiDialogOptions> = {}): GuiDialog {
  const runtime = createGuiControllerRuntime<GuiDialogFields>(
    {
      backdrop: options.backdrop ?? null,
      entries: [],
      focusManager: options.focusManager ?? null,
      hasFocusSnapshot: false,
      previousFocus: null,
      signals: {
        onActiveChange: createSignal(),
        onClose: createSignal(),
        onQueueChange: createSignal(),
      },
    },
    options.transition,
  );
  const dialog = createGuiController<GuiDialog, typeof runtime>(runtime);
  if (runtime.backdrop !== null) {
    connectGuiInteraction(runtime, runtime.backdrop, 'onClick', () => {
      const active = runtime.entries[0];
      if (active?.dismissOnBackdrop !== true) return;
      closeGuiDialog(dialog, { entryId: active.id, reason: 'dismissed' });
    });
  }
  setGuiVisible(runtime, runtime.backdrop, false);
  return dialog;
}

export function disposeGuiDialog(dialog: GuiDialog): void {
  const runtime = getGuiControllerRuntime<GuiDialogFields>(dialog);
  if (runtime.disposed) return;
  for (const entry of runtime.entries) setGuiVisible(runtime, entry.root, false);
  setGuiVisible(runtime, runtime.backdrop, false);
  restoreGuiDialogFocus(runtime);
  disposeGuiController(dialog, () => {
    runtime.backdrop = null;
    runtime.entries.length = 0;
    runtime.focusManager = null;
    runtime.previousFocus = null;
  });
}

export function enqueueGuiDialog(dialog: GuiDialog, entry: Readonly<GuiDialogEntry>): boolean {
  const runtime = getGuiControllerRuntime<GuiDialogFields>(dialog);
  if (runtime.disposed || runtime.entries.some((candidate) => candidate.id === entry.id)) return false;

  const activate = runtime.entries.length === 0;
  runtime.entries.push(entry);
  if (activate) {
    snapshotGuiDialogFocus(runtime);
    activateGuiDialogEntry(runtime, entry);
    emitSignal(runtime.signals.onActiveChange, entry);
  } else {
    setGuiVisible(runtime, entry.root, false);
  }
  emitSignal(runtime.signals.onQueueChange);
  return true;
}

export function getActiveGuiDialogEntry(dialog: GuiDialog): Readonly<GuiDialogEntry> | null {
  return getGuiControllerRuntime<GuiDialogFields>(dialog).entries[0] ?? null;
}

export function getGuiDialogEntries(
  dialog: GuiDialog,
  out: Array<Readonly<GuiDialogEntry>> = [],
): Array<Readonly<GuiDialogEntry>> {
  const entries = getGuiControllerRuntime<GuiDialogFields>(dialog).entries;
  out.length = 0;
  out.push(...entries);
  return out;
}

export function getGuiDialogSignals(dialog: GuiDialog): Readonly<GuiDialogSignals> {
  return getGuiControllerRuntime<GuiDialogFields>(dialog).signals;
}

export function removeGuiDialogEntry(dialog: GuiDialog, id: string): boolean {
  const runtime = getGuiControllerRuntime<GuiDialogFields>(dialog);
  if (runtime.disposed) return false;
  const index = runtime.entries.findIndex((entry, entryIndex) => entryIndex > 0 && entry.id === id);
  if (index < 0) return false;
  const [removed] = runtime.entries.splice(index, 1);
  setGuiVisible(runtime, removed.root, false);
  emitSignal(runtime.signals.onQueueChange);
  return true;
}

function activateGuiDialogEntry(
  runtime: ReturnType<typeof getGuiControllerRuntime<GuiDialogFields>>,
  entry: Readonly<GuiDialogEntry>,
): void {
  setGuiVisible(runtime, entry.root, true);
  setGuiVisible(runtime, runtime.backdrop, true);
  if (runtime.focusManager !== null && entry.initialFocus !== undefined)
    setFocusedNode(runtime.focusManager, entry.initialFocus);
}

function restoreGuiDialogFocus(runtime: ReturnType<typeof getGuiControllerRuntime<GuiDialogFields>>): void {
  if (!runtime.hasFocusSnapshot || runtime.focusManager === null) return;
  setFocusedNode(runtime.focusManager, runtime.previousFocus);
  runtime.hasFocusSnapshot = false;
  runtime.previousFocus = null;
}

function snapshotGuiDialogFocus(runtime: ReturnType<typeof getGuiControllerRuntime<GuiDialogFields>>): void {
  if (runtime.focusManager === null) return;
  runtime.previousFocus = getFocusedNode(runtime.focusManager);
  runtime.hasFocusSnapshot = true;
}
