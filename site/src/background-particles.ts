import {
  addTextureAtlasRegion,
  BlendMode,
  buildParticleCurve,
  createGlCanvasElement,
  createGlRenderState,
  createImageResource,
  createParticleEmitter,
  createParticleEmitterConfig,
  createParticleEmitterState,
  createRandomSource,
  createTextureAtlas,
  defaultGlParticleEmitterRenderer,
  enableGlBlendModeSupport,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  ParticleEmitterKind,
  prepareDisplayObjectRender,
  prewarmParticleEmitter,
  registerDefaultGlMaterial,
  registerRenderer,
  renderGlBackground,
  renderGlSprite,
  updateParticleEmitter,
} from '@flighthq/sdk';

// The landing background: a calm field of blue glow motes drifting behind the content, rendered with
// Flight's particle emitter so the page dogfoods the SDK instead of faking motion with CSS. The
// emitter spawns across the whole viewport (a rect emitter the size of the drawing buffer), drifts
// each mote gently and omnidirectionally, and fades it in and out over a long life, so the field
// stays evenly populated and never pops. It is prewarmed to a full field on load.
//
// Each mote is a single white disc tinted per particle from a palette of blues (keeping the old orb
// background's light-sky-to-deep-blue variety). Focus is driven by scale and opacity, not a texture
// swap: scaled small the disc reads as a crisp in-focus point; scaled large and dimmed it reads as a
// soft out-of-focus bokeh disc, because the disc's fixed-fraction soft edge becomes a wide, hazy band
// when it is large. Both are continuous curves the sim interpolates per frame, so each disc drifts
// smoothly in and out of focus over its life — round discs at varying depth, clearer or hazier as they
// move, with no stepping. A wide per-particle base size layers static near/far depth on top. One
// emitter (one Gl context) now does the whole job.
//
// The emitter draws from its own fixed-seed random source, so the field is identical on every load.
// That makes the visual-regression capture reproducible without depending on the global Math.random —
// the capture harness also pins the clock and halts the loop on a fixed frame, but a self-contained
// seed keeps the simulation immune to any other code touching Math.random.

const BACKGROUND = 0x0e0e0eff;
const PARTICLE_SEED = 0x5eed1e;

export function startParticleBackground(): void {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const scale = pixelRatio;

  const canvas = createGlCanvasElement(width, height, pixelRatio);
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';
  document.body.prepend(canvas);

  const state = createGlRenderState(canvas, {
    backgroundColor: BACKGROUND,
    sceneGraphSyncPolicy: 'requiresInvalidation',
  });
  registerRenderer(state, ParticleEmitterKind, defaultGlParticleEmitterRenderer);
  registerDefaultGlMaterial(state);
  // Opt into per-node blend modes so the emitter's additive (glow) blend takes effect.
  enableGlBlendModeSupport(state);

  // A single white disc — white so each particle's palette colour tints it (the Gl particle shader
  // multiplies texture RGB by the per-particle colour). Focus is not baked into the texture; it comes
  // from scale and opacity (see the curves below), so this one disc serves both the crisp in-focus
  // points and the soft out-of-focus discs: a solid core with a soft outer edge reads as a sub-pixel
  // crisp sliver when the disc is small and a wide, hazy band when it is large. The cell is generous so
  // the largest discs stay smooth when scaled up.
  const CELL = 64;
  const moteCanvas = document.createElement('canvas');
  moteCanvas.width = CELL;
  moteCanvas.height = CELL;
  const ctx = moteCanvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(CELL / 2, CELL / 2, 0, CELL / 2, CELL / 2, CELL / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.6, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CELL, CELL);

  const atlas = createTextureAtlas({ image: createImageResource(moteCanvas) });
  addTextureAtlasRegion(atlas, 0, 0, CELL, CELL);

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

  // Focus over the life: a single slow breath whose period is the particle's lifetime (so the long
  // lifetimes below are what make the depth drift slow). focus 0 = in focus (small, bright, crisp),
  // 1 = out of focus (large, faint, soft). The phase puts the crisp point near t=0.25 and the bokeh
  // near t=0.75, both in the bright middle of the life, while birth and death sit at mid-focus and fade
  // out via the envelope below — so nothing pops in, and both the crisp and hazy extremes are seen.
  const focusAt = (t: number): number => 0.5 - 0.5 * Math.sin(2 * Math.PI * t);
  // Scale carries the apparent depth — small in focus, large defocused — multiplying the per-particle
  // base size. Linearly interpolated every frame, so the focus drift is smooth rather than stepped.
  const scaleCurve = buildParticleCurve((t) => 0.4 + 1.3 * focusAt(t), 48);
  // Alpha is the birth/death fade (sin envelope) times a focus dim: bright in focus, faint defocused,
  // so the hazy discs recede. The envelope reaching 0 at both ends keeps spawns and deaths invisible.
  const alphaCurve = buildParticleCurve((t) => Math.sin(Math.PI * t) * (0.5 - 0.34 * focusAt(t)), 48);

  const config = createParticleEmitterConfig({
    worldSpace: true,
    emitterShape: 'rect',
    emitterWidth: width * scale,
    emitterHeight: height * scale,
    // Long lifetimes set the depth-drift speed (one focus breath per life). spawnRate is scaled down
    // with them so the steady-state count (≈ spawnRate × average lifetime) stays the same.
    spawnRate: 3.2,
    lifetimeMin: 22.5,
    lifetimeMax: 40,
    speedMin: 3 * scale,
    speedMax: 11 * scale,
    spread: Math.PI * 2,
    directionX: 0,
    directionY: -1,
    alphaCurve,
    scaleCurve,
    // Per-particle colour variation across a palette of blues, like the old orb background: full-blue
    // B with varied R/G spans light sky blue (high R/G) to deep blue (low R/G). No colour curve, so
    // colour stays in the palette instead of progressing over life; birth and death share the same
    // centre and spread, so any shift is a slow wander within the palette over the long lifetime.
    colorStartR: 0.43,
    colorStartG: 0.66,
    colorStartB: 1,
    colorStartVarianceR: 0.2,
    colorStartVarianceG: 0.17,
    colorStartVarianceB: 0,
    colorEndR: 0.43,
    colorEndG: 0.66,
    colorEndB: 1,
    colorEndVarianceR: 0.2,
    colorEndVarianceG: 0.17,
    colorEndVarianceB: 0,
    // Per-particle base size layers static depth under the focus breath: small motes sit far, large
    // ones near. scaleCurve also swells each disc as it defocuses, so on-screen size both varies across
    // the field and breathes over each disc's focus cycle. Fewer, slower, longer-lived particles keep
    // the larger sizes from reading as busy.
    scaleMin: 0.3 * scale,
    scaleMax: 3.64 * scale,
    maxParticles: 120,
  });

  const simState = createParticleEmitterState(createRandomSource(PARTICLE_SEED));

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

    if (prepareDisplayObjectRender(state, emitter)) {
      renderGlBackground(state);
      renderGlSprite(state, emitter);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
