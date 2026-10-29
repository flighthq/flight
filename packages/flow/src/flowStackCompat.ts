import type { FlowStackRaw } from './flowTypes.ts';

// Compatibility name for the historical @flighthq/types owner. Flow now owns the shape; the
// generated Raw suffix records its Entity runtime slot without changing the public type name.
export type FlowStack = FlowStackRaw;
