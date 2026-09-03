/**
 * Classifies a repository-owned `create*` result that is intentionally outside the Entity population.
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
