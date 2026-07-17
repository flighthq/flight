/**
 * Identifies a compiled shading Modifier for compile-path dispatch. An open-registry string key:
 * the canonical PascalCase type name (`'EmissiveModifier'`, `'RimModifier'`), simultaneously the
 * registry key and the serialized form. Third-party modifiers namespace with a vendor prefix
 * (`'acme.Dissolve'`). Concrete kinds are declared by the packages that own them; unused modifier
 * runners tree-shake out, so an assembled variant never costs more than its parts.
 */
export type ModifierKind = string;
