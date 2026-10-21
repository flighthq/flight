use flight_spritesheet_formats::*;

#[test]
fn public_format_and_requirement_vocabularies_are_exact() {
    assert_eq!(SPRITESHEET_FORMAT_KIND_ASEPRITE, "Aseprite");
    assert_eq!(SPRITESHEET_FORMAT_KIND_COCOS_PLIST, "CocosPlist");
    assert_eq!(SPRITESHEET_FORMAT_KIND_LIBGDX_ATLAS, "LibgdxAtlas");
    assert_eq!(SPRITESHEET_FORMAT_KIND_STARLING, "Starling");
    assert_eq!(SPRITESHEET_FORMAT_KIND_TEXTURE_PACKER, "TexturePacker");
    assert_eq!(SPRITESHEET_REQUIREMENT_KEY_NAMESPACE, "spritesheet");
}
