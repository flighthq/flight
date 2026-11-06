// Owned by `@flighthq/lighting`. These deprecated re-exports keep existing `@flighthq/types` imports
// compiling until consumers import the owning package.

// Deprecated structural copies of lighting's literal constants (core may cross into an owner only
// with type-only edges); the values are identical literals.
// Every receiver layer at once — the mask an unconfigured light carries, so a light that was never
// scoped lights the whole scene. All bits set rather than 0, because 0 is the mask that lights NOTHING
// and would turn "I did not configure this" into "this light is off" with no diagnostic.
export const ALL_LIGHT_LAYERS = -1;
