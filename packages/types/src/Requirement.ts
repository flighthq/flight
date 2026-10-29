// Requirement types are owned by `@flighthq/requirement`. These deprecated aliases keep existing
// `@flighthq/types` imports compiling until consumers import the owning package.

/** @deprecated Import `Requirement` from `@flighthq/requirement`. */
export type { Requirement } from '@flighthq/requirement/contract';
/** @deprecated Import `RequirementSetRaw` from `@flighthq/requirement`. */
export type { RequirementSetRaw as RequirementSet } from '@flighthq/requirement/contract';
