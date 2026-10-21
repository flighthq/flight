use std::sync::Arc;

use flight_spritesheet::SpritesheetData;

use crate::spritesheet_detect::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_spritesheet::create_spritesheet_data;

    const STARLING: &str = "<TextureAtlas imagePath=\"a.png\"><SubTexture name=\"x\" x=\"0\" y=\"0\" width=\"1\" height=\"1\"/></TextureAtlas>";

    fn kinds(registry: &SpritesheetFormatRegistry) -> Vec<SpritesheetFormatKind> {
        let mut out = Vec::new();
        get_spritesheet_format_kinds(&mut out, registry);
        return out;
    }

    #[test]
    fn apply_spritesheet_import_options_delegates() {
        let source = create_spritesheet_format_registry();
        let descriptor = starling_spritesheet_format(&source).clone();
        let kind = SPRITESHEET_FORMAT_KIND_STARLING.to_string();
        let mut method = create_spritesheet_format_registry();
        let mut function = create_spritesheet_format_registry();
        unregister_spritesheet_format(&mut method, &kind);
        unregister_spritesheet_format(&mut function, &kind);
        let options = SpritesheetImportOptions {
            formats: Some(vec![descriptor]),
        };
        method.apply_spritesheet_import_options(&options);
        apply_spritesheet_import_options(&mut function, &options);
        assert_eq!(kinds(&method), kinds(&function));
    }

    #[test]
    fn aseprite_spritesheet_format_delegates() {
        let registry = create_spritesheet_format_registry();
        assert!(std::ptr::eq(
            registry.aseprite_spritesheet_format(),
            aseprite_spritesheet_format(&registry)
        ));
    }

    #[test]
    fn cocos_plist_spritesheet_format_delegates() {
        let registry = create_spritesheet_format_registry();
        assert!(std::ptr::eq(
            registry.cocos_plist_spritesheet_format(),
            cocos_plist_spritesheet_format(&registry)
        ));
    }

    #[test]
    fn detect_spritesheet_format_delegates() {
        let registry = create_spritesheet_format_registry();
        assert_eq!(
            registry.detect_spritesheet_format(STARLING),
            detect_spritesheet_format(&registry, STARLING)
        );
    }

    #[test]
    fn get_spritesheet_format_delegates() {
        let registry = create_spritesheet_format_registry();
        let kind = SPRITESHEET_FORMAT_KIND_STARLING.to_string();
        let method = registry.get_spritesheet_format(&kind).unwrap();
        let function = get_spritesheet_format(&registry, &kind).unwrap();
        assert!(Arc::ptr_eq(&method, &function));
    }

    #[test]
    fn get_spritesheet_format_kinds_delegates() {
        let registry = create_spritesheet_format_registry();
        let mut method = Vec::new();
        let mut function = Vec::new();
        registry.get_spritesheet_format_kinds(&mut method);
        get_spritesheet_format_kinds(&mut function, &registry);
        assert_eq!(method, function);
    }

    #[test]
    fn libgdx_atlas_spritesheet_format_delegates() {
        let registry = create_spritesheet_format_registry();
        assert!(std::ptr::eq(
            registry.libgdx_atlas_spritesheet_format(),
            libgdx_atlas_spritesheet_format(&registry)
        ));
    }

    #[test]
    fn new_delegates() {
        let method = SpritesheetFormatRegistry::new();
        let function = create_spritesheet_format_registry();
        assert_eq!(kinds(&method), kinds(&function));
    }

    #[test]
    fn parse_spritesheet_delegates() {
        let registry = create_spritesheet_format_registry();
        assert_eq!(
            registry.parse_spritesheet(STARLING, None, None),
            parse_spritesheet(&registry, STARLING, None, None)
        );
    }

    #[test]
    fn register_spritesheet_format_delegates() {
        let mut method = create_spritesheet_format_registry();
        let mut function = create_spritesheet_format_registry();
        let kind = "acme.D18".to_string();
        let entry = Arc::new(SpritesheetFormatEntry {
            detect: Arc::new(|content| content == "D18"),
            parse: Arc::new(|_content, _options| create_spritesheet_data(None)),
        });
        method.register_spritesheet_format(&kind, entry.clone());
        register_spritesheet_format(&mut function, &kind, entry);
        assert_eq!(
            method.detect_spritesheet_format("D18"),
            detect_spritesheet_format(&function, "D18")
        );
    }

    #[test]
    fn spritesheet_all_formats_delegates() {
        let registry = create_spritesheet_format_registry();
        assert_eq!(
            registry.spritesheet_all_formats().len(),
            spritesheet_all_formats(&registry).len()
        );
    }

    #[test]
    fn starling_spritesheet_format_delegates() {
        let registry = create_spritesheet_format_registry();
        assert!(std::ptr::eq(
            registry.starling_spritesheet_format(),
            starling_spritesheet_format(&registry)
        ));
    }

    #[test]
    fn texture_packer_spritesheet_format_delegates() {
        let registry = create_spritesheet_format_registry();
        assert!(std::ptr::eq(
            registry.texture_packer_spritesheet_format(),
            texture_packer_spritesheet_format(&registry)
        ));
    }

    #[test]
    fn unregister_spritesheet_format_delegates() {
        let mut method = create_spritesheet_format_registry();
        let mut function = create_spritesheet_format_registry();
        let kind = SPRITESHEET_FORMAT_KIND_STARLING.to_string();
        method.unregister_spritesheet_format(&kind);
        unregister_spritesheet_format(&mut function, &kind);
        assert_eq!(kinds(&method), kinds(&function));
    }
}

impl SpritesheetFormatRegistry {
    pub fn new() -> Self {
        return create_spritesheet_format_registry();
    }

    pub fn apply_spritesheet_import_options(&mut self, options: &SpritesheetImportOptions) {
        apply_spritesheet_import_options(self, options);
    }

    pub fn aseprite_spritesheet_format(&self) -> &SpritesheetFormatDescriptor {
        return aseprite_spritesheet_format(self);
    }

    pub fn cocos_plist_spritesheet_format(&self) -> &SpritesheetFormatDescriptor {
        return cocos_plist_spritesheet_format(self);
    }

    pub fn detect_spritesheet_format(&self, text: &str) -> Option<SpritesheetFormatKind> {
        return detect_spritesheet_format(self, text);
    }

    pub fn get_spritesheet_format(
        &self,
        kind: &SpritesheetFormatKind,
    ) -> Option<Arc<SpritesheetFormatEntry>> {
        return get_spritesheet_format(self, kind);
    }

    pub fn get_spritesheet_format_kinds(&self, out: &mut Vec<SpritesheetFormatKind>) {
        get_spritesheet_format_kinds(out, self);
    }

    pub fn libgdx_atlas_spritesheet_format(&self) -> &SpritesheetFormatDescriptor {
        return libgdx_atlas_spritesheet_format(self);
    }

    pub fn parse_spritesheet(
        &self,
        text: &str,
        format_kind: Option<&SpritesheetFormatKind>,
        options: Option<&SpritesheetParseOptions>,
    ) -> Option<SpritesheetData> {
        return parse_spritesheet(self, text, format_kind, options);
    }

    pub fn register_spritesheet_format(
        &mut self,
        kind: &SpritesheetFormatKind,
        entry: Arc<SpritesheetFormatEntry>,
    ) {
        register_spritesheet_format(self, kind, entry);
    }

    pub fn spritesheet_all_formats(&self) -> &[SpritesheetFormatDescriptor] {
        return spritesheet_all_formats(self);
    }

    pub fn starling_spritesheet_format(&self) -> &SpritesheetFormatDescriptor {
        return starling_spritesheet_format(self);
    }

    pub fn texture_packer_spritesheet_format(&self) -> &SpritesheetFormatDescriptor {
        return texture_packer_spritesheet_format(self);
    }

    pub fn unregister_spritesheet_format(&mut self, kind: &SpritesheetFormatKind) {
        unregister_spritesheet_format(self, kind);
    }
}
