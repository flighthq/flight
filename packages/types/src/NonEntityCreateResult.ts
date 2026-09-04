/**
 * Classifies a repository-owned `create*` result that is intentionally outside the Entity population.
 *
 * RETIRED as a standard, retained only until its remaining uses are migrated. Entity membership is
 * decided by shape, not by semantic category: `descriptor` and `options` no longer opt a Flight-defined
 * object out, because in the Haxe/C++ port Entity is a statically typed direct reference and everything
 * else is dynamic field access — so this marker set a field-access representation while appearing to
 * annotate semantics only. Do not add new uses. See the entity charter's [2026-09-04] entry.
 *
 * Use this wrapper directly on the public factory return type. It has no runtime representation and does
 * not change `Type`; its purpose is to keep the semantic reason beside the API declaration so the Entity
 * contract analyzer can distinguish a true descriptor, options bag, or type-only construct from an
 * unconverted user-facing Flight SDK object.
 */
export type NonEntityCreateResult<Type, Kind extends 'descriptor' | 'options' | 'type-only'> = Kind extends
  | 'descriptor'
  | 'options'
  | 'type-only'
  ? Type
  : never;
