import { getNodeHeight, getNodeWidth } from '@flighthq/node/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  ButtonController,
  Node2D,
  PointerEventData,
  WindowController,
  WindowControllerOptions,
  WindowControllerSignals,
} from '@flighthq/types/contract';

import { getButtonControllerSignals } from './buttonController';
import {
  connectGuiInteraction,
  connectGuiSignal,
  createGuiController,
  createGuiControllerRuntime,
  disposeGuiController,
  getGuiControllerRuntime,
  setGuiVisualProperty,
} from './guiController';

interface WindowControllerFields {
  closeButton: ButtonController | null;
  content: Node2D | null;
  dragPointer: number;
  dragStartFrameX: number;
  dragStartFrameY: number;
  dragStartWorldX: number;
  dragStartWorldY: number;
  draggable: boolean;
  frame: Node2D | null;
  frameBaseHeight: number;
  frameBaseScaleX: number;
  frameBaseScaleY: number;
  frameBaseWidth: number;
  minimumHeight: number;
  minimumWidth: number;
  resizeHandle: Node2D | null;
  resizePointer: number;
  resizeStartHeight: number;
  resizeStartWidth: number;
  resizeStartWorldX: number;
  resizeStartWorldY: number;
  resizable: boolean;
  signals: WindowControllerSignals;
  titleBar: Node2D | null;
}

export function createWindowController(options: Readonly<WindowControllerOptions>): WindowController {
  const width = getNodeWidth(options.frame);
  const height = getNodeHeight(options.frame);
  const runtime = createGuiControllerRuntime<WindowControllerFields>(
    {
      closeButton: options.closeButton ?? null,
      content: options.content ?? null,
      dragPointer: -1,
      dragStartFrameX: 0,
      dragStartFrameY: 0,
      dragStartWorldX: 0,
      dragStartWorldY: 0,
      draggable: options.draggable ?? true,
      frame: options.frame,
      frameBaseHeight: height,
      frameBaseScaleX: options.frame.scaleX,
      frameBaseScaleY: options.frame.scaleY,
      frameBaseWidth: width,
      minimumHeight: Math.max(0, options.minimumHeight ?? 0),
      minimumWidth: Math.max(0, options.minimumWidth ?? 0),
      resizeHandle: options.resizeHandle ?? null,
      resizePointer: -1,
      resizeStartHeight: 0,
      resizeStartWidth: 0,
      resizeStartWorldX: 0,
      resizeStartWorldY: 0,
      resizable: options.resizable ?? true,
      signals: { onClose: createSignal(), onMove: createSignal(), onResize: createSignal() },
      titleBar: options.titleBar ?? null,
    },
    options.transition,
  );
  const controller = createGuiController<WindowController, typeof runtime>(runtime);
  if (runtime.closeButton !== null) {
    connectGuiSignal(runtime, getButtonControllerSignals(runtime.closeButton).onClick, () =>
      emitSignal(runtime.signals.onClose),
    );
  }
  if (runtime.titleBar !== null) {
    connectGuiInteraction(runtime, runtime.titleBar, 'onPointerDown', (data: Readonly<PointerEventData>) => {
      if (!runtime.draggable || runtime.frame === null) return;
      runtime.dragPointer = data.pointerId;
      runtime.dragStartWorldX = data.worldX;
      runtime.dragStartWorldY = data.worldY;
      runtime.dragStartFrameX = runtime.frame.x;
      runtime.dragStartFrameY = runtime.frame.y;
    });
    connectGuiInteraction(runtime, runtime.titleBar, 'onPointerMove', (data: Readonly<PointerEventData>) => {
      if (data.pointerId !== runtime.dragPointer) return;
      setWindowControllerPosition(
        controller,
        runtime.dragStartFrameX + data.worldX - runtime.dragStartWorldX,
        runtime.dragStartFrameY + data.worldY - runtime.dragStartWorldY,
      );
    });
    const endDrag = (data: Readonly<PointerEventData>) => {
      if (data.pointerId === runtime.dragPointer) runtime.dragPointer = -1;
    };
    connectGuiInteraction(runtime, runtime.titleBar, 'onPointerUp', endDrag);
    connectGuiInteraction(runtime, runtime.titleBar, 'onPointerCancel', endDrag);
    connectGuiInteraction(runtime, runtime.titleBar, 'onReleaseOutside', endDrag);
  }
  if (runtime.resizeHandle !== null) {
    connectGuiInteraction(runtime, runtime.resizeHandle, 'onPointerDown', (data: Readonly<PointerEventData>) => {
      if (!runtime.resizable || runtime.frame === null) return;
      runtime.resizePointer = data.pointerId;
      runtime.resizeStartWorldX = data.worldX;
      runtime.resizeStartWorldY = data.worldY;
      runtime.resizeStartWidth = getNodeWidth(runtime.frame);
      runtime.resizeStartHeight = getNodeHeight(runtime.frame);
    });
    connectGuiInteraction(runtime, runtime.resizeHandle, 'onPointerMove', (data: Readonly<PointerEventData>) => {
      if (data.pointerId !== runtime.resizePointer) return;
      setWindowControllerSize(
        controller,
        runtime.resizeStartWidth + data.worldX - runtime.resizeStartWorldX,
        runtime.resizeStartHeight + data.worldY - runtime.resizeStartWorldY,
      );
    });
    const endResize = (data: Readonly<PointerEventData>) => {
      if (data.pointerId === runtime.resizePointer) runtime.resizePointer = -1;
    };
    connectGuiInteraction(runtime, runtime.resizeHandle, 'onPointerUp', endResize);
    connectGuiInteraction(runtime, runtime.resizeHandle, 'onPointerCancel', endResize);
    connectGuiInteraction(runtime, runtime.resizeHandle, 'onReleaseOutside', endResize);
  }
  return controller;
}

export function disposeWindowController(controller: WindowController): void {
  const runtime = getGuiControllerRuntime<WindowControllerFields>(controller);
  disposeGuiController(controller, () => {
    runtime.closeButton = null;
    runtime.content = null;
    runtime.frame = null;
    runtime.resizeHandle = null;
    runtime.titleBar = null;
  });
}

export function getWindowControllerSignals(controller: WindowController): Readonly<WindowControllerSignals> {
  return getGuiControllerRuntime<WindowControllerFields>(controller).signals;
}

export function setWindowControllerPosition(controller: WindowController, x: number, y: number): void {
  const runtime = getGuiControllerRuntime<WindowControllerFields>(controller);
  if (runtime.frame === null || runtime.disposed || (runtime.frame.x === x && runtime.frame.y === y)) return;
  setGuiVisualProperty(runtime, runtime.frame, 'x', x);
  setGuiVisualProperty(runtime, runtime.frame, 'y', y);
  emitSignal(runtime.signals.onMove, x, y);
}

export function setWindowControllerSize(controller: WindowController, width: number, height: number): void {
  const runtime = getGuiControllerRuntime<WindowControllerFields>(controller);
  if (runtime.frame === null || runtime.disposed) return;
  const nextWidth = Math.max(runtime.minimumWidth, width);
  const nextHeight = Math.max(runtime.minimumHeight, height);
  if (runtime.frameBaseWidth > 0)
    setGuiVisualProperty(
      runtime,
      runtime.frame,
      'scaleX',
      (runtime.frameBaseScaleX * nextWidth) / runtime.frameBaseWidth,
    );
  if (runtime.frameBaseHeight > 0)
    setGuiVisualProperty(
      runtime,
      runtime.frame,
      'scaleY',
      (runtime.frameBaseScaleY * nextHeight) / runtime.frameBaseHeight,
    );
  emitSignal(runtime.signals.onResize, nextWidth, nextHeight);
}
