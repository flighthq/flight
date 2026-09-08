import type { LightUnit } from './LightUnit';

// Any light descriptor that declares both a linear `intensity` and the photometric `intensityUnit` that
// intensity was authored in. Structural on purpose: every concrete light type carries these two fields,
// and the photometric accessors need nothing else, so they take the pair rather than a union of six
// descriptors that would have to grow with a seventh.
//
// The two fields only mean something together. `intensity` is the dimensionless multiplier the shaders
// consume; `intensityUnit` is the unit a human authored it in. Reading one without the other is what
// left the unit disconnected from the light in the first place.
export interface PhotometricLightLike {
  intensity: number;
  intensityUnit: LightUnit;
}
