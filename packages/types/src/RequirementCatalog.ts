// Requirement catalog types are owned by `@flighthq/requirement-catalog`. These deprecated aliases
// keep existing `@flighthq/types` imports compiling until consumers import the owning package.

/** @deprecated Import requirement catalog contracts from `@flighthq/requirement-catalog/contract`. */
export type {
  RequirementBackend,
  RequirementCatalog,
  RequirementCatalogEntry,
  RequirementDisposition,
  RequirementTranslation,
} from '@flighthq/requirement-catalog/contract';
