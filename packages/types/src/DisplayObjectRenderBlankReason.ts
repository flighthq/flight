// The single most-likely blank cause, root-cause prioritized: no-renderer > not-prepared >
// not-visible > zero-alpha > ok (see explainDisplayObjectRender for why this ordering, not the literal
// buildRenderQueue check order).
export type DisplayObjectRenderBlankReason = 'no-renderer' | 'not-prepared' | 'not-visible' | 'zero-alpha' | 'ok';
