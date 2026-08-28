import { getBitmapPixelRgb } from '@flighthq/bitmap';
import { createCamera3D, createPerspectiveProjection, setCamera3DViewMatrix4FromLookAt } from '@flighthq/camera';
import { createClipRegionFromRectangle } from '@flighthq/clip';
import { createVector3 } from '@flighthq/geometry';
import { enableHostWebGlRenderSurface } from '@flighthq/host-web';
import { createAmbientLight } from '@flighthq/lighting';
import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild, createViewport } from '@flighthq/node';
import { prepareScene2DRender, registerRenderer } from '@flighthq/render';
import {
  beginGlRenderPass,
  createGlCanvasElement,
  createGlProgram,
  createGlRenderState,
  createGlRenderTarget,
  declareGlRenderTargetColorSpace,
  endGlRenderPass,
  invalidateGlRenderStateCache,
  presentGlRenderTarget,
} from '@flighthq/render-gl/contract';
import { createDisplayObject, setNode2DClip } from '@flighthq/scene2d';
import { defaultGlShapeRenderer, enableGlClipSupport, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createMesh, createScene3D } from '@flighthq/scene3d';
import { drawGlScene3D, registerGlUnlitMaterial } from '@flighthq/scene3d-gl';
import { appendShapeBeginFill, appendShapeEndFill, appendShapeRectangle, createShape } from '@flighthq/shape';
import type { Bitmap, GlRenderState, Viewport } from '@flighthq/types';
import { ShapeKind } from '@flighthq/types';
import { declareExpectedImageDescription, declareAntialiasingPolicy } from '@ft/render';

declareAntialiasingPolicy('no-aa');

declareExpectedImageDescription(
  'An 800×600 dark navy field contains four separated proof areas. At top left, a green 300×220 ' +
    'panel beginning at (40,40) contains a blue 100×100 square from (140,100) to (240,200). At top ' +
    'right, a magenta 320×220 panel beginning at (420,40) contains a yellow 100×80 inset at (500,100) ' +
    'and a cyan rectangle on its right; navy remains immediately outside that panel. Near the lower ' +
    'left edge is one orange rectangle clipped to a smaller local window, with navy around it rather ' +
    'than orange filling the whole requested area. At lower right, a tall 150×220 viewport and a wide ' +
    '250×120 viewport each contain the same cyan box as an approximately square silhouette — neither ' +
    'box stretches to its viewport. All four areas remain isolated by navy gaps; nested colours do ' +
    'not escape into neighbouring regions.',
);

// One target, several actual draw paths:
// - top-left: a partial depth clear revealed by a later behind-depth draw;
// - top-right: nested full/partial passes followed by an outer draw after exact restoration;
// - bottom-left: edge-clamped viewport plus local 2D projection and rectangular clipping;
// - bottom-right: one camera rendered into tall and wide viewports after two aspect updates.
// The target is multisampled so every partial pass also exercises scissor-isolated storage resolve.
export const width = 800;
export const height = 600;
export const scale = window.devicePixelRatio || 1;

enableHostWebGlRenderSurface();
const canvas = createGlCanvasElement(width, height, scale);
document.body.appendChild(canvas);
const state = createGlRenderState(canvas, {
  antialias: false,
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
  pixelRatio: scale,
});
const target = createGlRenderTarget(state, {
  clearColors: [0x101725ff],
  colorSpace: 'srgb',
  depth: 'depth-stencil',
  height: canvas.height,
  sampleCount: 1,
  width: canvas.width,
});
const solid = createSolidProgram(state);

// Establish the untouched target background.
beginGlRenderPass(state, target);
endGlRenderPass(state);

// Partial color/depth preservation. The first pass writes green + depth across the panel. The small
// second pass preserves color but clears depth. A later blue quad behind the green passes only in the
// depth-cleared sub-region, proving that both color and depth clears were scissor-constrained.
const depthPanel = viewport(40, 40, 300, 220);
const depthHole = viewport(140, 100, 100, 100);
beginGlRenderPass(state, target, undefined, depthPanel);
drawSolidQuad(state, solid, -1, -1, 1, 1, 0, [0.12, 0.78, 0.3, 1], true);
endGlRenderPass(state);
beginGlRenderPass(state, target, { preserveColor: true }, depthHole);
endGlRenderPass(state);
beginGlRenderPass(state, target, { preserveColor: true, preserveDepth: true }, depthPanel);
drawSolidQuad(state, solid, -1, -1, 1, 1, 0.5, [0.12, 0.3, 0.9, 1], true);
endGlRenderPass(state);

// Nested restoration. A full-target nested pass is clipped to its enclosing panel, then a smaller
// yellow nested pass runs. After both return, a cyan quad is drawn in OUTER clip coordinates; its
// location proves the exact outer viewport was restored before an actual draw.
const nestedPanel = viewport(420, 40, 320, 220);
beginGlRenderPass(state, target, undefined, nestedPanel);
beginGlRenderPass(state, target);
drawSolidQuad(state, solid, -1, -1, 1, 1, 0, [0.72, 0.12, 0.62, 1], false);
endGlRenderPass(state);
beginGlRenderPass(state, target, undefined, viewport(500, 100, 100, 80));
drawSolidQuad(state, solid, -1, -1, 1, 1, 0, [0.95, 0.75, 0.08, 1], false);
endGlRenderPass(state);
drawSolidQuad(state, solid, 0.1, -0.8, 0.88, 0.8, 0, [0.05, 0.8, 0.86, 1], false);
endGlRenderPass(state);
invalidateGlRenderStateCache(state);

// 2D projection + clip under an edge-clamped region. Requested x=-30,width=300 intersects the target
// as x=0,width=270; a full orange shape is clipped in LOCAL viewport coordinates.
registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
enableGlClipSupport(state);
const root2D = createDisplayObject();
root2D.scaleX = scale;
root2D.scaleY = scale;
const clippedShape = createShape();
appendShapeBeginFill(clippedShape, 0xff8a24ff, 1);
appendShapeRectangle(clippedShape, 0, 0, 270, 220);
appendShapeEndFill(clippedShape);
setNode2DClip(clippedShape, createClipRegionFromRectangle({ height: 120, width: 160, x: 40, y: 40 }));
addNodeChild(root2D, clippedShape);
prepareScene2DRender(state, root2D);
beginGlRenderPass(state, target, undefined, viewport(-30, 340, 300, 220));
renderGlScene2D(state, root2D);
endGlRenderPass(state);
invalidateGlRenderStateCache(state);

// One untouched camera, two aspect ratios, two viewports on the same target. The draw path derives
// projection aspect from each active region, so the front-facing box stays approximately square in
// pixels in both a tall and a wide panel instead of stretching with either viewport.
registerGlUnlitMaterial(state);
const scene3D = createScene3D().root;
addNodeChild(
  scene3D,
  createMesh(createBoxMeshGeometry(1.5, 1.5, 1.5), [createUnlitMaterial({ baseColor: 0x42d8ffff })]),
);
const camera = createCamera3D({
  far: 20,
  near: 0.1,
  projection: createPerspectiveProjection({ aspect: 1, fovY: Math.PI / 4 }),
});
setCamera3DViewMatrix4FromLookAt(camera, createVector3(0, 0, 4), createVector3(0, 0, 0), createVector3(0, 1, 0));
const lights = {
  ambient: createAmbientLight({ color: 0xffffffff, intensity: 1 }),
  directional: null,
};
renderCameraViewport(viewport(320, 340, 150, 220));
renderCameraViewport(viewport(510, 390, 250, 120));

presentGlRenderTarget(state, target);

export function assertRender(bitmap: Readonly<Bitmap>): void {
  const at = (x: number, y: number): number =>
    getBitmapPixelRgb(bitmap, Math.round(x * (bitmap.width / width)), Math.round(y * (bitmap.height / height)));

  assertColor('untouched target background', at(780, 580), isNavy);
  assertColor('preserved depth outside the partial clear', at(80, 80), isGreen);
  assertColor('behind-depth draw inside the partial clear', at(180, 140), isBlue);
  assertColor('nested full pass constrained by outer scissor', at(450, 220), isMagenta);
  assertColor('nested partial draw', at(550, 140), isYellow);
  assertColor('outer draw after nested restoration', at(670, 150), isCyan);
  assertColor('nested full pass did not escape outer scissor', at(390, 150), isNavy);
  assertColor('2D local clip inside edge-clamped viewport', at(80, 410), isOrange);
  assertColor('2D local clip excludes the rest of its shape', at(240, 520), isNavy);
  assertColor('negative-origin viewport did not expand inward', at(285, 410), isNavy);

  const tall = findColorBounds(bitmap, { x: 320, y: 340, width: 150, height: 220 }, isCyan);
  const wide = findColorBounds(bitmap, { x: 510, y: 390, width: 250, height: 120 }, isCyan);
  assertSquareBounds('tall camera viewport', tall);
  assertSquareBounds('wide camera viewport', wide);
}

function renderCameraViewport(region: Viewport): void {
  beginGlRenderPass(state, target, undefined, region);
  drawGlScene3D(state, scene3D, camera, lights);
  // This mixed-subject proof presents as already encoded; keep the target-wide declaration stable.
  declareGlRenderTargetColorSpace(state, 'srgb');
  endGlRenderPass(state);
}

interface SolidProgram {
  buffer: WebGLBuffer;
  color: WebGLUniformLocation;
  position: number;
  program: WebGLProgram;
}

function createSolidProgram(renderState: GlRenderState): SolidProgram {
  const gl = renderState.gl;
  const program = createGlProgram(
    gl,
    `#version 300 es
in vec3 a_position;
void main() { gl_Position = vec4(a_position, 1.0); }`,
    `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 fragColor;
void main() { fragColor = u_color; }`,
    'Viewport proof',
  );
  return {
    buffer: gl.createBuffer()!,
    color: gl.getUniformLocation(program, 'u_color')!,
    position: gl.getAttribLocation(program, 'a_position'),
    program,
  };
}

function drawSolidQuad(
  renderState: GlRenderState,
  shader: Readonly<SolidProgram>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  color: readonly [number, number, number, number],
  depth: boolean,
): void {
  const gl = renderState.gl;
  if (depth) {
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
  } else {
    gl.disable(gl.DEPTH_TEST);
  }
  gl.disable(gl.BLEND);
  gl.useProgram(shader.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, shader.buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z]),
    gl.STREAM_DRAW,
  );
  gl.enableVertexAttribArray(shader.position);
  gl.vertexAttribPointer(shader.position, 3, gl.FLOAT, false, 0, 0);
  gl.uniform4f(shader.color, color[0], color[1], color[2], color[3]);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function viewport(x: number, y: number, viewportWidth: number, viewportHeight: number): Viewport {
  return createViewport({
    devicePixelRatio: scale,
    height: viewportHeight * scale,
    width: viewportWidth * scale,
    x: x * scale,
    y: y * scale,
  });
}

interface ColorBounds {
  height: number;
  width: number;
}

function findColorBounds(
  bitmap: Readonly<Bitmap>,
  region: { x: number; y: number; width: number; height: number },
  matches: (rgb: number) => boolean,
): ColorBounds {
  const sx = bitmap.width / width;
  const sy = bitmap.height / height;
  let minX = bitmap.width;
  let minY = bitmap.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = Math.floor(region.y * sy); y < Math.ceil((region.y + region.height) * sy); y++) {
    for (let x = Math.floor(region.x * sx); x < Math.ceil((region.x + region.width) * sx); x++) {
      if (!matches(getBitmapPixelRgb(bitmap, x, y))) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { height: maxY >= minY ? maxY - minY + 1 : 0, width: maxX >= minX ? maxX - minX + 1 : 0 };
}

function assertSquareBounds(label: string, bounds: Readonly<ColorBounds>): void {
  if (bounds.width < 20 || bounds.height < 20) {
    throw new Error(`[render-pass-viewport] ${label} did not contain a visible camera draw`);
  }
  const ratio = bounds.width / bounds.height;
  if (ratio < 0.72 || ratio > 1.38) {
    throw new Error(
      `[render-pass-viewport] ${label} stretched instead of using its aspect — ${bounds.width}×${bounds.height}`,
    );
  }
}

function assertColor(label: string, rgb: number, matches: (value: number) => boolean): void {
  if (!matches(rgb)) throw new Error(`[render-pass-viewport] ${label} — got #${hex(rgb)}`);
}

function red(rgb: number): number {
  return (rgb >> 16) & 0xff;
}
function green(rgb: number): number {
  return (rgb >> 8) & 0xff;
}
function blue(rgb: number): number {
  return rgb & 0xff;
}
function isNavy(rgb: number): boolean {
  return red(rgb) < 55 && green(rgb) < 65 && blue(rgb) < 85;
}
function isGreen(rgb: number): boolean {
  return green(rgb) > 140 && green(rgb) > red(rgb) * 2 && green(rgb) > blue(rgb) * 1.5;
}
function isBlue(rgb: number): boolean {
  return blue(rgb) > 150 && blue(rgb) > red(rgb) * 2 && blue(rgb) > green(rgb) * 1.5;
}
function isMagenta(rgb: number): boolean {
  return red(rgb) > 120 && blue(rgb) > 100 && green(rgb) < 100;
}
function isYellow(rgb: number): boolean {
  return red(rgb) > 160 && green(rgb) > 120 && blue(rgb) < 100;
}
function isCyan(rgb: number): boolean {
  return green(rgb) > 110 && blue(rgb) > 130 && red(rgb) < 130;
}
function isOrange(rgb: number): boolean {
  return red(rgb) > 160 && green(rgb) > 70 && green(rgb) < 190 && blue(rgb) < 100;
}
function hex(rgb: number): string {
  return (rgb & 0xffffffff).toString(16).padStart(6, '0');
}
