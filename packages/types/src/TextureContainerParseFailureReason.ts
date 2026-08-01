export type TextureContainerParseFailureReason =
  | 'container-unrecognized'
  | 'format-unsupported'
  | 'header-truncated'
  | 'level-range-out-of-bounds'
  | 'structure-invalid';
