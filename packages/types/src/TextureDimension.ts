// Hardware sampling dimensionality. Custom backings may extend how a texture is filled, but not
// the dimensions GPU texture units can sample.
export type TextureDimension = '2d' | '2d-array' | '3d' | 'cube';
