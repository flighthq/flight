import { createAppWindow, openWindow } from '@flighthq/app';
import {
  webHostGl,
  createWebImageResourceFromCanvas,
  appendWebSurface,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from '@flighthq/host-web';
import { addNodeChild } from '@flighthq/node';
import { createParticleEmitter2D } from '@flighthq/particleemitter';
import { withKindMapEntry } from '@flighthq/registry';
import { prepareScene2DRender, registerNodeRenderer } from '@flighthq/render';
import {
  createGlRenderState,
  registerGlImageTextureResolver,
  beginGlRenderPass,
  endGlRenderPass,
  createGlScreenRenderTarget,
} from '@flighthq/render-gl';
import { createDisplayObject } from '@flighthq/scene2d';
import { glParticleEmitter2DRenderer, renderGlScene2D } from '@flighthq/scene2d-gl';
import { createGlSurface } from '@flighthq/surface';
import { createTexture } from '@flighthq/texture';
import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';
import { ParticleEmitter2DKind } from '@flighthq/types';

const appWindow = createAppWindow();
openWindow(webHostWindowLifecycle, webHostWindowGeometry, appWindow, {});
const glSurface = createGlSurface(webHostGl, appWindow, 400, 300, {
  contextAttributes: { alpha: false, preserveDrawingBuffer: true },
});
if (glSurface === null) throw new Error('Failed to acquire WebGL2 context');
appendWebSurface(glSurface, document.body);
document.body.style.margin = '0';

const registry = {
  nodeRenderers: withKindMapEntry(new Map(), ParticleEmitter2DKind, glParticleEmitter2DRenderer),
};
const state = createGlRenderState(glSurface.context, { ...registry, pixelRatio: 1 });
const screenTarget = createGlScreenRenderTarget(state.gl);

const registries = registry;
for (const [kind, renderer] of registries.nodeRenderers) {
  registerNodeRenderer(state, kind, renderer);
}
registerGlImageTextureResolver(state);

const source = document.createElement('canvas');
source.width = 32;
source.height = 32;
const sourceContext = source.getContext('2d');
if (sourceContext === null) throw new Error('The WebGL ParticleEmitter2D fixture requires a 2D texture source.');
sourceContext.fillStyle = '#ffd95b';
sourceContext.fillRect(0, 0, source.width, source.height);
const atlas = createTextureAtlas({
  regions: [createTextureAtlasRegion({ height: 32, id: 0, width: 32 })],
  texture: createTexture({ dimension: '2d', source: createWebImageResourceFromCanvas(source) }),
});

const root = createDisplayObject();
const emitter = createParticleEmitter2D({
  data: {
    alphas: new Float32Array([1, 0.8, 0.65]),
    atlas,
    colors: new Float32Array([1, 0.5, 0.2, 0.3, 0.8, 1, 1, 0.3, 0.7]),
    ids: new Uint16Array([0, 0, 0]),
    particleCount: 3,
    transforms: new Float32Array([0, 0, 0, 1, 48, 22, 0.2, 0.85, 92, -2, -0.2, 1.1]),
  },
});
emitter.x = 90;
emitter.y = 90;
addNodeChild(root, emitter);

prepareScene2DRender(state, root);
const pass = beginGlRenderPass(state, screenTarget);
renderGlScene2D(pass, root);
endGlRenderPass(pass);

Reflect.set(globalThis, '__flightScene2dGlPipelineParticleEmitter2D', { emitter, registries, root });
