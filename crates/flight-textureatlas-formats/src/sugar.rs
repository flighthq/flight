use std::sync::Arc;

use flight_textureatlas::TextureAtlas;

use crate::texture_atlas_detect::*;
use crate::types::*;

#[cfg(test)]
mod tests {
    use super::*;
    use flight_textureatlas::create_texture_atlas;

    fn atlas() -> TextureAtlas {
        return Arc::try_unwrap(create_texture_atlas(None))
            .unwrap()
            .into_inner()
            .unwrap();
    }

    fn kinds(registry: &TextureAtlasFormatRegistry) -> Vec<TextureAtlasFormatKind> {
        let mut out = Vec::new();
        get_texture_atlas_format_kinds(&mut out, registry);
        return out;
    }

    fn starling() -> &'static str {
        return "<TextureAtlas imagePath=\"a.png\"><SubTexture name=\"x\" x=\"0\" y=\"0\" width=\"1\" height=\"1\"/></TextureAtlas>";
    }

    #[test]
    fn apply_texture_atlas_import_options_delegates() {
        let mut a = create_texture_atlas_format_registry();
        let mut b = create_texture_atlas_format_registry();
        let kind = TEXTURE_ATLAS_FORMAT_KIND_STARLING.to_string();
        unregister_texture_atlas_format(&mut a, &kind);
        unregister_texture_atlas_format(&mut b, &kind);
        let options = TextureAtlasImportOptions {
            formats: Some(vec![starling_texture_atlas_format(&a).clone()]),
        };
        a.apply_texture_atlas_import_options(&options);
        apply_texture_atlas_import_options(&mut b, &options);
        assert_eq!(kinds(&a), kinds(&b));
    }

    #[test]
    fn aseprite_texture_atlas_format_delegates() {
        let registry = create_texture_atlas_format_registry();
        assert!(std::ptr::eq(
            registry.aseprite_texture_atlas_format(),
            aseprite_texture_atlas_format(&registry)
        ));
    }

    #[test]
    fn detect_texture_atlas_format_delegates() {
        let registry = create_texture_atlas_format_registry();
        assert_eq!(
            registry.detect_texture_atlas_format(starling()),
            detect_texture_atlas_format(&registry, starling())
        );
    }

    #[test]
    fn get_texture_atlas_format_delegates() {
        let registry = create_texture_atlas_format_registry();
        let kind = TEXTURE_ATLAS_FORMAT_KIND_STARLING.to_string();
        let a = registry.get_texture_atlas_format(&kind).unwrap();
        let b = get_texture_atlas_format(&registry, &kind).unwrap();
        assert!(Arc::ptr_eq(&a, &b));
    }

    #[test]
    fn get_texture_atlas_format_kinds_delegates() {
        let registry = create_texture_atlas_format_registry();
        let mut a = Vec::new();
        let mut b = Vec::new();
        registry.get_texture_atlas_format_kinds(&mut a);
        get_texture_atlas_format_kinds(&mut b, &registry);
        assert_eq!(a, b);
    }

    #[test]
    fn libgdx_atlas_texture_atlas_format_delegates() {
        let registry = create_texture_atlas_format_registry();
        assert!(std::ptr::eq(
            registry.libgdx_atlas_texture_atlas_format(),
            libgdx_atlas_texture_atlas_format(&registry)
        ));
    }

    #[test]
    fn new_delegates() {
        let a = TextureAtlasFormatRegistry::new();
        let b = create_texture_atlas_format_registry();
        assert_eq!(kinds(&a), kinds(&b));
    }

    #[test]
    fn parse_texture_atlas_delegates() {
        let registry = create_texture_atlas_format_registry();
        let mut a = atlas();
        let mut b = atlas();
        assert_eq!(
            registry.parse_texture_atlas(&mut a, starling(), None, None),
            parse_texture_atlas(&mut b, &registry, starling(), None, None)
        );
        assert_eq!(a.regions.len(), b.regions.len());
    }

    #[test]
    fn register_texture_atlas_format_delegates() {
        let mut a = create_texture_atlas_format_registry();
        let mut b = create_texture_atlas_format_registry();
        let kind = "acme.D18".to_string();
        let entry = Arc::new(TextureAtlasFormatEntry {
            detect: Arc::new(|content| content == "D18"),
            parse: Arc::new(|_atlas, _content, _options| {}),
        });
        a.register_texture_atlas_format(&kind, entry.clone());
        register_texture_atlas_format(&mut b, &kind, entry);
        assert_eq!(
            a.detect_texture_atlas_format("D18"),
            detect_texture_atlas_format(&b, "D18")
        );
    }

    #[test]
    fn starling_texture_atlas_format_delegates() {
        let registry = create_texture_atlas_format_registry();
        assert!(std::ptr::eq(
            registry.starling_texture_atlas_format(),
            starling_texture_atlas_format(&registry)
        ));
    }

    #[test]
    fn texture_atlas_all_formats_delegates() {
        let registry = create_texture_atlas_format_registry();
        assert_eq!(
            registry.texture_atlas_all_formats().len(),
            texture_atlas_all_formats(&registry).len()
        );
    }

    #[test]
    fn texture_packer_texture_atlas_format_delegates() {
        let registry = create_texture_atlas_format_registry();
        assert!(std::ptr::eq(
            registry.texture_packer_texture_atlas_format(),
            texture_packer_texture_atlas_format(&registry)
        ));
    }

    #[test]
    fn unregister_texture_atlas_format_delegates() {
        let mut a = create_texture_atlas_format_registry();
        let mut b = create_texture_atlas_format_registry();
        let kind = TEXTURE_ATLAS_FORMAT_KIND_STARLING.to_string();
        a.unregister_texture_atlas_format(&kind);
        unregister_texture_atlas_format(&mut b, &kind);
        assert_eq!(kinds(&a), kinds(&b));
    }
}

impl TextureAtlasFormatRegistry {
    pub fn new() -> Self {
        return create_texture_atlas_format_registry();
    }

    pub fn apply_texture_atlas_import_options(&mut self, options: &TextureAtlasImportOptions) {
        apply_texture_atlas_import_options(self, options);
    }

    pub fn aseprite_texture_atlas_format(&self) -> &TextureAtlasFormatDescriptor {
        return aseprite_texture_atlas_format(self);
    }

    pub fn detect_texture_atlas_format(&self, content: &str) -> Option<TextureAtlasFormatKind> {
        return detect_texture_atlas_format(self, content);
    }

    pub fn get_texture_atlas_format(
        &self,
        kind: &TextureAtlasFormatKind,
    ) -> Option<Arc<TextureAtlasFormatEntry>> {
        return get_texture_atlas_format(self, kind);
    }

    pub fn get_texture_atlas_format_kinds(&self, out: &mut Vec<TextureAtlasFormatKind>) {
        get_texture_atlas_format_kinds(out, self);
    }

    pub fn libgdx_atlas_texture_atlas_format(&self) -> &TextureAtlasFormatDescriptor {
        return libgdx_atlas_texture_atlas_format(self);
    }

    pub fn parse_texture_atlas(
        &self,
        atlas: &mut TextureAtlas,
        content: &str,
        format_kind: Option<&TextureAtlasFormatKind>,
        options: Option<&TextureAtlasParseOptions>,
    ) -> bool {
        return parse_texture_atlas(atlas, self, content, format_kind, options);
    }

    pub fn register_texture_atlas_format(
        &mut self,
        kind: &TextureAtlasFormatKind,
        entry: Arc<TextureAtlasFormatEntry>,
    ) {
        register_texture_atlas_format(self, kind, entry);
    }

    pub fn starling_texture_atlas_format(&self) -> &TextureAtlasFormatDescriptor {
        return starling_texture_atlas_format(self);
    }

    pub fn texture_atlas_all_formats(&self) -> &[TextureAtlasFormatDescriptor] {
        return texture_atlas_all_formats(self);
    }

    pub fn texture_packer_texture_atlas_format(&self) -> &TextureAtlasFormatDescriptor {
        return texture_packer_texture_atlas_format(self);
    }

    pub fn unregister_texture_atlas_format(&mut self, kind: &TextureAtlasFormatKind) {
        unregister_texture_atlas_format(self, kind);
    }
}
