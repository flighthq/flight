// Why tessellateStrokePath returned a mesh or its null fallback sentinel. Kept as a stable reason code
// so tools/tests can branch without parsing diagnostic prose.
export type StrokePathTessellationReason =
  | 'invalid-path'
  | 'invalid-style'
  | 'ok'
  | 'reversing-join'
  | 'self-intersecting-centerline'
  | 'self-intersecting-outline';
