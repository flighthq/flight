// Which representation resolveDomImageSource will draw: the host `element` (zero copy), a
// `data`-materialized canvas (transcode on first resolve / version bump), or `none`. The shakeable
// diagnostic for the otherwise-silent data→element transcode; see explainCanvasImageSource.
export type DomImageSourceKind = 'data' | 'element' | 'none';
