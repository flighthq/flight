/**
 * Identifies a pointwise value-remap adjustment for realization dispatch. An open-registry string
 * key: the canonical PascalCase type name (`'ColorTransform'`, `'Brightness'`), simultaneously the
 * registry key and the serialized form. Third-party adjustments namespace with a vendor prefix
 * (`'acme.Duotone'`). Concrete kinds are declared by the packages that own them.
 */
export type AdjustmentKind = string;
