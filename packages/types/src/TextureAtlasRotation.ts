// Owned by `@flighthq/textureatlas` (Rust flight-textureatlas). The enum stays declared here: enums are
// nominal, so a structural copy would not be the same type, and @flighthq/types may cross into an owner
// only with type-only edges. The textureatlas lane reads it through the exact
// `.textureatlas-bridge-types` bridge.
export enum TextureAtlasRotation {
  Counterclockwise90 = -1,
  None = 0,
  Clockwise90 = 1,
}
