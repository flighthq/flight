import { mergeSwfParseOptions } from '@flighthq/swf/contract';
import type {
  Awd2ParseOptions,
  CanvasRenderOptions,
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

  // CANVAS AND DOM ARE THE OPEN QUESTION, and these two make it concrete. Both options types declare
  // ONLY scalars today — canvas takes its registries as a separate constructor parameter and DOM
  // accepts none — so an empty fragment is the only one that fits. A `nodeRenderers` fragment does NOT
  // satisfy Spreads<> against either, which is precisely why the emitter reports those rows.
  it('accepts an EMPTY canvasOptions, and rejects a map fragment, against CanvasRenderOptions', () => {
    const canvasOptions = {};
    const fits: Spreads<typeof canvasOptions, CanvasRenderOptions> = true;
    const rejected: Spreads<{ nodeRenderers: Map<Kind, NodeRenderer> }, CanvasRenderOptions> extends never
      ? true
      : false = true;
    const options: Partial<CanvasRenderOptions> = { ...canvasOptions, pixelRatio: 2 };
    expect(fits).toBe(true);
    expect(rejected).toBe(true);
    expect(options.pixelRatio).toBe(2);
  });

  it('accepts an EMPTY domOptions, and rejects a map fragment, against DomRenderOptions', () => {
    const domOptions = {};
    const fits: Spreads<typeof domOptions, DomRenderOptions> = true;
    const rejected: Spreads<{ nodeRenderers: Map<Kind, NodeRenderer> }, DomRenderOptions> extends never ? true : false =
      true;
    const options: Partial<DomRenderOptions> = { ...domOptions, roundPixels: true };
    expect(fits).toBe(true);
    expect(rejected).toBe(true);
    expect(options.roundPixels).toBe(true);
  });
});

const RENDERER = { createData: () => null, submit: () => {} } as NodeRenderer;
const TAG_HANDLER = { code: 1, read: () => {} } as unknown as SwfTagHandler;
