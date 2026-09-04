import { createEntity } from '@flighthq/entity/contract';
import { getWgpuRenderStateRuntime, registerWgpuImageTextureResolver } from '@flighthq/render-wgpu/contract';
import {
  createAnimatedNormalModifier,
  createDissolveModifier,
  createEmissiveModifier,
  createEnvReflectModifier,
  createFogModifier,
  createRimModifier,
  createShadedMaterial,
  createToonModifier,
  createVertexDisplaceModifier,
} from '@flighthq/shading/contract';
import { createTexture, getTextureSource } from '@flighthq/texture/contract';
import type {
  ImageResource,
  Modifier,
  Texture,
  WgpuColorAdjustmentMaterialFeature,
  WgpuModifierSnippet,
} from '@flighthq/types/contract';
import {
  FogModifierMode,
  ImageTextureSourceKind,
  ModifierSlot,
  VertexDisplaceModifierSource,
} from '@flighthq/types/contract';

import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
import { makeWgpuScene3DState, makeWgpuSkinningAdapter } from './wgpuScene3DTestHelper';
import { registerWgpuModifierSnippet, resolveWgpuModifierSnippet } from './wgpuShadedModifierSnippet';
import {
  animatedNormalWgpuModifierSnippet,
  bindWgpuShadedSurface,
  buildWgpuShadedCacheKey,
  dissolveWgpuModifierSnippet,
  emissiveWgpuModifierSnippet,
  ensureWgpuShadedPipeline,
  envReflectWgpuModifierSnippet,
  fogWgpuModifierSnippet,
  getWgpuShadedModuleSource,
  registerBuiltInWgpuModifierSnippets,
  rimWgpuModifierSnippet,
  toonWgpuModifierSnippet,
  vertexDisplaceWgpuModifierSnippet,
} from './wgpuShadedPrelude';

const COLOR_FEATURE: WgpuColorAdjustmentMaterialFeature = {
  fragmentShaderChunk: 'fn applyFlightColorAdjustment(c : vec4f, m : vec4f, o : vec4f) -> vec4f { return c; }',
  matrixFragmentShaderChunk:
    'fn applyFlightColorMatrix(c : vec4f, a : vec4f, b : vec4f, d : vec4f, e : vec4f, o : vec4f) -> vec4f { return c; }',
  record: () => {},
  resolveFlush: () => null,
};

describe('bindWgpuShadedSurface', () => {
  it('uploads the base and modifier uniform block and binds group resources', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuImageTextureResolver(state);
    registerBuiltInWgpuModifierSnippets(state);
    const material = createShadedMaterial({ modifiers: [createRimModifier({ color: 0xffffffff })] });
    const pipeline = ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.some((call) => call.name === 'createBindGroup')).toBe(true);
    expect(fake.calls.some((call) => call.name === 'writeBuffer')).toBe(true);
  });
});

describe('buildWgpuShadedCacheKey', () => {
  it('canonicalizes cross-slot order and captures modifier structural variants', () => {
    const rim = createRimModifier({ color: 0xffffffff });
    const emissive = createEmissiveModifier({ color: 0xffffffff, strength: 1 });
    const a = createShadedMaterial({ modifiers: [rim, emissive] });
    const b = createShadedMaterial({ modifiers: [emissive, rim] });
    expect(buildWgpuShadedCacheKey(a)).toBe(buildWgpuShadedCacheKey(b));

    const masked = createShadedMaterial({
      modifiers: [createEmissiveModifier({ color: 0xffffffff, mask: createTexture(), strength: 1 })],
    });
    expect(buildWgpuShadedCacheKey(masked)).not.toBe(buildWgpuShadedCacheKey(a));
  });
});

describe('ensureWgpuShadedPipeline', () => {
  it('caches shaded opaque and blended variants separately', () => {
    const { state } = makeWgpuScene3DState();
    registerBuiltInWgpuModifierSnippets(state);
    const material = createShadedMaterial({ modifiers: [createRimModifier({ color: 0xffffffff })] });
    ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    getWgpuScene3DRuntime(state).activeBlendedRun = true;
    ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    const keys = [...getWgpuScene3DRuntime(state).pipelineCache.keys()];
    expect(keys.some((key) => key.startsWith('shaded:') && key.endsWith('|opaque|rigid'))).toBe(true);
    expect(keys.some((key) => key.startsWith('shaded:') && key.endsWith('|blend:Normal|rigid'))).toBe(true);
  });

  it('reserves alpha-map binding 5 and starts modifier textures at binding 6', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuImageTextureResolver(state);
    registerBuiltInWgpuModifierSnippets(state);
    const mask = createTexture();
    const material = createShadedMaterial({
      modifiers: [createEmissiveModifier({ color: 0xffffffff, mask, strength: 1 })],
    });
    ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    const layout = fake.calls
      .filter((call) => call.name === 'createBindGroupLayout')
      .map((call) => call.args[0] as { entries: { binding: number }[] })
      .find(({ entries }) => entries.some(({ binding }) => binding === 6));
    expect(layout?.entries.map(({ binding }) => binding)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('recompiles after a last-write-wins snippet replacement with the same define signature', () => {
    const { fake, state } = makeWgpuScene3DState();
    const modifier = createEntity({ kind: 'acme.Replace', slot: ModifierSlot.Effect }) as Modifier;
    registerWgpuModifierSnippet(state, {
      contribution: () => ({ source: '// compiler-marker-A' }),
      kind: modifier.kind,
      slot: modifier.slot,
    });
    const material = createShadedMaterial({ modifiers: [modifier] });
    ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    const before = fake.calls.filter((call) => call.name === 'createShaderModule').length;

    registerWgpuModifierSnippet(state, {
      contribution: () => ({ source: '// compiler-marker-B' }),
      kind: modifier.kind,
      slot: modifier.slot,
    });
    ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    const modules = fake.calls.filter((call) => call.name === 'createShaderModule');

    expect(modules).toHaveLength(before + 1);
    expect((modules.at(-1)!.args[0] as { code: string }).code).toContain('compiler-marker-B');
  });
});

describe('getWgpuShadedModuleSource', () => {
  it('splices the registered feature after the shaded result only for an opted-in variant', () => {
    const material = createShadedMaterial();
    const base = getWgpuShadedModuleSource(material);
    const adjusted = getWgpuShadedModuleSource(material, undefined, false, null, COLOR_FEATURE);
    expect(base).not.toContain(COLOR_FEATURE.fragmentShaderChunk);
    expect(adjusted).toContain(COLOR_FEATURE.fragmentShaderChunk);
    expect(adjusted).toContain('draw.flightColorScale');
  });

  it('splices the full-matrix feature after the shaded result', () => {
    const matrix = getWgpuShadedModuleSource(createShadedMaterial(), undefined, false, null, COLOR_FEATURE, true);
    expect(matrix).toContain(COLOR_FEATURE.matrixFragmentShaderChunk);
    expect(matrix).toContain('draw.flightColorMatrix0');
  });

  it('threads the HAS_SKIN palette variant through the composed classic base', () => {
    const material = createShadedMaterial();
    expect(getWgpuShadedModuleSource(material)).not.toContain('jointTexture');
    expect(getWgpuShadedModuleSource(material, undefined, true, makeWgpuSkinningAdapter())).toContain(
      'textureLoad(jointTexture',
    );
  });

  it('composes all built-in fragment modifier families into one shader', () => {
    const { state } = makeWgpuScene3DState();
    registerBuiltInWgpuModifierSnippets(state);
    const texture = createTexture();
    const material = createShadedMaterial({
      modifiers: [
        createAnimatedNormalModifier({ map: texture, scroll: { x: 0.1, y: 0.2 } }),
        createEmissiveModifier({ color: 0xff0000ff, mask: texture, strength: 2 }),
        createRimModifier({ color: 0x00ffffff }),
        createDissolveModifier({ threshold: 0.2 }),
        createEnvReflectModifier(),
        createFogModifier({ color: 0xffffffff, mode: FogModifierMode.Exponential2 }),
        createToonModifier({ steps: 3 }),
      ],
    });
    const source = getWgpuShadedModuleSource(material, getWgpuRenderStateRuntime(state).registries.modifierSnippets);
    expect(source).toContain('animatedNormal');
    expect(source).toContain('emissiveTerm');
    expect(source).toContain('rimFactor');
    expect(source).toContain('shadedValueNoise');
    expect(source).toContain('iblPrefiltered');
    expect(source).toContain('exp(-pow(');
    expect(source).toContain('toonQuant');
    expect(source).toContain('@group(2) @binding(6) var modifierTexture6');
  });

  it('injects vertex displacement before the world transform', () => {
    const { state } = makeWgpuScene3DState();
    registerBuiltInWgpuModifierSnippets(state);
    const material = createShadedMaterial({
      modifiers: [
        createVertexDisplaceModifier({
          amplitude: 0.25,
          source: VertexDisplaceModifierSource.Sine,
        }),
      ],
    });
    const source = getWgpuShadedModuleSource(material, getWgpuRenderStateRuntime(state).registries.modifierSnippets);
    expect(source.indexOf('localPosition = vec4f(localPosition.xyz')).toBeLessThan(
      source.indexOf('let world = draw.world * localPosition'),
    );
  });

  it('composes a registered vendor kind and treats an unregistered kind as an explicit miss', () => {
    const { state } = makeWgpuScene3DState();
    const vendor: WgpuModifierSnippet = {
      contribution: () => ({ source: 'radiance = radiance + vec3f(0.125);\\n' }),
      kind: 'acme.Glow',
      slot: ModifierSlot.Effect,
    };
    registerWgpuModifierSnippet(state, vendor);
    const registered = createEntity({ kind: 'acme.Glow', slot: ModifierSlot.Effect }) as Modifier;
    const missing = createEntity({ kind: 'acme.Missing', slot: ModifierSlot.Effect }) as Modifier;
    const material = createShadedMaterial({ modifiers: [registered, missing] });
    const registry = getWgpuRenderStateRuntime(state).registries.modifierSnippets;
    const source = getWgpuShadedModuleSource(material, registry);
    expect(source).toContain('radiance = radiance + vec3f(0.125)');
    expect(buildWgpuShadedCacheKey(material, registry)).toContain('acme.Missing');
    expect(resolveWgpuModifierSnippet(state, 'acme.Glow')).toBe(vendor);
    expect(resolveWgpuModifierSnippet(state, 'acme.Missing')).toBeNull();
  });

  it('routes every open modifier slot and delimits vendor contributions', () => {
    const { state } = makeWgpuScene3DState();
    const slots = [
      ModifierSlot.Normal,
      ModifierSlot.Diffuse,
      ModifierSlot.Specular,
      ModifierSlot.Emissive,
      ModifierSlot.Effect,
      ModifierSlot.Vertex,
    ];
    const statements = [
      'normal = normal;',
      'diffuse = diffuse;',
      'specularColor = specularColor;',
      'emissive = emissive;',
      'radiance = radiance;',
      'localPosition = localPosition;',
    ];
    const modifiers: Modifier[] = [];
    for (let i = 0; i < slots.length; i++) {
      const kind = `acme.Slot${i}`;
      const marker = `slot_marker_${i}`;
      registerWgpuModifierSnippet(state, {
        contribution: () => ({ source: `// ${marker}\n${statements[i]}` }),
        kind,
        slot: slots[i],
      });
      modifiers.push(createEntity({ kind, slot: slots[i] }) as Modifier);
    }
    const registry = getWgpuRenderStateRuntime(state).registries.modifierSnippets;
    const source = getWgpuShadedModuleSource(createShadedMaterial({ modifiers }), registry);
    for (let i = 0; i < slots.length; i++) expect(source).toContain(`slot_marker_${i}`);
    expect(source).toMatch(/\/\/ slot_marker_1\s+diffuse = diffuse;\s+if \(ALPHA_MASK/);
    expect(source.indexOf('slot_marker_2')).toBeLessThan(source.indexOf('var radiance'));
  });

  it('deduplicates repeated helper declarations and separates arbitrary declaration blocks', () => {
    const { state } = makeWgpuScene3DState();
    registerBuiltInWgpuModifierSnippets(state);
    registerWgpuModifierSnippet(state, {
      contribution: () => ({ declarations: 'fn vendorA() {}', source: '' }),
      kind: 'acme.DeclarationA',
      slot: ModifierSlot.Effect,
    });
    registerWgpuModifierSnippet(state, {
      contribution: () => ({ declarations: 'fn vendorB() {}', source: '' }),
      kind: 'acme.DeclarationB',
      slot: ModifierSlot.Effect,
    });
    const material = createShadedMaterial({
      modifiers: [
        createDissolveModifier({ threshold: 0.1 }),
        createDissolveModifier({ threshold: 0.2 }),
        createEntity({ kind: 'acme.DeclarationA', slot: ModifierSlot.Effect }) as Modifier,
        createEntity({ kind: 'acme.DeclarationB', slot: ModifierSlot.Effect }) as Modifier,
      ],
    });
    const source = getWgpuShadedModuleSource(material, getWgpuRenderStateRuntime(state).registries.modifierSnippets);
    expect(source.match(/fn shadedValueNoise/g)).toHaveLength(1);
    expect(source).toContain('fn vendorA() {}\nfn vendorB() {}');
  });
});

describe('registerBuiltInWgpuModifierSnippets', () => {
  it('installs the built-in compiler records explicitly', () => {
    const { state } = makeWgpuScene3DState();
    registerBuiltInWgpuModifierSnippets(state);
    expect(resolveWgpuModifierSnippet(state, 'RimModifier')).not.toBeNull();
    expect([
      animatedNormalWgpuModifierSnippet.kind,
      dissolveWgpuModifierSnippet.kind,
      emissiveWgpuModifierSnippet.kind,
      envReflectWgpuModifierSnippet.kind,
      fogWgpuModifierSnippet.kind,
      rimWgpuModifierSnippet.kind,
      toonWgpuModifierSnippet.kind,
      vertexDisplaceWgpuModifierSnippet.kind,
    ]).toEqual([
      'AnimatedNormalModifier',
      'DissolveModifier',
      'EmissiveModifier',
      'EnvReflectModifier',
      'FogModifier',
      'RimModifier',
      'ToonModifier',
      'VertexDisplaceModifier',
    ]);
  });
});

describe('shaded binding cache', () => {
  it('owns GPU bindings per render state when a material is shared across devices', () => {
    const first = makeWgpuScene3DState();
    const second = makeWgpuScene3DState();
    registerBuiltInWgpuModifierSnippets(first.state);
    registerBuiltInWgpuModifierSnippets(second.state);
    const material = createShadedMaterial();
    const firstPipeline = ensureWgpuShadedPipeline(first.state, material, 'bgra8unorm');
    const secondPipeline = ensureWgpuShadedPipeline(second.state, material, 'bgra8unorm');

    const firstGroup = bindWgpuShadedSurface(first.state, firstPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    const firstBufferCount = first.fake.calls.filter((call) => call.name === 'createBuffer').length;
    const firstGroupCount = first.fake.calls.filter((call) => call.name === 'createBindGroup').length;
    const secondGroup = bindWgpuShadedSurface(second.state, secondPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    const firstAgain = bindWgpuShadedSurface(first.state, firstPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);

    expect(firstGroup).not.toBe(secondGroup);
    expect(firstAgain).toBe(firstGroup);
    expect(first.fake.calls.filter((call) => call.name === 'createBuffer')).toHaveLength(firstBufferCount);
    expect(first.fake.calls.filter((call) => call.name === 'createBindGroup')).toHaveLength(firstGroupCount);
  });

  it('reuses its uniform allocation while rebuilding for texture identity and readiness changes', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuImageTextureResolver(state);
    registerBuiltInWgpuModifierSnippets(state);
    const first = createTexture({
      dimension: '2d',
      source: makeImageResource(),
    });
    const material = createShadedMaterial({ diffuseMap: first });
    const pipeline = ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    const buffers = fake.calls.filter((call) => call.name === 'createBuffer').length;
    const groups = fake.calls.filter((call) => call.name === 'createBindGroup').length;

    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBuffer')).toHaveLength(buffers);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup')).toHaveLength(groups);

    material.diffuseMap = createTexture({
      dimension: '2d',
      source: makeImageResource(),
    });
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup').length).toBeGreaterThan(groups);
    expect(fake.calls.filter((call) => call.name === 'createBuffer')).toHaveLength(buffers);

    const modifierTexture = createTexture({ dimension: '2d', source: makeImageResource() });
    const emissive = createEmissiveModifier({ color: 0xffffffff, mask: modifierTexture, strength: 1 });
    material.modifiers = [emissive];
    const modifierPipeline = ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    bindWgpuShadedSurface(state, modifierPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    const beforeModifierSwap = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    emissive.mask = createTexture({ dimension: '2d', source: makeImageResource() });
    bindWgpuShadedSurface(state, modifierPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup').length).toBeGreaterThan(beforeModifierSwap);

    emissive.mask = createTexture();
    bindWgpuShadedSurface(state, modifierPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    const beforeReady = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    const readyingTexture = emissive.mask;
    expect(readyingTexture).toBeDefined();
    if (readyingTexture!.dimension !== '2d') throw new Error('test texture must be 2d');
    readyingTexture!.source = makeImageResource();
    bindWgpuShadedSurface(state, modifierPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup').length).toBeGreaterThan(beforeReady);
  });

  it('rebinds when a ready image swaps or its version changes', () => {
    const { fake, state } = makeWgpuScene3DState();
    registerWgpuImageTextureResolver(state);
    registerBuiltInWgpuModifierSnippets(state);
    const firstImage = makeImageResource();
    const texture = createTexture({ dimension: '2d', source: firstImage });
    const material = createShadedMaterial({ diffuseMap: texture });
    const pipeline = ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);

    const beforeSwap = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    if (texture.dimension !== '2d') throw new Error('test texture must be 2d');
    texture.source = makeImageResource();
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup').length).toBeGreaterThan(beforeSwap);

    const beforeVersion = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    getTextureSource(texture)!.version++;
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup').length).toBeGreaterThan(beforeVersion);
  });

  it('reuses the compiled plan and GPU resource arrays on an unchanged draw', () => {
    const { fake, state } = makeWgpuScene3DState();
    let contributions = 0;
    const modifier = createEntity({ kind: 'acme.Stable', slot: ModifierSlot.Effect }) as Modifier;
    registerWgpuModifierSnippet(state, {
      contribution: () => {
        contributions++;
        return { source: 'radiance = radiance;' };
      },
      kind: modifier.kind,
      slot: modifier.slot,
    });
    const material = createShadedMaterial({ modifiers: [modifier] });
    const pipeline = ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    const buffers = fake.calls.filter((call) => call.name === 'createBuffer').length;
    const groups = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    const compiled = contributions;

    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(contributions).toBe(compiled);
    expect(fake.calls.filter((call) => call.name === 'createBuffer')).toHaveLength(buffers);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup')).toHaveLength(groups);
  });
});

function makeImageResource(): ImageResource {
  const source = document.createElement('canvas');
  source.width = 1;
  source.height = 1;
  return {
    height: 1,
    kind: ImageTextureSourceKind,
    source,
    version: 0,
    width: 1,
  } as unknown as ImageResource;
}
