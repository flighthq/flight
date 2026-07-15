import {
  captureInteractionPointer,
  connectInputToInteraction,
  connectInteractionSignal,
  createInteractionManager,
  registerDefaultHitTestPoints,
  releaseInteractionPointer,
} from '@flighthq/interaction';
import type { PointerEventData, Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeEndFill,
  appendShapeRectangle,
  attachPointerInput,
  clearShapeCommands,
  createDisplayObject,
  createInputManager,
  createShape,
  createTextLabel,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';

import { canvas, render, scale } from './render';

const CANVAS_HEIGHT = 600;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// Register hit test handlers for all built-in display object kinds so the interaction manager
// can find targets under the pointer.
registerDefaultHitTestPoints();

const manager = createInteractionManager(root);

// Wire DOM pointer events into the interaction manager via an InputManager. The coordScale
// bridges CSS pixels to the backing-store pixel space used by hit testing.
const inputManager = createInputManager();
const canvasElement = canvas;
attachPointerInput(inputManager, canvasElement);
connectInputToInteraction(inputManager, manager, scale);

// Shape definitions: six draggable colored shapes at different positions.

interface DraggableShape {
  shape: Shape;
  name: string;
  baseColor: number;
  hoverColor: number;
  kind: 'rect' | 'circle';
  cx: number;
  cy: number;
  w: number;
  h: number;
}

const shapes: DraggableShape[] = [
  {
    shape: createShape(),
    name: 'Red Rect',
    baseColor: 0xcc4444,
    hoverColor: 0xff6666,
    kind: 'rect',
    cx: 100,
    cy: 100,
    w: 100,
    h: 80,
  },
  {
    shape: createShape(),
    name: 'Green Circle',
    baseColor: 0x44cc44,
    hoverColor: 0x66ff66,
    kind: 'circle',
    cx: 300,
    cy: 150,
    w: 60,
    h: 60,
  },
  {
    shape: createShape(),
    name: 'Blue Rect',
    baseColor: 0x4444cc,
    hoverColor: 0x6666ff,
    kind: 'rect',
    cx: 500,
    cy: 100,
    w: 120,
    h: 90,
  },
  {
    shape: createShape(),
    name: 'Yellow Circle',
    baseColor: 0xcccc44,
    hoverColor: 0xffff66,
    kind: 'circle',
    cx: 200,
    cy: 350,
    w: 50,
    h: 50,
  },
  {
    shape: createShape(),
    name: 'Cyan Rect',
    baseColor: 0x44cccc,
    hoverColor: 0x66ffff,
    kind: 'rect',
    cx: 450,
    cy: 300,
    w: 90,
    h: 70,
  },
  {
    shape: createShape(),
    name: 'Magenta Circle',
    baseColor: 0xcc44cc,
    hoverColor: 0xff66ff,
    kind: 'circle',
    cx: 650,
    cy: 250,
    w: 55,
    h: 55,
  },
];

// HUD state, updated by signal handlers and displayed each frame.
let lastEventType = 'none';
let hoveredName = 'none';
let dragStatus = 'idle';

// Track hovered and dragged shapes so we know which fill color to use.
const hoveredShapes = new Set<DraggableShape>();
let dragTarget: DraggableShape | null = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

function redrawShape(ds: DraggableShape): void {
  const isHovered = hoveredShapes.has(ds);
  const color = isHovered ? ds.hoverColor : ds.baseColor;

  clearShapeCommands(ds.shape);
  appendShapeBeginFill(ds.shape, color, 0.85);

  if (ds.kind === 'rect') {
    appendShapeRectangle(ds.shape, ds.cx - ds.w / 2, ds.cy - ds.h / 2, ds.w, ds.h);
  } else {
    appendShapeCircle(ds.shape, ds.cx, ds.cy, ds.w);
  }

  appendShapeEndFill(ds.shape);
  invalidateNodeLocalTransform(ds.shape);
}

// Initialize shapes: add to scene, draw, and wire interaction signals.
for (const ds of shapes) {
  addNodeChild(root, ds.shape);
  redrawShape(ds);

  // Hover: pointerOver / pointerOut change the fill to a brighter shade.
  connectInteractionSignal(manager, ds.shape, 'onPointerOver', (data: Readonly<PointerEventData>) => {
    lastEventType = 'pointerOver';
    hoveredName = ds.name;
    hoveredShapes.add(ds);
    redrawShape(ds);
    void data;
  });

  connectInteractionSignal(manager, ds.shape, 'onPointerOut', (data: Readonly<PointerEventData>) => {
    lastEventType = 'pointerOut';
    if (hoveredName === ds.name) hoveredName = 'none';
    hoveredShapes.delete(ds);
    redrawShape(ds);
    void data;
  });

  // Drag: pointerDown captures the pointer, pointerMove updates position, pointerUp releases.
  connectInteractionSignal(manager, ds.shape, 'onPointerDown', (data: Readonly<PointerEventData>) => {
    lastEventType = 'pointerDown';
    dragTarget = ds;
    dragOffsetX = data.localX - ds.cx;
    dragOffsetY = data.localY - ds.cy;
    dragStatus = 'dragging ' + ds.name;
    captureInteractionPointer(manager, data.pointerId, ds.shape);
  });

  connectInteractionSignal(manager, ds.shape, 'onPointerMove', (data: Readonly<PointerEventData>) => {
    lastEventType = 'pointerMove';
    if (dragTarget !== ds) return;

    const localX = data.worldX / scale;
    const localY = data.worldY / scale;
    ds.cx = localX - dragOffsetX;
    ds.cy = localY - dragOffsetY;

    redrawShape(ds);
  });

  connectInteractionSignal(manager, ds.shape, 'onPointerUp', (data: Readonly<PointerEventData>) => {
    lastEventType = 'pointerUp';
    if (dragTarget === ds) {
      dragTarget = null;
      dragStatus = 'idle';
      releaseInteractionPointer(manager, data.pointerId);
    }
  });
}

// HUD labels: show last event, hovered object, and drag status.

const hudEventLabel = createTextLabel();
hudEventLabel.data.text = 'Event: none';
hudEventLabel.data.textFormat = { size: 14, color: 0xdddddd };
hudEventLabel.x = 10;
hudEventLabel.y = CANVAS_HEIGHT - 80;
invalidateNodeLocalTransform(hudEventLabel);
addNodeChild(root, hudEventLabel);

const hudHoverLabel = createTextLabel();
hudHoverLabel.data.text = 'Hovered: none';
hudHoverLabel.data.textFormat = { size: 14, color: 0xdddddd };
hudHoverLabel.x = 10;
hudHoverLabel.y = CANVAS_HEIGHT - 58;
invalidateNodeLocalTransform(hudHoverLabel);
addNodeChild(root, hudHoverLabel);

const hudDragLabel = createTextLabel();
hudDragLabel.data.text = 'Drag: idle';
hudDragLabel.data.textFormat = { size: 14, color: 0xdddddd };
hudDragLabel.x = 10;
hudDragLabel.y = CANVAS_HEIGHT - 36;
invalidateNodeLocalTransform(hudDragLabel);
addNodeChild(root, hudDragLabel);

const titleLabel = createTextLabel();
titleLabel.data.text = 'Drag the shapes around. Hover to highlight.';
titleLabel.data.textFormat = { size: 16, color: 0x999999 };
titleLabel.x = 10;
titleLabel.y = 10;
invalidateNodeLocalTransform(titleLabel);
addNodeChild(root, titleLabel);

function updateHud(): void {
  const eventText = 'Event: ' + lastEventType;
  if (hudEventLabel.data.text !== eventText) {
    hudEventLabel.data.text = eventText;
    invalidateNodeAppearance(hudEventLabel);
  }

  const hoverText = 'Hovered: ' + hoveredName;
  if (hudHoverLabel.data.text !== hoverText) {
    hudHoverLabel.data.text = hoverText;
    invalidateNodeAppearance(hudHoverLabel);
  }

  const dragText = 'Drag: ' + dragStatus;
  if (hudDragLabel.data.text !== dragText) {
    hudDragLabel.data.text = dragText;
    invalidateNodeAppearance(hudDragLabel);
  }
}

function enterFrame(): void {
  updateHud();
  render(root);
  requestAnimationFrame(enterFrame);
}

requestAnimationFrame(enterFrame);
