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
} from '@flighthq/shading';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, Modifier, Texture, WgpuModifierSnippet } from '@flighthq/types';
import { FogModifierMode, ModifierSlot, VertexDisplaceModifierSource } from '@flighthq/types';

import { getWgpuSceneRuntime } from './wgpuSceneRuntime';
import { makeWgpuSceneState, makeWgpuSkinningAdapter } from './wgpuSceneTestHelper';
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

describe('bindWgpuShadedSurface', () => {
  it('uploads the base and modifier uniform block and binds group resources', () => {
    const { fake, state } = makeWgpuSceneState();
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
    const { state } = makeWgpuSceneState();
    registerBuiltInWgpuModifierSnippets(state);
    const material = createShadedMaterial({ modifiers: [createRimModifier({ color: 0xffffffff })] });
    ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    getWgpuSceneRuntime(state).activeBlendedRun = true;
    ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    const keys = [...getWgpuSceneRuntime(state).pipelineCache.keys()];
    expect(keys.some((key) => key.startsWith('shaded:') && key.endsWith('|opaque|rigid'))).toBe(true);
    expect(keys.some((key) => key.startsWith('shaded:') && key.endsWith('|blend|rigid'))).toBe(true);
  });

  it('reserves alpha-map binding 5 and starts modifier textures at binding 6', () => {
    const { fake, state } = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
    const modifier = { kind: 'acme.Replace', slot: ModifierSlot.Effect };
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
  it('threads the HAS_SKIN palette variant through the composed classic base', () => {
    const material = createShadedMaterial();
    expect(getWgpuShadedModuleSource(material)).not.toContain('jointTexture');
    expect(getWgpuShadedModuleSource(material, undefined, true, makeWgpuSkinningAdapter())).toContain(
      'textureLoad(jointTexture',
    );
  });

  it('composes all built-in fragment modifier families into one shader', () => {
    const { state } = makeWgpuSceneState();
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
    const source = getWgpuShadedModuleSource(material, getWgpuSceneRuntime(state).modifierSnippetRegistry!);
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
    const { state } = makeWgpuSceneState();
    registerBuiltInWgpuModifierSnippets(state);
    const material = createShadedMaterial({
      modifiers: [
        createVertexDisplaceModifier({
          amplitude: 0.25,
          source: VertexDisplaceModifierSource.Sine,
        }),
      ],
    });
    const source = getWgpuShadedModuleSource(material, getWgpuSceneRuntime(state).modifierSnippetRegistry!);
    expect(source.indexOf('localPosition = vec4f(localPosition.xyz')).toBeLessThan(
      source.indexOf('let world = draw.world * localPosition'),
    );
  });

  it('composes a registered vendor kind and treats an unregistered kind as an explicit miss', () => {
    const { state } = makeWgpuSceneState();
    const vendor: WgpuModifierSnippet = {
      contribution: () => ({ source: 'radiance = radiance + vec3f(0.125);\\n' }),
      kind: 'acme.Glow',
      slot: ModifierSlot.Effect,
    };
    registerWgpuModifierSnippet(state, vendor);
    const registered = { kind: 'acme.Glow', slot: ModifierSlot.Effect } as Modifier;
    const missing = { kind: 'acme.Missing', slot: ModifierSlot.Effect } as Modifier;
    const material = createShadedMaterial({ modifiers: [registered, missing] });
    const registry = getWgpuSceneRuntime(state).modifierSnippetRegistry!;
    const source = getWgpuShadedModuleSource(material, registry);
    expect(source).toContain('radiance = radiance + vec3f(0.125)');
    expect(buildWgpuShadedCacheKey(material, registry)).toContain('acme.Missing');
    expect(resolveWgpuModifierSnippet(state, 'acme.Glow')).toBe(vendor);
    expect(resolveWgpuModifierSnippet(state, 'acme.Missing')).toBeNull();
  });

  it('routes every open modifier slot and delimits vendor contributions', () => {
    const { state } = makeWgpuSceneState();
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
      modifiers.push({ kind, slot: slots[i] });
    }
    const registry = getWgpuSceneRuntime(state).modifierSnippetRegistry!;
    const source = getWgpuShadedModuleSource(createShadedMaterial({ modifiers }), registry);
    for (let i = 0; i < slots.length; i++) expect(source).toContain(`slot_marker_${i}`);
    expect(source).toMatch(/\/\/ slot_marker_1\s+diffuse = diffuse;\s+if \(ALPHA_MASK/);
    expect(source.indexOf('slot_marker_2')).toBeLessThan(source.indexOf('var radiance'));
  });

  it('deduplicates repeated helper declarations and separates arbitrary declaration blocks', () => {
    const { state } = makeWgpuSceneState();
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
        { kind: 'acme.DeclarationA', slot: ModifierSlot.Effect },
        { kind: 'acme.DeclarationB', slot: ModifierSlot.Effect },
      ],
    });
    const source = getWgpuShadedModuleSource(material, getWgpuSceneRuntime(state).modifierSnippetRegistry!);
    expect(source.match(/fn shadedValueNoise/g)).toHaveLength(1);
    expect(source).toContain('fn vendorA() {}\nfn vendorB() {}');
  });
});

describe('registerBuiltInWgpuModifierSnippets', () => {
  it('installs the built-in compiler records explicitly', () => {
    const { state } = makeWgpuSceneState();
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
    const first = makeWgpuSceneState();
    const second = makeWgpuSceneState();
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
    const { fake, state } = makeWgpuSceneState();
    registerBuiltInWgpuModifierSnippets(state);
    const first = createTexture({ image: { source: {} } as ImageResource });
    const material = createShadedMaterial({ diffuseMap: first });
    const pipeline = ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    const buffers = fake.calls.filter((call) => call.name === 'createBuffer').length;
    const groups = fake.calls.filter((call) => call.name === 'createBindGroup').length;

    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBuffer')).toHaveLength(buffers);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup')).toHaveLength(groups);

    material.diffuseMap = createTexture({ image: { source: {} } as ImageResource });
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup').length).toBeGreaterThan(groups);
    expect(fake.calls.filter((call) => call.name === 'createBuffer')).toHaveLength(buffers);

    const modifierTexture = createTexture({ image: makeImageResource() });
    const emissive = createEmissiveModifier({ color: 0xffffffff, mask: modifierTexture, strength: 1 });
    material.modifiers = [emissive];
    const modifierPipeline = ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    bindWgpuShadedSurface(state, modifierPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    const beforeModifierSwap = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    emissive.mask = createTexture({ image: makeImageResource() });
    bindWgpuShadedSurface(state, modifierPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup').length).toBeGreaterThan(beforeModifierSwap);

    emissive.mask = createTexture();
    bindWgpuShadedSurface(state, modifierPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    const beforeReady = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    const readyingTexture = emissive.mask;
    expect(readyingTexture).toBeDefined();
    readyingTexture!.image = { source: {} } as ImageResource;
    bindWgpuShadedSurface(state, modifierPipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup').length).toBeGreaterThan(beforeReady);
  });

  it('rebinds when a ready image swaps or its version changes', () => {
    const { fake, state } = makeWgpuSceneState();
    registerBuiltInWgpuModifierSnippets(state);
    const firstImage = makeImageResource();
    const texture = createTexture({ image: firstImage });
    const material = createShadedMaterial({ diffuseMap: texture });
    const pipeline = ensureWgpuShadedPipeline(state, material, 'bgra8unorm');
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);

    const beforeSwap = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    texture.image = makeImageResource();
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup').length).toBeGreaterThan(beforeSwap);

    const beforeVersion = fake.calls.filter((call) => call.name === 'createBindGroup').length;
    texture.image.version++;
    bindWgpuShadedSurface(state, pipeline, material, [1, 1, 1, 1], [1, 1, 1, 1]);
    expect(fake.calls.filter((call) => call.name === 'createBindGroup').length).toBeGreaterThan(beforeVersion);
  });

  it('reuses the compiled plan and GPU resource arrays on an unchanged draw', () => {
    const { fake, state } = makeWgpuSceneState();
    let contributions = 0;
    const modifier = { kind: 'acme.Stable', slot: ModifierSlot.Effect };
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
  return {
    alphaType: 'straight',
    compressed: null,
    data: null,
    format: 'rgba8unorm',
    height: 1,
    source: {} as CanvasImageSource,
    version: 0,
    width: 1,
  } as ImageResource;
}
