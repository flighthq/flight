import type { Entity } from './Entity.ts';

// Opaque handle whose cached runs and lifetime state are owned by @flighthq/textshaper.
export interface TextShaperCache extends Entity {}
