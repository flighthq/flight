/**
 * The requirement-key namespace for this format family.
 *
 * Every format package exports one, and the catalog sweep in `catalog-rows.test.ts` reads them off the packages
 * rather than keeping its own list — so a family whose namespace is not exported here is a family the catalog can
 * silently stop covering.
 */
export const PARTICLES_REQUIREMENT_KEY_NAMESPACE = 'particles';
