import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  KeyboardEventData,
  ListController,
  ListControllerOptions,
  ListControllerSignals,
  Node2D,
  ScrollBarController,
} from '@flighthq/types/contract';

import {
  connectGuiInteraction,
  connectGuiSignal,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiVisible,
  setGuiVisualProperty,
} from './guiController';
import { getScrollBarControllerSignals } from './scrollBarController';

interface ListControllerFields {
  baseContentY: number;
  content: Node2D | null;
  items: Node2D[];
  scrollBar: ScrollBarController | null;
  selectable: boolean;
  selectedIndex: number;
  signals: ListControllerSignals;
  viewport: Node2D | null;
}

export function createListController(options: Readonly<ListControllerOptions>): ListController {
  const runtime = createGuiControllerRuntime<ListControllerFields>(
    {
      baseContentY: options.content.y,
      content: options.content,
      items: options.items.slice(),
      scrollBar: options.scrollBar ?? null,
      selectable: options.selectable ?? true,
      selectedIndex: normalizeListIndex(options.selectedIndex ?? -1, options.items.length),
      signals: { onActivate: createSignal(), onSelect: createSignal() },
      viewport: options.viewport,
    },
    options.transition,
  );
  const controller = createGuiController<ListController, typeof runtime>(runtime);
  runtime.items.forEach((item, index) => {
    connectGuiInteraction(runtime, item, 'onClick', () => {
      if (runtime.selectable) setListControllerSelectedIndex(controller, index);
    });
    connectGuiInteraction(runtime, item, 'onDoubleClick', () => emitSignal(runtime.signals.onActivate, index));
    connectGuiInteraction(runtime, item, 'onKeyDown', (data: Readonly<KeyboardEventData>) => {
      handleListControllerKeyDown(controller, data);
    });
  });
  connectGuiInteraction(runtime, options.viewport, 'onKeyDown', (data: Readonly<KeyboardEventData>) => {
    handleListControllerKeyDown(controller, data);
  });
  if (runtime.scrollBar !== null) {
    connectGuiSignal(runtime, getScrollBarControllerSignals(runtime.scrollBar).onChange, (value) => {
      setGuiVisualProperty(runtime, runtime.content, 'y', runtime.baseContentY - value);
    });
  }
  return controller;
}

export function disposeListController(controller: ListController): void {
  const runtime = getGuiControllerRuntime<ListControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.content = null;
    runtime.items.length = 0;
    runtime.scrollBar = null;
    runtime.viewport = null;
  });
}

export function getListControllerSelectedIndex(controller: ListController): number {
  return getGuiControllerRuntime<ListControllerFields>(controller).selectedIndex;
}

export function getListControllerSignals(controller: ListController): Readonly<ListControllerSignals> {
  return getGuiControllerRuntime<ListControllerFields>(controller).signals;
}

export function setListControllerSelectedIndex(controller: ListController, index: number): void {
  const runtime = getGuiControllerRuntime<ListControllerFields>(controller);
  const next = normalizeListIndex(index, runtime.items.length);
  if (runtime.selectedIndex === next || runtime.disposed) return;
  runtime.selectedIndex = next;
  emitSignal(runtime.signals.onSelect, next);
}

// Package-private composition seam used by ComboBoxController. It changes only caller-owned visual
// visibility; it does not create or parent the list parts.
export function setListControllerVisible(controller: ListController, visible: boolean): void {
  const runtime = getGuiControllerRuntime<ListControllerFields>(controller);
  setGuiVisible(runtime, runtime.viewport, visible);
  setGuiVisible(runtime, runtime.content, visible);
}

function handleListControllerKeyDown(controller: ListController, data: Readonly<KeyboardEventData>): void {
  const runtime = getGuiControllerRuntime<ListControllerFields>(controller);
  if (data.key === 'ArrowDown')
    setListControllerSelectedIndex(controller, Math.min(runtime.items.length - 1, runtime.selectedIndex + 1));
  else if (data.key === 'ArrowUp') setListControllerSelectedIndex(controller, Math.max(0, runtime.selectedIndex - 1));
  else if (data.key === 'Home') setListControllerSelectedIndex(controller, runtime.items.length === 0 ? -1 : 0);
  else if (data.key === 'End') setListControllerSelectedIndex(controller, runtime.items.length - 1);
  else if (data.key === 'Enter' && runtime.selectedIndex >= 0)
    emitSignal(runtime.signals.onActivate, runtime.selectedIndex);
}

function normalizeListIndex(index: number, length: number): number {
  return index >= 0 && index < length ? index : -1;
}
