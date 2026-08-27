import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  GuiOrientation,
  Node2D,
  PointerEventData,
  SplitPaneController,
  SplitPaneControllerOptions,
  SplitPaneControllerSignals,
} from '@flighthq/types/contract';

import {
  clampGuiValue,
  connectGuiInteraction,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  getGuiLength,
  getGuiPosition,
  setGuiPosition,
  setGuiScale,
} from './guiController';

interface SplitPaneControllerFields {
  divider: Node2D | null;
  dragPointer: number;
  dragStartCoordinate: number;
  dragStartPosition: number;
  firstBaseLength: number;
  firstBaseScale: number;
  firstOrigin: number;
  firstRegion: Node2D | null;
  maximumFirst: number;
  minimumFirst: number;
  minimumSecond: number;
  orientation: GuiOrientation;
  position: number;
  secondBaseLength: number;
  secondBaseScale: number;
  secondRegion: Node2D | null;
  signals: SplitPaneControllerSignals;
  totalSize: number;
}

export function createSplitPaneController(options: Readonly<SplitPaneControllerOptions>): SplitPaneController {
  const orientation = options.orientation ?? 'horizontal';
  const dividerLength = getGuiLength(options.divider, orientation);
  const firstLength = getGuiLength(options.firstRegion, orientation);
  const secondLength = getGuiLength(options.secondRegion, orientation);
  const totalSize = Math.max(0, options.totalSize ?? firstLength + dividerLength + secondLength);
  const minimumFirst = Math.max(0, options.minimumFirst ?? 0);
  const minimumSecond = Math.max(0, options.minimumSecond ?? 0);
  const maximumFirst = Math.min(
    options.maximumFirst ?? Infinity,
    Math.max(minimumFirst, totalSize - dividerLength - minimumSecond),
  );
  const runtime = createGuiControllerRuntime<SplitPaneControllerFields>(
    {
      divider: options.divider,
      dragPointer: -1,
      dragStartCoordinate: 0,
      dragStartPosition: 0,
      firstBaseLength: firstLength,
      firstBaseScale: orientation === 'horizontal' ? options.firstRegion.scaleX : options.firstRegion.scaleY,
      firstOrigin: getGuiPosition(options.firstRegion, orientation),
      firstRegion: options.firstRegion,
      maximumFirst,
      minimumFirst,
      minimumSecond,
      orientation,
      position: clampGuiValue(options.position ?? firstLength, minimumFirst, maximumFirst),
      secondBaseLength: secondLength,
      secondBaseScale: orientation === 'horizontal' ? options.secondRegion.scaleX : options.secondRegion.scaleY,
      secondRegion: options.secondRegion,
      signals: { onChange: createSignal() },
      totalSize,
    },
    options.transition,
  );
  const controller = createGuiController<SplitPaneController, typeof runtime>(runtime);
  connectGuiInteraction(runtime, options.divider, 'onPointerDown', (data: Readonly<PointerEventData>) => {
    runtime.dragPointer = data.pointerId;
    runtime.dragStartCoordinate = orientation === 'horizontal' ? data.worldX : data.worldY;
    runtime.dragStartPosition = runtime.position;
  });
  connectGuiInteraction(runtime, options.divider, 'onPointerMove', (data: Readonly<PointerEventData>) => {
    if (data.pointerId !== runtime.dragPointer) return;
    const coordinate = orientation === 'horizontal' ? data.worldX : data.worldY;
    setSplitPaneControllerPosition(controller, runtime.dragStartPosition + coordinate - runtime.dragStartCoordinate);
  });
  const endDrag = (data: Readonly<PointerEventData>) => {
    if (data.pointerId === runtime.dragPointer) runtime.dragPointer = -1;
  };
  connectGuiInteraction(runtime, options.divider, 'onPointerUp', endDrag);
  connectGuiInteraction(runtime, options.divider, 'onPointerCancel', endDrag);
  connectGuiInteraction(runtime, options.divider, 'onReleaseOutside', endDrag);
  updateSplitPaneControllerVisual(runtime);
  return controller;
}

export function disposeSplitPaneController(controller: SplitPaneController): void {
  const runtime = getGuiControllerRuntime<SplitPaneControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.divider = null;
    runtime.firstRegion = null;
    runtime.secondRegion = null;
  });
}

export function getSplitPaneControllerPosition(controller: SplitPaneController): number {
  return getGuiControllerRuntime<SplitPaneControllerFields>(controller).position;
}

export function getSplitPaneControllerSignals(controller: SplitPaneController): Readonly<SplitPaneControllerSignals> {
  return getGuiControllerRuntime<SplitPaneControllerFields>(controller).signals;
}

export function setSplitPaneControllerPosition(controller: SplitPaneController, position: number): void {
  const runtime = getGuiControllerRuntime<SplitPaneControllerFields>(controller);
  const next = clampGuiValue(position, runtime.minimumFirst, runtime.maximumFirst);
  if (runtime.position === next || runtime.disposed) return;
  runtime.position = next;
  updateSplitPaneControllerVisual(runtime);
  emitSignal(runtime.signals.onChange, next);
}

function updateSplitPaneControllerVisual(
  runtime: ReturnType<typeof getGuiControllerRuntime<SplitPaneControllerFields>>,
): void {
  const dividerLength = runtime.divider === null ? 0 : getGuiLength(runtime.divider, runtime.orientation);
  const secondLength = Math.max(0, runtime.totalSize - runtime.position - dividerLength);
  if (runtime.firstBaseLength > 0)
    setGuiScale(
      runtime,
      runtime.firstRegion,
      runtime.orientation,
      (runtime.firstBaseScale * runtime.position) / runtime.firstBaseLength,
    );
  setGuiPosition(runtime, runtime.divider, runtime.orientation, runtime.firstOrigin + runtime.position);
  setGuiPosition(
    runtime,
    runtime.secondRegion,
    runtime.orientation,
    runtime.firstOrigin + runtime.position + dividerLength,
  );
  if (runtime.secondBaseLength > 0)
    setGuiScale(
      runtime,
      runtime.secondRegion,
      runtime.orientation,
      (runtime.secondBaseScale * secondLength) / runtime.secondBaseLength,
    );
}
