import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  KeyboardEventData,
  TreeViewController,
  TreeViewControllerItem,
  TreeViewControllerOptions,
  TreeViewControllerSignals,
} from '@flighthq/types/contract';

import {
  connectGuiInteraction,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiVisible,
} from './guiController';

interface TreeViewControllerFields {
  expanded: Set<Readonly<TreeViewControllerItem>>;
  items: Array<Readonly<TreeViewControllerItem>>;
  parents: Map<Readonly<TreeViewControllerItem>, Readonly<TreeViewControllerItem> | null>;
  roots: Array<Readonly<TreeViewControllerItem>>;
  selectedItem: Readonly<TreeViewControllerItem> | null;
  signals: TreeViewControllerSignals;
}

export function createTreeViewController(options: Readonly<TreeViewControllerOptions>): TreeViewController {
  const items: Array<Readonly<TreeViewControllerItem>> = [];
  const parents = new Map<Readonly<TreeViewControllerItem>, Readonly<TreeViewControllerItem> | null>();
  const expanded = new Set<Readonly<TreeViewControllerItem>>();
  collectTreeViewItems(options.items, null, items, parents, expanded);
  const runtime = createGuiControllerRuntime<TreeViewControllerFields>(
    {
      expanded,
      items,
      parents,
      roots: options.items.slice(),
      selectedItem: options.selectedItem ?? null,
      signals: {
        onActivate: createSignal(),
        onExpandChange: createSignal(),
        onSelect: createSignal(),
      },
    },
    options.transition,
  );
  const controller = createGuiController<TreeViewController, typeof runtime>(runtime);
  runtime.items.forEach((item) => {
    connectGuiInteraction(runtime, item.visual, 'onClick', () => setTreeViewControllerSelectedItem(controller, item));
    connectGuiInteraction(runtime, item.visual, 'onDoubleClick', () => {
      emitSignal(runtime.signals.onActivate, item);
      if ((item.children?.length ?? 0) > 0) toggleTreeViewControllerItem(controller, item);
    });
    connectGuiInteraction(runtime, item.visual, 'onKeyDown', (data: Readonly<KeyboardEventData>) => {
      handleTreeViewControllerKeyDown(controller, data);
    });
  });
  updateTreeViewControllerVisibility(runtime);
  return controller;
}

export function disposeTreeViewController(controller: TreeViewController): void {
  const runtime = getGuiControllerRuntime<TreeViewControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.expanded.clear();
    runtime.items.length = 0;
    runtime.parents.clear();
    runtime.roots.length = 0;
    runtime.selectedItem = null;
  });
}

export function getTreeViewControllerSelectedItem(
  controller: TreeViewController,
): Readonly<TreeViewControllerItem> | null {
  return getGuiControllerRuntime<TreeViewControllerFields>(controller).selectedItem;
}

export function getTreeViewControllerSignals(controller: TreeViewController): Readonly<TreeViewControllerSignals> {
  return getGuiControllerRuntime<TreeViewControllerFields>(controller).signals;
}

export function isTreeViewControllerItemExpanded(
  controller: TreeViewController,
  item: Readonly<TreeViewControllerItem>,
): boolean {
  return getGuiControllerRuntime<TreeViewControllerFields>(controller).expanded.has(item);
}

export function setTreeViewControllerItemExpanded(
  controller: TreeViewController,
  item: Readonly<TreeViewControllerItem>,
  expanded: boolean,
): void {
  const runtime = getGuiControllerRuntime<TreeViewControllerFields>(controller);
  if (!runtime.parents.has(item) || (item.children?.length ?? 0) === 0 || runtime.disposed) return;
  const previous = runtime.expanded.has(item);
  if (previous === expanded) return;
  if (expanded) runtime.expanded.add(item);
  else runtime.expanded.delete(item);
  updateTreeViewControllerVisibility(runtime);
  emitSignal(runtime.signals.onExpandChange, item, expanded);
}

export function setTreeViewControllerSelectedItem(
  controller: TreeViewController,
  item: Readonly<TreeViewControllerItem> | null,
): void {
  const runtime = getGuiControllerRuntime<TreeViewControllerFields>(controller);
  const next = item !== null && runtime.parents.has(item) ? item : null;
  if (runtime.selectedItem === next || runtime.disposed) return;
  runtime.selectedItem = next;
  emitSignal(runtime.signals.onSelect, next);
}

export function toggleTreeViewControllerItem(
  controller: TreeViewController,
  item: Readonly<TreeViewControllerItem>,
): void {
  setTreeViewControllerItemExpanded(controller, item, !isTreeViewControllerItemExpanded(controller, item));
}

function collectTreeViewItems(
  source: readonly Readonly<TreeViewControllerItem>[],
  parent: Readonly<TreeViewControllerItem> | null,
  items: Array<Readonly<TreeViewControllerItem>>,
  parents: Map<Readonly<TreeViewControllerItem>, Readonly<TreeViewControllerItem> | null>,
  expanded: Set<Readonly<TreeViewControllerItem>>,
): void {
  for (const item of source) {
    items.push(item);
    parents.set(item, parent);
    if (item.expanded === true) expanded.add(item);
    if (item.children !== undefined) collectTreeViewItems(item.children, item, items, parents, expanded);
  }
}

function getVisibleTreeViewItems(
  runtime: ReturnType<typeof getGuiControllerRuntime<TreeViewControllerFields>>,
): Array<Readonly<TreeViewControllerItem>> {
  return runtime.items.filter((item) => isTreeViewItemVisible(runtime, item));
}

function handleTreeViewControllerKeyDown(controller: TreeViewController, data: Readonly<KeyboardEventData>): void {
  const runtime = getGuiControllerRuntime<TreeViewControllerFields>(controller);
  const selected = runtime.selectedItem;
  const visible = getVisibleTreeViewItems(runtime);
  const index = selected === null ? -1 : visible.indexOf(selected);
  if (data.key === 'ArrowDown' && visible.length > 0)
    setTreeViewControllerSelectedItem(controller, visible[Math.min(visible.length - 1, index + 1)]);
  else if (data.key === 'ArrowUp' && visible.length > 0)
    setTreeViewControllerSelectedItem(controller, visible[Math.max(0, index - 1)]);
  else if (data.key === 'ArrowRight' && selected !== null) {
    if ((selected.children?.length ?? 0) > 0 && !runtime.expanded.has(selected))
      setTreeViewControllerItemExpanded(controller, selected, true);
    else if ((selected.children?.length ?? 0) > 0) setTreeViewControllerSelectedItem(controller, selected.children![0]);
  } else if (data.key === 'ArrowLeft' && selected !== null) {
    if (runtime.expanded.has(selected)) setTreeViewControllerItemExpanded(controller, selected, false);
    else setTreeViewControllerSelectedItem(controller, runtime.parents.get(selected) ?? null);
  } else if (data.key === 'Enter' && selected !== null) emitSignal(runtime.signals.onActivate, selected);
}

function isTreeViewItemVisible(
  runtime: ReturnType<typeof getGuiControllerRuntime<TreeViewControllerFields>>,
  item: Readonly<TreeViewControllerItem>,
): boolean {
  let parent = runtime.parents.get(item) ?? null;
  while (parent !== null) {
    if (!runtime.expanded.has(parent)) return false;
    parent = runtime.parents.get(parent) ?? null;
  }
  return true;
}

function updateTreeViewControllerVisibility(
  runtime: ReturnType<typeof getGuiControllerRuntime<TreeViewControllerFields>>,
): void {
  runtime.items.forEach((item) => setGuiVisible(runtime, item.visual, isTreeViewItemVisible(runtime, item)));
}
