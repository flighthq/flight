export interface FilmicToneMapOptions {
  maxBrightness?: number; // peak white output. Default: 1.0.
  contrast?: number; // curve steepness in the linear section. Default: 1.0.
  linearStart?: number; // transition point from toe to linear. Default: 0.22.
  linearLength?: number; // length of the linear section (fraction of range above linearStart). Default: 0.4.
  blackTighten?: number; // toe curvature exponent below linearStart. Default: 1.33.
  pedestal?: number; // black-level lift. Default: 0.0.
}
