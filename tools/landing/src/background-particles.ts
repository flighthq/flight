import {
  addTextureAtlasRegion,
  BlendMode,
  buildParticleCurve,
  createImageResource,
  createParticleEmitter,
  createParticleEmitterConfig,
  createParticleEmitterState,
  createSeededRandomSource,
  createTextureAtlas,
  createWebGLCanvasElement,
  createWebGLRenderState,
  defaultWebGLParticleEmitterRenderer,
  enableWebGLBlendModeSupport,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  particleColorCurveFromKeyframes,
  ParticleEmitterKind,
  prepareSpriteRender,
  prewarmParticleEmitter,
  registerDefaultWebGLMaterial,
  registerRenderer,
  renderWebGLBackground,
  renderWebGLSprite,
  updateParticleEmitter,
} from '@flighthq/sdk';

// A calm field of soft blue glow motes drifting behind the landing content, rendered with Flight's
// particle emitter — the particle counterpart to background-orbs.ts. main.ts selects between them.
// The emitter spawns across the whole viewport (a rect emitter the size of the drawing buffer),
// drifts each mote gently and omnidirectionally, and fades it in and out over a long life, so the
// field stays evenly populated and never pops. It is prewarmed to a full field on load.
//
// The emitter draws from its own fixed-seed random source, so the field is identical on every load
// (like the orb background). That makes the visual-regression capture reproducible without depending
// on the global Math.random — the capture harness also pins the clock and halts the loop on a fixed
// frame, but a self-contained seed keeps the simulation immune to any other code touching Math.random.

const BACKGROUND = 0x0e0e0eff;
const PARTICLE_SEED = 0x5eed1e;

export function startParticleBackground(): void {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = pixelRatio;

  const canvas = createWebGLCanvasElement(width, height, pixelRatio);
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';
  document.body.prepend(canvas);

  const state = createWebGLRenderState(canvas, {
    backgroundColor: BACKGROUND,
    sceneGraphSyncPolicy: 'requiresInvalidation',
  });
  registerRenderer(state, ParticleEmitterKind, defaultWebGLParticleEmitterRenderer);
  registerDefaultWebGLMaterial(state);
  // Opt into per-node blend modes so the emitter's additive (glow) blend takes effect.
  enableWebGLBlendModeSupport(state);

  // Procedural mote texture: a soft radial glow, white-blue core fading to transparent. Premultiplied
  // additive blending turns overlapping motes into a gentle bloom rather than hard-edged sprites.
  const moteCanvas = document.createElement('canvas');
  moteCanvas.width = 32;
  moteCanvas.height = 32;
  const ctx = moteCanvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(220, 236, 255, 1)');
  grad.addColorStop(0.35, 'rgba(120, 184, 255, 0.7)');
  grad.addColorStop(1, 'rgba(61, 127, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);

  const atlas = createTextureAtlas({ image: createImageResource(moteCanvas) });
  addTextureAtlasRegion(atlas, 0, 0, 32, 32);

  // World-space particles are rendered directly in physical pixels and ignore the emitter node's
  // transform, so magnitudes below are authored in physical px (× scale). The emitter sits at the
  // viewport centre; a rect the size of the buffer spreads spawns across the whole screen.
  const emitter = createParticleEmitter();
  emitter.data.atlas = atlas;
  emitter.blendMode = BlendMode.Add;
  emitter.scaleX = 1;
  emitter.scaleY = 1;
  emitter.x = (width * scale) / 2;
  emitter.y = (height * scale) / 2;
  invalidateNodeLocalTransform(emitter);

  // Fade each mote in and out over its life so spawns and deaths are never visible; a steady base
  // scale keeps the bloom soft. Tint runs white-blue → landing blue across the life.
  const alphaCurve = buildParticleCurve((t) => 0.6 * Math.sin(Math.PI * t));
  const colorCurve = particleColorCurveFromKeyframes([
    { time: 0, r: 0.86, g: 0.92, b: 1 },
    { time: 0.5, r: 0.48, g: 0.72, b: 1 },
    { time: 1, r: 0.24, g: 0.5, b: 1 },
  ]);

  const config = createParticleEmitterConfig({
    worldSpace: true,
    emitterShape: 'rect',
    emitterWidth: width * scale,
    emitterHeight: height * scale,
    spawnRate: 45,
    lifetimeMin: 5,
    lifetimeMax: 9,
    speedMin: 5 * scale,
    speedMax: 22 * scale,
    spread: Math.PI * 2,
    directionX: 0,
    directionY: -1,
    alphaCurve,
    colorCurve,
    scaleMin: 0.5 * scale,
    scaleMax: 1.8 * scale,
    maxParticles: 400,
  });

  const simState = createParticleEmitterState(createSeededRandomSource(PARTICLE_SEED));

  // Emitter world matrix: translation only (magnitudes are already physical px).
  const worldTransform = { a: 1, b: 0, c: 0, d: 1, tx: emitter.x, ty: emitter.y };

  // Prewarm a full life's worth so the field is already populated on the first frame instead of
  // filling in from empty. With the seeded source above, the prewarmed field is identical every load.
  prewarmParticleEmitter(emitter, simState, config, config.lifetimeMax, 1 / 60, undefined, worldTransform);
  invalidateNodeAppearance(emitter);

  // Under visual-regression capture the harness sets window.__flightCapture before any page script
  // runs. In that mode the field holds the prewarmed frame: it is never stepped, so every rendered
  // frame is byte-identical and the screenshot hash is stable enough to commit as the baseline. The
  // scene is still redrawn each tick so the buffer stays populated. For real visitors the flag is
  // unset and the field animates from the prewarmed state. This is robust where relying on the
  // harness to halt a heavy simulation on a fixed frame is not: the captured frame never advances.
  const captureMode = (window as unknown as { __flightCapture?: boolean }).__flightCapture === true;

  let lastTime = performance.now();
  function frame(): void {
    if (!captureMode) {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      updateParticleEmitter(emitter, simState, config, dt, undefined, worldTransform);
      invalidateNodeAppearance(emitter);
    }

    if (prepareSpriteRender(state, emitter)) {
      renderWebGLBackground(state);
      renderWebGLSprite(state, emitter);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
