// Which representation Canvas will draw for a backing: a host `element` (zero copy), or the
// `data`-materialized canvas produced for a Bitmap.
export type CanvasImageSourceKind = 'data' | 'element';
