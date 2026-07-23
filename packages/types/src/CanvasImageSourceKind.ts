// Which representation resolveCanvasImageSource will draw for a resource: the host `element` when the
// resource carries one (zero copy), the `data`-materialized canvas (a transcode on first resolve /
// version bump), or `none` when the resource has neither pixels form yet.
export type CanvasImageSourceKind = 'data' | 'element' | 'none';
