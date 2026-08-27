import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Node2D,
  TabBarController,
  TabBarControllerItem,
  TabBarControllerOptions,
  TabBarControllerSignals,
} from '@flighthq/types/contract';

import {
  connectGuiInteraction,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiVisible,
} from './guiController';

interface TabBarControllerFields {
  selectedIndex: number;
  signals: TabBarControllerSignals;
  tabs: Array<Readonly<TabBarControllerItem>>;
}

export function createTabBarController(options: Readonly<TabBarControllerOptions>): TabBarController {
  const runtime = createGuiControllerRuntime<TabBarControllerFields>(
    {
      selectedIndex: -1,
      signals: { onChange: createSignal() },
      tabs: options.tabs.slice(),
    },
    options.transition,
  );
  const controller = createGuiController<TabBarController, typeof runtime>(runtime);
  runtime.tabs.forEach((tab, index) => {
    const targets = [tab.selectedState, tab.unselectedState].filter(
      (target, i, all): target is Node2D => all.indexOf(target) === i,
    );
    for (const target of targets) {
      connectGuiInteraction(runtime, target, 'onClick', () => setTabBarControllerSelectedIndex(controller, index));
    }
  });
  setTabBarControllerSelectedIndex(controller, options.selectedIndex ?? (runtime.tabs.length === 0 ? -1 : 0));
  return controller;
}

export function disposeTabBarController(controller: TabBarController): void {
  const runtime = getGuiControllerRuntime<TabBarControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.tabs.length = 0;
  });
}

export function getTabBarControllerSelectedIndex(controller: TabBarController): number {
  return getGuiControllerRuntime<TabBarControllerFields>(controller).selectedIndex;
}

export function getTabBarControllerSignals(controller: TabBarController): Readonly<TabBarControllerSignals> {
  return getGuiControllerRuntime<TabBarControllerFields>(controller).signals;
}

export function setTabBarControllerSelectedIndex(controller: TabBarController, index: number): void {
  const runtime = getGuiControllerRuntime<TabBarControllerFields>(controller);
  const next = index >= 0 && index < runtime.tabs.length ? index : -1;
  const changed = runtime.selectedIndex !== next;
  runtime.selectedIndex = next;
  runtime.tabs.forEach((tab, i) => {
    setGuiVisible(runtime, tab.selectedState, i === next);
    setGuiVisible(runtime, tab.unselectedState, i !== next);
  });
  if (changed) emitSignal(runtime.signals.onChange, next);
}
