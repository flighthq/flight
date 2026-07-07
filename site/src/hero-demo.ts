import type { DisplayObject } from '@flighthq/sdk';
import {
  addNodeChild,
  addTextureAtlasRegion,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeRoundRectangle,
  buildParticleCurve,
  connectSignal,
  createCanvasElement,
  createCanvasRenderState,
  createDisplayObject,
  createImageResource,
  createParticleEmitter,
  createParticleEmitterConfig,
  createParticleEmitterState,
  createQuadBatch,
  createRandomSource,
  createShape,
  createTextureAtlas,
  createTween,
  createTweenManager,
  defaultCanvasParticleEmitterRenderer,
  defaultCanvasQuadBatchRenderer,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  easeInOutQuadratic,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  prewarmParticleEmitter,
  QuadBatchKind,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  renderCanvasSprite,
  resizeQuadBatch,
  ShapeKind,
  updateParticleEmitter,
  updateTweens,
} from '@flighthq/sdk';

const WIDTH = 300;
const HEIGHT = 190;

interface Viewport {
  // Renderable root — a display object tree, or a sprite-graph node (quad batch / emitter) when
  // `sprite` is set.
  root: DisplayObject;
  sprite?: boolean;
  // Short label shown in the stage corner (live count / emitter status).
  statusLabel?: string;
  // Per-frame mutation only — the loop below renders. `deltaMs` is the time since the last frame.
  animate?: (timeMs: number, deltaMs: number) => void;
}

interface Example {
  id: string;
  // Highlighted HTML of the snippet shown on the page — the same calls build() makes, so the code a
  // reader sees is the code that produced the pixels beside it.
  code: string;
  build: (pixelRatio: number) => Viewport;
}

// Mount the tabbed "live code" panel: one Canvas render state (no extra Gl context), and tabs that
// swap both the rendered scene and the snippet shown beside it. Each tab is a small, honest dogfood of
// a different corner of the API — shapes, tweens, the scene graph, quad batching, and particles.
export function startHeroDemo(): void {
  const stage = document.getElementById('demo-stage');
  const source = document.getElementById('demo-source');
  if (stage === null || source === null) return;
  const sourceEl = source;
  const statEl = document.getElementById('demo-stat');

  const pixelRatio = window.devicePixelRatio || 1;
  const canvas = createCanvasElement(WIDTH, HEIGHT, pixelRatio);
  stage.appendChild(canvas);

  const state = createCanvasRenderState(canvas, {
    backgroundColor: 0x00000000, // transparent — the card behind shows through
    sceneGraphSyncPolicy: 'requiresInvalidation',
  });
  registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
  registerCanvasShapeCommands(defaultCanvasShapeCommands);
  registerRenderer(state, QuadBatchKind, defaultCanvasQuadBatchRenderer);
  registerRenderer(state, ParticleEmitterKind, defaultCanvasParticleEmitterRenderer);

  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.demo-tab'));
  let scene: Viewport = EXAMPLES[0].build(pixelRatio);
  sourceEl.innerHTML = EXAMPLES[0].code;

  function select(example: Example): void {
    scene = example.build(pixelRatio);
    sourceEl.innerHTML = example.code;
    for (const tab of tabs) tab.classList.toggle('is-active', tab.dataset.demo === example.id);
  }
  for (const tab of tabs) {
    const example = EXAMPLES.find((entry) => entry.id === tab.dataset.demo);
    if (example !== undefined) tab.addEventListener('click', () => select(example));
  }

  let prev = 0;
  let frames = 0;
  let fpsAt = 0;
  let fps = 0;
  function frame(timeMs: number): void {
    const deltaMs = prev === 0 ? 16 : timeMs - prev;
    prev = timeMs;
    frames++;
    if (timeMs - fpsAt >= 500) {
      fps = Math.round((frames * 1000) / (timeMs - fpsAt));
      frames = 0;
      fpsAt = timeMs;
    }

    scene.animate?.(timeMs, deltaMs);
    if (prepareDisplayObjectRender(state, scene.root)) {
      renderCanvasBackground(state);
      if (scene.sprite === true) renderCanvasSprite(state, scene.root);
      else renderCanvasDisplayObject(state, scene.root);
    }

    if (statEl !== null) {
      if (scene.statusLabel !== undefined) {
        statEl.textContent = `${scene.statusLabel} · ${fps} fps`;
        statEl.style.display = '';
      } else {
        statEl.style.display = 'none';
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function createRoot(pixelRatio: number): DisplayObject {
  const root = createDisplayObject();
  root.scaleX = pixelRatio;
  root.scaleY = pixelRatio;
  invalidateNodeLocalTransform(root);
  return root;
}

// A tiny two-facet paper plane, drawn procedurally so the batch / particle tabs ship no image asset.
function drawPlaneSprite(ctx: CanvasRenderingContext2D, size: number): void {
  const m = 0.1 * size;
  const sc = (size - 2 * m) / 20;
  const p = (x: number, y: number): [number, number] => [m + (x - 2) * sc, m + (y - 2) * sc];
  const [tip, bot, notch, left] = [p(22, 2), p(15, 22), p(11, 13), p(2, 9)];
  ctx.fillStyle = '#7ab8ff';
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(bot[0], bot[1]);
  ctx.lineTo(notch[0], notch[1]);
  ctx.lineTo(left[0], left[1]);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#548ee8';
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(bot[0], bot[1]);
  ctx.lineTo(notch[0], notch[1]);
  ctx.closePath();
  ctx.fill();
}

function planeAtlas(size: number): ReturnType<typeof createTextureAtlas> {
  const tex = document.createElement('canvas');
  tex.width = size;
  tex.height = size;
  const ctx = tex.getContext('2d');
  if (ctx !== null) drawPlaneSprite(ctx, size);
  const atlas = createTextureAtlas({ image: createImageResource(tex) });
  addTextureAtlasRegion(atlas, 0, 0, size, size);
  return atlas;
}

const EXAMPLES: Example[] = [
  {
    id: 'shapes',
    code: `<span class="cm">// Plain nodes — no globals, no hidden state.</span>
<span class="k">const</span> root = <span class="fn">createDisplayObject</span>();

<span class="k">const</span> box = <span class="fn">createShape</span>();
<span class="fn">appendShapeBeginFill</span>(box, <span class="n">0x3d7fff</span>);
<span class="fn">appendShapeRoundRectangle</span>(box, 26, 52, 86, 86, 16, 16);
<span class="fn">addNodeChild</span>(root, box);

<span class="k">const</span> dot = <span class="fn">createShape</span>();
<span class="fn">appendShapeBeginFill</span>(dot, <span class="n">0x7ab8ff</span>);
<span class="fn">appendShapeCircle</span>(dot, 208, 70, 40);
<span class="fn">addNodeChild</span>(root, dot);

<span class="cm">// One render pass, called by name.</span>
<span class="fn">prepareDisplayObjectRender</span>(state, root);
<span class="fn">renderCanvasBackground</span>(state);
<span class="fn">renderCanvasDisplayObject</span>(state, root);`,
    build(pixelRatio) {
      const root = createRoot(pixelRatio);
      const box = createShape();
      appendShapeBeginFill(box, 0x3d7fff);
      appendShapeRoundRectangle(box, 26, 52, 86, 86, 16, 16);
      addNodeChild(root, box);
      const dot = createShape();
      appendShapeBeginFill(dot, 0x7ab8ff);
      appendShapeCircle(dot, 208, 70, 40);
      addNodeChild(root, dot);
      return { root };
    },
  },
  {
    id: 'tween',
    code: `<span class="cm">// Tween a property to a target with easing — you still drive the update.</span>
<span class="k">const</span> manager = <span class="fn">createTweenManager</span>();

<span class="k">const</span> box = <span class="fn">createShape</span>();
<span class="fn">appendShapeBeginFill</span>(box, <span class="n">0x3d7fff</span>);
<span class="fn">appendShapeRoundRectangle</span>(box, -34, -34, 68, 68, 14, 14);
box.y = 95;
<span class="fn">addNodeChild</span>(root, box);

<span class="k">const</span> tween = <span class="fn">createTween</span>(manager, box, 1000, { x: 232 }, { ease: easeInOutQuadratic });
<span class="fn">connectSignal</span>(tween.onUpdate, () =&gt; <span class="fn">invalidateNodeLocalTransform</span>(box));

<span class="k">function</span> frame(time, delta) {
  <span class="fn">updateTweens</span>(manager, delta);   <span class="cm">// you advance time; you render</span>
  <span class="fn">prepareDisplayObjectRender</span>(state, root);
  <span class="fn">renderCanvasBackground</span>(state);
  <span class="fn">renderCanvasDisplayObject</span>(state, root);
  <span class="fn">requestAnimationFrame</span>(frame);
}`,
    build(pixelRatio) {
      const root = createRoot(pixelRatio);
      const manager = createTweenManager();
      const box = createShape();
      appendShapeBeginFill(box, 0x3d7fff);
      appendShapeRoundRectangle(box, -34, -34, 68, 68, 14, 14);
      box.x = 68;
      box.y = 95;
      addNodeChild(root, box);

      function slide(toX: number): void {
        const tween = createTween(manager, box, 1000, { x: toX }, { ease: easeInOutQuadratic });
        connectSignal(tween.onUpdate, () => invalidateNodeLocalTransform(box));
        connectSignal(tween.onComplete, () => slide(toX > 150 ? 68 : 232));
      }
      slide(232);

      return {
        root,
        animate(_timeMs, deltaMs) {
          updateTweens(manager, deltaMs);
        },
      };
    },
  },
  {
    id: 'group',
    code: `<span class="cm">// A container is just a display object with children.</span>
<span class="k">const</span> group = <span class="fn">createDisplayObject</span>();
group.x = 150;
group.y = 95;
<span class="fn">addNodeChild</span>(root, group);

<span class="k">const</span> a = <span class="fn">createShape</span>();
<span class="fn">appendShapeBeginFill</span>(a, <span class="n">0x3d7fff</span>);
<span class="fn">appendShapeRoundRectangle</span>(a, -52, -18, 42, 36, 8, 8);
<span class="fn">addNodeChild</span>(group, a);

<span class="k">const</span> b = <span class="fn">createShape</span>();
<span class="fn">appendShapeBeginFill</span>(b, <span class="n">0x7ab8ff</span>);
<span class="fn">appendShapeCircle</span>(b, 28, 0, 22);
<span class="fn">addNodeChild</span>(group, b);

<span class="k">function</span> frame(time) {
  group.rotation = time * 0.03;       <span class="cm">// degrees — the group turns, children follow</span>
  <span class="fn">invalidateNodeLocalTransform</span>(group);
  <span class="fn">prepareDisplayObjectRender</span>(state, root);
  <span class="fn">renderCanvasBackground</span>(state);
  <span class="fn">renderCanvasDisplayObject</span>(state, root);
  <span class="fn">requestAnimationFrame</span>(frame);
}`,
    build(pixelRatio) {
      const root = createRoot(pixelRatio);
      const group = createDisplayObject();
      group.x = 150;
      group.y = 95;
      addNodeChild(root, group);
      const a = createShape();
      appendShapeBeginFill(a, 0x3d7fff);
      appendShapeRoundRectangle(a, -52, -18, 42, 36, 8, 8);
      addNodeChild(group, a);
      const b = createShape();
      appendShapeBeginFill(b, 0x7ab8ff);
      appendShapeCircle(b, 28, 0, 22);
      addNodeChild(group, b);
      return {
        root,
        animate(timeMs) {
          group.rotation = timeMs * 0.03;
          invalidateNodeLocalTransform(group);
        },
      };
    },
  },
  {
    id: 'batch',
    code: `<span class="cm">// One node holds hundreds of sprites in a single batch.</span>
<span class="k">const</span> batch = <span class="fn">createQuadBatch</span>();
batch.data.atlas = atlas;             <span class="cm">// shared texture</span>
<span class="fn">resizeQuadBatch</span>(batch, count);      <span class="cm">// grow the instance buffer</span>

<span class="k">function</span> frame(time) {
  <span class="k">const</span> xy = batch.data.transforms;  <span class="cm">// flat [x, y] per instance</span>
  <span class="k">for</span> (<span class="k">let</span> i = 0; i &lt; count; i++) {
    xy[i * 2]     = px[i];            <span class="cm">// move each sprite</span>
    xy[i * 2 + 1] = py[i];
  }
  <span class="fn">invalidateNodeAppearance</span>(batch);
  <span class="fn">prepareDisplayObjectRender</span>(state, batch);
  <span class="fn">renderCanvasBackground</span>(state);
  <span class="fn">renderCanvasSprite</span>(state, batch);   <span class="cm">// one batched draw</span>
  <span class="fn">requestAnimationFrame</span>(frame);
}`,
    build(pixelRatio) {
      const COUNT = 450;
      const SIZE = 22;
      const atlas = planeAtlas(SIZE);

      const batch = createQuadBatch();
      batch.data.atlas = atlas;
      batch.scaleX = pixelRatio;
      batch.scaleY = pixelRatio;
      resizeQuadBatch(batch, COUNT);

      const px = new Float64Array(COUNT);
      const py = new Float64Array(COUNT);
      const vx = new Float64Array(COUNT);
      const vy = new Float64Array(COUNT);
      for (let i = 0; i < COUNT; i++) {
        px[i] = Math.random() * WIDTH;
        py[i] = Math.random() * HEIGHT;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.4 + Math.random() * 1.2;
        vx[i] = Math.cos(angle) * speed;
        vy[i] = Math.sin(angle) * speed;
      }

      return {
        root: batch,
        sprite: true,
        statusLabel: `${COUNT} planes`,
        animate() {
          const xy = batch.data.transforms;
          for (let i = 0; i < COUNT; i++) {
            let x = px[i] + vx[i];
            let y = py[i] + vy[i];
            if (x < -SIZE) x = WIDTH;
            else if (x > WIDTH) x = -SIZE;
            if (y < -SIZE) y = HEIGHT;
            else if (y > HEIGHT) y = -SIZE;
            px[i] = x;
            py[i] = y;
            xy[i * 2] = x;
            xy[i * 2 + 1] = y;
          }
          invalidateNodeAppearance(batch);
        },
      };
    },
  },
  {
    id: 'particles',
    code: `<span class="cm">// An emitter spawns, ages, and recycles particles for you.</span>
<span class="k">const</span> emitter = <span class="fn">createParticleEmitter</span>();
emitter.data.atlas = atlas;

<span class="k">const</span> config = <span class="fn">createParticleEmitterConfig</span>({
  spawnRate: 22,
  lifetimeMin: 1.4, lifetimeMax: 2.8,
  speedMin: 36, speedMax: 78,
  directionY: -1, spread: 0.8,
  alphaCurve, scaleMin: 0.55, scaleMax: 1.25,
});

<span class="k">function</span> frame(time, delta) {
  <span class="fn">updateParticleEmitter</span>(emitter, sim, config, delta);
  <span class="fn">invalidateNodeAppearance</span>(emitter);
  <span class="fn">prepareDisplayObjectRender</span>(state, emitter);
  <span class="fn">renderCanvasBackground</span>(state);
  <span class="fn">renderCanvasSprite</span>(state, emitter);
  <span class="fn">requestAnimationFrame</span>(frame);
}`,
    build(pixelRatio) {
      const atlas = planeAtlas(20);
      const emitter = createParticleEmitter();
      emitter.data.atlas = atlas;
      emitter.x = (WIDTH / 2) * pixelRatio;
      emitter.y = HEIGHT * pixelRatio;
      invalidateNodeLocalTransform(emitter);

      const alphaCurve = buildParticleCurve((t) => Math.sin(Math.PI * t));
      const config = createParticleEmitterConfig({
        worldSpace: true,
        emitterShape: 'point',
        spawnRate: 22,
        lifetimeMin: 1.4,
        lifetimeMax: 2.8,
        speedMin: 36 * pixelRatio,
        speedMax: 78 * pixelRatio,
        directionX: 0,
        directionY: -1,
        spread: 0.8,
        alphaCurve,
        scaleMin: 0.55,
        scaleMax: 1.25,
        maxParticles: 160,
      });

      const sim = createParticleEmitterState(createRandomSource(0x71a));
      const worldTransform = { a: 1, b: 0, c: 0, d: 1, tx: emitter.x, ty: emitter.y };
      prewarmParticleEmitter(emitter, sim, config, config.lifetimeMax, 1 / 60, undefined, worldTransform);
      invalidateNodeAppearance(emitter);

      return {
        root: emitter,
        sprite: true,
        statusLabel: 'particle emitter',
        animate(_timeMs, deltaMs) {
          updateParticleEmitter(emitter, sim, config, deltaMs / 1000, undefined, worldTransform);
          invalidateNodeAppearance(emitter);
        },
      };
    },
  },
];
