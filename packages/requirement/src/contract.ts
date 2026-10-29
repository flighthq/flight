// Generated from crates/flight-requirement/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export { collectScene2DRequirements, reportRequirement } from './requirementCollector.ts';
export {
  createRequirementSet,
  diffRequirementSets,
  initializeRequirementSet,
  mergeRequirementSets,
} from './requirementSetRaw.ts';
export type { RequirementSetRaw } from './requirementSetRaw.ts';
export { RequirementFacet, getRequirementFacetString, parseRequirementFacet } from './types.ts';
export type { Requirement } from './types.ts';
export { RequirementSet } from './requirementSet.ts';
