// What a render-effect field's numeric value MEANS, for the operations that cannot treat every number
// alike. Interpolation is the first: a packed RGBA integer lerped as a scalar borrows across byte
// boundaries and produces a colour in neither endpoint's hue, so the role has to be declared rather
// than guessed from the value — 0xff0000ff and a radius of 4278190335 are the same number.
export type RenderEffectFieldRole = 'packedColor';

// Field roles for one effect kind, keyed by field name. A field absent from the record is an ordinary
// scalar; a kind absent from RenderEffectFieldRoles has no fields needing special treatment.
export type RenderEffectKindFieldRoles = Readonly<Record<string, RenderEffectFieldRole>>;

// Roles for every effect kind a caller wants handled, keyed by the effect's `kind`. Plain data rather
// than a registry: the table is read, never dispatched through, and a caller composing its own vendor
// kinds onto the SDK's does so with an object spread instead of a registration call.
export type RenderEffectFieldRoles = Readonly<Record<string, RenderEffectKindFieldRoles>>;
