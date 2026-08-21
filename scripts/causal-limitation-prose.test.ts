import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function read(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8');
}

function registrarKinds(backend: 'Canvas' | 'Gl' | 'Wgpu'): ReadonlySet<string> {
  const directory = backend.toLowerCase();
  const source = read(`packages/effects-${directory}/src/index.ts`);
  const kinds = new Set<string>();
  const pattern = new RegExp(`\\bregister${backend}([A-Z][A-Za-z0-9]*Effect)\\b`, 'g');
  for (const match of source.matchAll(pattern)) {
    if (match[1] !== 'RenderEffect') kinds.add(match[1]!);
  }
  return kinds;
}

const CANVAS_EFFECTS = [
  'BevelEffect',
  'BlendEffect',
  'BloomEffect',
  'BlurEffect',
  'CompositeEffect',
  'DropShadowEffect',
  'FilmGrainEffect',
  'GradientBevelEffect',
  'GradientGlowEffect',
  'InnerGlowEffect',
  'InnerShadowEffect',
  'LensDistortionEffect',
  'OuterGlowEffect',
  'PixelateEffect',
  'PosterizeEffect',
  'ScanlinesEffect',
  'TiltShiftEffect',
  'VignetteEffect',
] as const;

const DESCRIPTOR_ONLY_EFFECTS = [
  'AutoExposureEffect',
  'BarrelDistortionEffect',
  'FilmEmulationEffect',
  'PanniniProjectionEffect',
  'SsrEffect',
  'TaaEffect',
  'VolumetricLightEffect',
] as const;

// ★ TWO ENTRIES LEFT THIS LIST BECAUSE THEIR GAP CLOSED, WHICH IS THE OUTCOME IT EXISTS TO PRODUCE.
// `effect-msaa.webgpu` and `effect-msaa-bloom.webgpu` each asserted that Wgpu could not multisample, and
// each carried a tripwire saying to fail loudly if that ever changed. It changed — the effect target now
// honours sampleCount 4 — and both fired. Their assertions were INVERTED rather than deleted, so a
// regression back to the single-sample fallback still goes red; but they no longer guard a gap, so this
// registry is not where they belong. A closed gap must leave, or the list slowly becomes a record of
// what used to be true while claiming to be a list of what still is.
const DIRECT_FUNCTIONAL_GAP_GUARDS = [
  ['functional/scenes/color-adjustment.canvas.ts', 'capability landed and this cell'],
  ['functional/scenes/effect-bokeh-dof.webgpu.ts', 'now has a registered bokeh runner'],
  ['functional/scenes/effect-ssr.webgl.ts', 'Gl now has a registered SSR runner'],
  ['functional/scenes/effect-ssr.webgpu.ts', 'Wgpu now has a registered SSR runner'],
  ['functional/scenes/effect-taa.webgl.ts', 'Gl now has a registered TAA runner'],
  ['functional/scenes/effect-taa.webgpu.ts', 'Wgpu now has a registered TAA runner'],
  ['functional/scenes/material-blend-modes.webgl.ts', 'fixed-function MIN limitation has been repaired'],
  ['functional/scenes/material-blend-modes.webgpu.ts', 'fixed-function MIN limitation has been repaired'],
] as const;

const STILL_TRUE_ARCHITECTURE_GAPS = [
  'canvas-contact-shadows',
  'canvas-custom-shader',
  'canvas-dom-color-adjustment',
  'descriptor-only-effects',
  'dom-batch-kinds',
  'dom-effect-pipeline',
  'instanced-lod-mesh',
  'scene-area-lights',
  'wgpu-custom-shader-effect',
] as const;

describe('causal limitation prose', () => {
  const canvas = registrarKinds('Canvas');
  const gl = registrarKinds('Gl');
  const wgpu = registrarKinds('Wgpu');

  it('fails when effect coverage changes underneath the architecture documents', () => {
    expect([...canvas].sort()).toEqual([...CANVAS_EFFECTS].sort());
    expect(gl.size).toBe(46);
    expect(wgpu.size).toBe(44);

    const registration = read('agents/registration-model.md');
    expect(registration).toContain('46/46 on GL, 44/44 on WGPU, 18/18 on canvas');
    expect(registration).toContain('**GL 46 effect kinds, WGPU 44, canvas 18.**');

    const support = read('agents/render-backend-support.md');
    expect(support).toContain('On Canvas 2D, **18 are realized**');
    for (const kind of CANVAS_EFFECTS) expect(support).toContain(kind.replace(/Effect$/, ''));
  });

  it('keeps the 8 STILL TRUE functional claim sites attached to assert-the-gap guards', () => {
    expect(DIRECT_FUNCTIONAL_GAP_GUARDS).toHaveLength(8);
    // Collected rather than thrown one at a time: this loop reported only the FIRST mismatch, so when two
    // entries went stale together the second was invisible until the first was fixed. A list whose job is
    // to be complete should fail completely.
    const stale = DIRECT_FUNCTIONAL_GAP_GUARDS.filter(([path, marker]) => !read(path).includes(marker));

    expect(stale.map(([path]) => path)).toEqual([]);
  });

  it('fails when a descriptor-only effect gains a runner underneath the named seven-kind record', () => {
    for (const kind of DESCRIPTOR_ONLY_EFFECTS) {
      if (canvas.has(kind) || gl.has(kind) || wgpu.has(kind)) {
        throw new Error(
          `${kind} now has a runner, so agents/render-backend-support.md and agents/maturity-gaps.md ` +
            `must stop calling it descriptor-only`,
        );
      }
    }

    const support = read('agents/render-backend-support.md');
    expect(support).toContain('**Seven kinds have no runner on any backend at all**');
    for (const kind of DESCRIPTOR_ONLY_EFFECTS) expect(support).toContain(`\`${kind}\``);
  });

  it('fails when Wgpu bokeh support makes its functional control prose stale', () => {
    if (wgpu.has('BokehDepthOfFieldEffect')) {
      throw new Error(
        'Wgpu now has a BokehDepthOfFieldEffect runner; update effect-bokeh-dof.webgpu.ts and its description',
      );
    }
  });

  it('fails when the nine architecture gaps gain the capability their prose says is absent', () => {
    expect(STILL_TRUE_ARCHITECTURE_GAPS).toHaveLength(9);

    const canvasIndex = read('packages/scene2d-canvas/src/index.ts');
    const canvasState = read('packages/scene2d-canvas/src/canvasRenderState.ts');
    const domIndex = read('packages/scene2d-dom/src/index.ts');
    const domState = read('packages/scene2d-dom/src/domRenderState.ts');
    const maturity = read('agents/maturity-gaps.md');
    const support = read('agents/render-backend-support.md');

    if (canvas.has('CustomShaderEffect')) {
      throw new Error('Canvas now realizes CustomShaderEffect; update agents/render-backend-support.md');
    }
    if (canvas.has('ContactShadowsEffect')) {
      throw new Error('Canvas now realizes ContactShadowsEffect; update agents/render-backend-support.md');
    }
    if (wgpu.has('CustomShaderEffect')) {
      throw new Error('Wgpu now realizes CustomShaderEffect; update agents/maturity-gaps.md');
    }

    expect(read('packages/effects-gl/src/glContactShadowsEffect.ts')).toContain('applySsaoEffectToGl');
    expect(read('packages/effects-wgpu/src/wgpuContactShadowsEffect.ts')).toContain('applySsaoEffectToWgpu');

    expect(domIndex).toContain('defaultDomSpriteRenderer');
    for (const kind of ['QuadBatch', 'Tilemap', 'BitmapText', 'ParticleEmitter2D']) {
      if (new RegExp(`\\b${kind}\\b`).test(domIndex)) {
        throw new Error(`DOM now exposes ${kind}; update the recorded deliberate batch exclusion`);
      }
    }
    expect(domIndex).not.toContain('BlendEffect');
    expect(existsSync(join(ROOT, 'packages/effects-dom'))).toBe(false);

    expect(canvasIndex).not.toContain('ColorAdjustmentMaterialFeature');
    expect(domIndex).not.toContain('ColorAdjustmentMaterialFeature');
    expect(canvasState).not.toMatch(/\bcolorAdjustments\s*:/);
    expect(domState).not.toMatch(/\bcolorAdjustments\s*:/);

    const lights = read('packages/types/src/Scene3DLights.ts');
    expect(lights).not.toMatch(/\barea\??\s*:/);
    const sceneIndex = read('packages/scene3d/src/index.ts');
    expect(sceneIndex).not.toContain('InstancedMesh');
    expect(sceneIndex).not.toContain('LodMesh');
    expect(read('packages/scene3d-gl/src/index.ts')).not.toMatch(/\b(InstancedMesh|LodMesh)\b/);
    expect(read('packages/scene3d-wgpu/src/index.ts')).not.toMatch(/\b(InstancedMesh|LodMesh)\b/);

    expect(support).toContain('Two effects are **impossible on Canvas 2D**');
    expect(support).toContain('Batch kinds — `QuadBatch`, `Tilemap`, `BitmapText`, and `ParticleEmitter2D`');
    expect(maturity).toContain('`CustomShaderEffect` remains Gl-only');
  });

  it('pins the completed audit population and classification counts', () => {
    const audit = read('agents/causal-limitation-prose-audit.md');
    expect(audit).toContain('**STILL TRUE 19 · NOW FALSE 40 · CANNOT TELL 5**');
    expect(audit).toContain('10 functional claim sites');
    expect(audit).toContain('nine architecture gap groups');
    expect(audit.match(/Release\s+observation:/g)).toHaveLength(5);
    for (const releaseMarker of [
      'pinned official WebGL capture',
      'pinned official WebGPU capture',
      'scan horizontally through x=300 at y=150',
      'after an architecture ruling chooses parity',
      'minimal functional A/B whose',
    ]) {
      expect(audit).toContain(releaseMarker);
    }
  });
});
