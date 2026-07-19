// Porter-Duff compositing operators: how an isolated layer merges into its parent by combining
// coverage/alpha. This is the axis orthogonal to BlendMode — BlendMode mixes color, a CompositeOperator
// combines coverage. Both default to their neutral value (Normal blend, SourceOver composite). Unlike a
// blend mode, a non-SourceOver operator is meaningful only against an isolated layer (a group rendered to
// its own alpha target), so these are realized as a CompositeEffect that bounces through an offscreen —
// never a cheap per-node property. The value is simultaneously the registry key and the serialized form.
// Third-party operators namespace with a vendor prefix (e.g. 'acme.Foo').
//
// The names follow the W3C Compositing and Blending spec / Canvas globalCompositeOperation vocabulary.
// SourceOver is the default (normal compositing). DestinationOut is the classic "erase" (source alpha
// cuts a hole in the layer); DestinationIn is the classic "alpha" (keep the layer only where the source
// covers). The rest complete the Porter-Duff set.
export const CompositeOperator = {
  Clear: 'Clear',
  Copy: 'Copy',
  DestinationAtop: 'DestinationAtop',
  DestinationIn: 'DestinationIn',
  DestinationOut: 'DestinationOut',
  DestinationOver: 'DestinationOver',
  SourceAtop: 'SourceAtop',
  SourceIn: 'SourceIn',
  SourceOut: 'SourceOut',
  SourceOver: 'SourceOver',
  Xor: 'Xor',
} as const;

export type CompositeOperator = string;
