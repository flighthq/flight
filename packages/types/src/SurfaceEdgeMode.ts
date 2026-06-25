/**
 * Controls how out-of-bounds source coordinates are resolved when sampling a surface.
 *
 * - `'clamp'`: clamps coordinates to the surface edge (border pixels repeat).
 * - `'wrap'`: tiles the surface (coordinates wrap modulo surface size).
 * - `'mirror'`: mirrors the surface at each edge.
 * - `'transparent'`: out-of-bounds pixels are treated as transparent black.
 */
export type SurfaceEdgeMode = 'clamp' | 'mirror' | 'transparent' | 'wrap';
