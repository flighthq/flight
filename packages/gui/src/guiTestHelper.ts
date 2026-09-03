import { getInteractionSignals } from '@flighthq/interaction/contract';
import {
  createNode,
  createNodeRuntime,
  initAppearanceTrait,
  initBoundsRectangleRuntimeTrait,
  initBoundsRectangleTrait,
  initTransform2DRuntimeTrait,
  initTransform2DTrait,
} from '@flighthq/node/contract';
import type {
  InteractionSignalName,
  KeyboardEventData,
  Node2D,
  Node2DRuntime,
  PointerEventData,
  Rectangle,
} from '@flighthq/types/contract';
import { DisplayObjectKind, Node2DTraitsKey } from '@flighthq/types/contract';

export function createGuiTestNode(width = 100, height = 20): Node2D {
  const runtime = createNodeRuntime() as Node2DRuntime;
  runtime.traits = Node2DTraitsKey;
  runtime.scene2d = null;
  initTransform2DRuntimeTrait(runtime);
  initBoundsRectangleRuntimeTrait(runtime);
  runtime.computeLocalBoundsRectangle = (out: Rectangle) => {
    out.x = 0;
    out.y = 0;
    out.width = width;
    out.height = height;
  };
  const node = createNode(DisplayObjectKind, undefined, undefined, () => runtime) as Node2D;
  initTransform2DTrait(node);
  initBoundsRectangleTrait(node);
  initAppearanceTrait(node);
  return node;
}

export function emitGuiKeyboard(target: Node2D, name: InteractionSignalName, key: string): void {
  const data: KeyboardEventData = {
    altKey: false,
    ctrlKey: false,
    key,
    keyCode: key.length === 1 ? key.charCodeAt(0) : 0,
    metaKey: false,
    shiftKey: false,
  };
  (getInteractionSignals(target)![name].emit as (data: Readonly<KeyboardEventData>) => void)(data);
}

export function emitGuiPointer(
  target: Node2D,
  name: InteractionSignalName,
  fields?: Readonly<Partial<PointerEventData>>,
): void {
  const data: PointerEventData = {
    altKey: false,
    button: 0,
    buttons: 0,
    ctrlKey: false,
    currentTarget: target,
    deltaX: 0,
    deltaY: 0,
    localX: 0,
    localY: 0,
    metaKey: false,
    pointerId: 1,
    pointerType: 'mouse',
    shiftKey: false,
    target,
    worldX: 0,
    worldY: 0,
    x: 0,
    y: 0,
    ...fields,
  };
  (getInteractionSignals(target)![name].emit as (data: Readonly<PointerEventData>) => void)(data);
}
