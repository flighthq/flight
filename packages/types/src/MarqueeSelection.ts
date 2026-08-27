import type { Entity } from './Entity';

export type MarqueeSelectionMode = 'contain' | 'intersect';

/** Opaque rubber-band gesture state created and updated by @flighthq/selection. */
export interface MarqueeSelection extends Entity {}
