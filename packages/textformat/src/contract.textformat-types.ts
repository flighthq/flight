// Acyclic build entry selected by contract-only projects through the `.textformat-types` module suffix.
// The published @flighthq/textformat/contract entry remains contract.ts, which adds the runtime barrel.
export type { FontVariation, TextFormat, TextFormatAlign, TextFormatListMarker, TextFormatRangeRaw } from './types.ts';
