import { mergeDomRenderOptions } from '@flighthq/scene2d-dom/contract';
import { mergeSwfParseOptions } from '@flighthq/swf/contract';
import type {
  Awd2ParseOptions,
  CanvasRenderRegistries,
  DomRenderOptions,
  GlRenderStateOptions,
  Kind,
  NodeRenderer,
  SwfParseOptions,
  SwfTagHandler,
  WgpuRenderStateOptions,
} from '@flighthq/types/contract';

// THE POINT OF THIS FILE. The generated module is plain JS, so nothing in the emitted text proves a
// fragment is spreadable into the API it names. These fixtures are TYPED: each declares a fragment in
// exactly the shape the emitter produces and checks it against the real options type.
//
// The check is `Spreads<Fragment, Target>`, not a bare spread. Spreading a VARIABLE into a typed
// binding does NOT trigger TypeScript's excess-property check — only a direct object literal does — so
// `const o: CanvasRenderOptions = { ...fragment }` compiles happily even when the fragment carries a
// field the target never declared. I verified that hole before writing this, and the key-subset
// constraint below is what actually closes it: a fragment naming an unknown field resolves to `never`
// and fails to compile.
type Spreads<Fragment, Target> = keyof Fragment extends keyof Target ? true : never;
describe('typed consumer fixtures', () => {
  it('spreads glOptions into GlRenderStateOptions', () => {
    const glOptions = {
      nodeRenderers: new Map<Kind, NodeRenderer>([['ShowFrame', RENDERER]]),
      blendRealizations: new Map(),
    };
    const fits: Spreads<typeof glOptions, GlRenderStateOptions> = true;
    const options: GlRenderStateOptions = { ...glOptions, pixelRatio: 2 };
    expect(fits).toBe(true);
    expect(options.nodeRenderers!.get('ShowFrame')).toBe(RENDERER);
    expect(options.blendRealizations).toBeDefined();
  });

  it('spreads wgpuOptions into WgpuRenderStateOptions', () => {
    const wgpuOptions = { nodeRenderers: new Map<Kind, NodeRenderer>([['ShowFrame', RENDERER]]) };
    const fits: Spreads<typeof wgpuOptions, WgpuRenderStateOptions> = true;
    const options: WgpuRenderStateOptions = { ...wgpuOptions };
    expect(fits).toBe(true);
    expect(options.nodeRenderers!.get('ShowFrame')).toBe(RENDERER);
  });

  it('spreads parserOptions into SwfParseOptions, and composes across documents', () => {
    const first: Partial<SwfParseOptions> = { tags: [TAG_HANDLER] };
    const second: Partial<SwfParseOptions> = { tags: [TAG_HANDLER] };
    const options: SwfParseOptions = mergeSwfParseOptions(first, second);
    expect(options.tags).toHaveLength(2);
  });

  it('spreads parserOptions into Awd2ParseOptions', () => {
    const parserOptions = { blocks: [] as Awd2ParseOptions['blocks'][number][] };
    const fits: Spreads<typeof parserOptions, Awd2ParseOptions> = true;
    const options: Awd2ParseOptions = { ...parserOptions };
    expect(fits).toBe(true);
    expect(options.blocks).toEqual([]);
  });

  // C1 — a canvas fragment is a Partial<CanvasRenderRegistries>, spread into createCanvasRenderState
  // ARGUMENT 1 rather than its options parameter. No canvas API changed to make this true.
  it('spreads canvasOptions into CanvasRenderRegistries, constructor argument 1', () => {
    const canvasOptions = {
      nodeRenderers: new Map<Kind, NodeRenderer>([['ShowFrame', RENDERER]]),
      effects: new Map(),
    };
    const fits: Spreads<typeof canvasOptions, CanvasRenderRegistries> = true;
    const registries: Partial<CanvasRenderRegistries> = { ...canvasOptions };
    expect(fits).toBe(true);
    expect(registries.nodeRenderers!.get('ShowFrame')).toBe(RENDERER);
  });

  it('rejects a canvas fragment naming a field CanvasRenderRegistries does not have', () => {
    const rejected: Spreads<{ blendRealizations: Map<Kind, unknown> }, CanvasRenderRegistries> extends never
      ? true
      : false = true;
    expect(rejected).toBe(true);
  });

  // D3 — DomRenderOptions now declares registry fields, so a DOM fragment spreads into the options
  // parameter and the constructor seeds the runtime registries from it.
  it('spreads domOptions into DomRenderOptions', () => {
    const domOptions = {
      nodeRenderers: new Map<Kind, NodeRenderer>([['ShowFrame', RENDERER]]),
      textureResolvers: new Map(),
    };
    const fits: Spreads<typeof domOptions, DomRenderOptions> = true;
    const options: Partial<DomRenderOptions> = { ...domOptions, roundPixels: true };
    expect(fits).toBe(true);
    expect(options.nodeRenderers!.get('ShowFrame')).toBe(RENDERER);
    expect(options.roundPixels).toBe(true);
  });

  it('rejects a DOM fragment naming a field DomRenderOptions does not have', () => {
    const rejected: Spreads<{ materialRenderers: Map<Kind, unknown> }, DomRenderOptions> extends never ? true : false =
      true;
    expect(rejected).toBe(true);
  });

  it('composes DOM fragments with named semantics, not a generic merge', () => {
    const merged = mergeDomRenderOptions(
      { nodeRenderers: new Map<Kind, NodeRenderer>([['ShowFrame', RENDERER]]) },
      { nodeRenderers: new Map<Kind, NodeRenderer>([['DefineShape', RENDERER]]) },
    );
    expect([...merged.nodeRenderers!.keys()]).toEqual(['ShowFrame', 'DefineShape']);
  });
});

const RENDERER = { createData: () => null, submit: () => {} } as NodeRenderer;
const TAG_HANDLER = { code: 1, read: () => {} } as unknown as SwfTagHandler;
