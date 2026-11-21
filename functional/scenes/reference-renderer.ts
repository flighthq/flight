import { createWebImageResourceFromCanvas } from '@flighthq/host-web';
import type { Bitmap } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  connectInteractionSignal,
  createInteractionManager,
  createPixelArtSampler,
  createRectangle,
  createShape,
  createSprite,
  createTextLabel,
  createTexture,
  dispatchInteractionPointerDown,
  dispatchInteractionPointerUp,
  setNodeHitArea,
  setNodeHitTestEnabled,
  ShapeKind,
  SpriteKind,
  TextLabelKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

import {
  assertReferenceRenderer,
  assertReferenceRendererEnvironment,
  assertReferenceRendererScene,
  REFERENCE_RENDERER_SCENE,
} from '../../scripts/reference-renderer-scene.ts';

declareAntialiasingPolicy('aa');

const scene = REFERENCE_RENDERER_SCENE;
assertReferenceRendererEnvironment(window.devicePixelRatio);
await document.fonts.ready;
if (!document.fonts.check(`${scene.text.size}px ${scene.text.font}`, scene.text.value)) {
  throw new Error(`[reference-renderer] pinned ${scene.text.font} font is unavailable`);
}

const target = await createFunctionalTarget({
  width: scene.width,
  height: scene.height,
  background: scene.background,
  kinds: [ShapeKind, SpriteKind, TextLabelKind],
  expectedImageDescription:
    'A 480x320 opaque dark-navy sRGB field contains a solid blue rectangle at upper left; beneath it ' +
    'a hollow magenta stroked rectangle; a cyan triangular fill near the centre; a 64x64 four-colour ' +
    'generated sprite at upper centre; one amber monospace line reading FLIGHT TS at lower left; and ' +
    'a white-outlined green activated control at lower right with a small cyan marker at the fixed ' +
    'pointer position. The activated control must be green, not its pre-click orange state.',
});
assertReferenceRenderer(target.kind, (window as typeof window & { __ftBackend?: string }).__ftBackend);

// A Shape is also the generic Node2D container here. Keeping the root on an explicitly requested kind
// makes an omitted/wrong renderer a loud registry miss instead of relying on a backend's implicit root.
const root = createShape();

const filledRectangle = createShape();
appendShapeBeginFill(filledRectangle, scene.filledRectangle.color, 1);
appendShapeRectangle(
  filledRectangle,
  scene.filledRectangle.x,
  scene.filledRectangle.y,
  scene.filledRectangle.width,
  scene.filledRectangle.height,
);
appendShapeEndFill(filledRectangle);
addNodeChild(root, filledRectangle);

const triangle = createShape();
appendShapeBeginFill(triangle, scene.filledTriangle.color, 1);
appendShapeMoveTo(triangle, scene.filledTriangle.points[0][0], scene.filledTriangle.points[0][1]);
appendShapeLineTo(triangle, scene.filledTriangle.points[1][0], scene.filledTriangle.points[1][1]);
appendShapeLineTo(triangle, scene.filledTriangle.points[2][0], scene.filledTriangle.points[2][1]);
appendShapeLineTo(triangle, scene.filledTriangle.points[0][0], scene.filledTriangle.points[0][1]);
appendShapeEndFill(triangle);
addNodeChild(root, triangle);

const strokedRectangle = createShape();
appendShapeLineStyle(strokedRectangle, scene.strokedRectangle.thickness, scene.strokedRectangle.color, 1);
appendShapeRectangle(
  strokedRectangle,
  scene.strokedRectangle.x,
  scene.strokedRectangle.y,
  scene.strokedRectangle.width,
  scene.strokedRectangle.height,
);
addNodeChild(root, strokedRectangle);

const spriteCanvas = document.createElement('canvas');
spriteCanvas.width = scene.sprite.size;
spriteCanvas.height = scene.sprite.size;
const spriteContext = spriteCanvas.getContext('2d', { colorSpace: scene.colorSpace });
if (spriteContext === null) throw new Error('[reference-renderer] failed to create sprite canvas');
const spritePixels = spriteContext.createImageData(scene.sprite.size, scene.sprite.size, {
  colorSpace: scene.colorSpace,
});
for (let y = 0; y < scene.sprite.size; y++) {
  for (let x = 0; x < scene.sprite.size; x++) {
    const quadrant = (y < scene.sprite.size / 2 ? 0 : 2) + (x < scene.sprite.size / 2 ? 0 : 1);
    const color = scene.sprite.colors[quadrant]!;
    const offset = (y * scene.sprite.size + x) * 4;
    spritePixels.data[offset] = (color >>> 24) & 0xff;
    spritePixels.data[offset + 1] = (color >>> 16) & 0xff;
    spritePixels.data[offset + 2] = (color >>> 8) & 0xff;
    spritePixels.data[offset + 3] = color & 0xff;
  }
}
spriteContext.putImageData(spritePixels, 0, 0);
const sprite = createSprite();
sprite.data.texture = createTexture({
  colorSpace: scene.colorSpace,
  dimension: '2d',
  sampler: createPixelArtSampler(),
  source: createWebImageResourceFromCanvas(spriteCanvas),
});
sprite.x = scene.sprite.x;
sprite.y = scene.sprite.y;
addNodeChild(root, sprite);

const label = createTextLabel();
label.data.text = scene.text.value;
label.data.textFormat = {
  color: scene.text.color,
  font: scene.text.font,
  kerning: false,
  size: scene.text.size,
};
label.data.width = scene.text.width;
label.data.height = scene.text.height;
label.x = scene.text.x;
label.y = scene.text.y;
addNodeChild(root, label);

const initialControl = createControl(scene.interaction.initialColor, false);
const activeControl = createControl(scene.interaction.activeColor, true);
activeControl.enabled = false;
addNodeChild(root, initialControl);
addNodeChild(root, activeControl);

const interactionTransitions: string[] = ['initial'];
setNodeHitTestEnabled(initialControl, true);
setNodeHitArea(initialControl, createRectangle(0, 0, scene.interaction.width, scene.interaction.height));
const interaction = createInteractionManager(root);
connectInteractionSignal(interaction, initialControl, 'onPointerDown', () => {
  interactionTransitions.push('pointer-down');
});
connectInteractionSignal(interaction, initialControl, 'onClick', () => {
  initialControl.enabled = false;
  activeControl.enabled = true;
  interactionTransitions.push('activated');
});

// Establish transforms and the orange pre-interaction state, then drive the ordinary interaction
// manager at fixed coordinates/timestamps and render the visible green result at animation time zero.
target.render(root);
dispatchInteractionPointerDown(interaction, scene.interaction.eventX, scene.interaction.eventY, 0, {
  pointerId: scene.interaction.pointerId,
  pointerType: 'mouse',
  timeStamp: scene.interaction.pointerDownTimeMs,
});
dispatchInteractionPointerUp(
  interaction,
  scene.interaction.eventX,
  scene.interaction.eventY,
  0,
  scene.interaction.pointerUpTimeMs,
  {
    pointerId: scene.interaction.pointerId,
    pointerType: 'mouse',
    timeStamp: scene.interaction.pointerUpTimeMs,
  },
);
target.render(root);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  assertReferenceRendererScene(bitmap, interactionTransitions);
}

function createControl(color: number, marker: boolean) {
  const control = createShape();
  control.x = scene.interaction.x;
  control.y = scene.interaction.y;
  appendShapeLineStyle(control, 4, scene.interaction.strokeColor, 1);
  appendShapeBeginFill(control, color, 1);
  appendShapeRectangle(control, 0, 0, scene.interaction.width, scene.interaction.height);
  appendShapeEndFill(control);
  if (marker) {
    appendShapeBeginFill(control, scene.interaction.markerColor, 1);
    appendShapeRectangle(
      control,
      scene.interaction.eventX - scene.interaction.x - scene.interaction.markerSize / 2,
      scene.interaction.eventY - scene.interaction.y - scene.interaction.markerSize / 2,
      scene.interaction.markerSize,
      scene.interaction.markerSize,
    );
    appendShapeEndFill(control);
  }
  return control;
}
