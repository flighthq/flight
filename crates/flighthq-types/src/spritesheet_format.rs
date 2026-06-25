// Spritesheet format identifiers. Each is a canonical PascalCase string; users introducing custom
// formats namespace them with a vendor prefix (e.g. `"acme.MyAtlas"`) to avoid colliding with the
// built-in kind strings.

pub const SPRITESHEET_FORMAT_KIND_ASEPRITE: &str = "Aseprite";
pub const SPRITESHEET_FORMAT_KIND_COCOS_PLIST: &str = "CocosPlist";
pub const SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS: &str = "LibgdxAtlas";
pub const SPRITESHEET_FORMAT_KIND_STARLING: &str = "Starling";
pub const SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER: &str = "TexturePacker";

/// Open string alias for spritesheet format identifiers.
///
/// Use a vendor-prefixed value (e.g. `"acme.MyAtlas"`) for custom formats to avoid colliding with
/// built-in kind strings.
pub type SpritesheetFormatKind = String;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spritesheet_format_kinds_are_canonical_pascal_case() {
        assert_eq!(SPRITESHEET_FORMAT_KIND_ASEPRITE, "Aseprite");
        assert_eq!(SPRITESHEET_FORMAT_KIND_COCOS_PLIST, "CocosPlist");
        assert_eq!(SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS, "LibgdxAtlas");
        assert_eq!(SPRITESHEET_FORMAT_KIND_STARLING, "Starling");
        assert_eq!(SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER, "TexturePacker");
    }
}
