// Falloff curve shared by the radial particle forces (AttractorForce, VortexForce): how a force's
// strength attenuates with distance from its center, optionally cut off at `radius`.
export type ForceFalloff = 'none' | 'linear' | 'inverseSquare';
