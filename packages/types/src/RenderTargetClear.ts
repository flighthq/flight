// Explicit per-aspect clear values for a render target. Omitted aspects are untouched.
//
// Color values are linear float RGBA — the same representation clearBufferfv takes, covering the
// full range of sRGB and HDR (rgba16f/rgba32f) targets with no encoding step. Use `color` to
// broadcast one value to every color attachment, or `colors` for per-attachment control where
// undefined entries preserve that attachment. The two fields are mutually exclusive.
export interface RenderTargetClear {
  color?: readonly [number, number, number, number];
  colors?: ReadonlyArray<readonly [number, number, number, number] | undefined>;
  depth?: number;
  stencil?: number;
}
