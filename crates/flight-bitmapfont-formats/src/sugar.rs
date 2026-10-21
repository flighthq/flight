use std::sync::Arc;

use flight_bitmapfont::{BitmapFont, BitmapFontGuardStateRef};
use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::ImportDiagnostic;

use crate::bitmap_font_detect::*;
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_bitmapfont::create_bitmap_font_guard_state;
    use flight_textureatlas::create_texture_atlas;

    const FNT: &str = concat!(
        "info face=\"Test\" size=16\n",
        "common lineHeight=16 base=12 pages=1\n",
        "page id=0 file=\"test.png\"\n",
        "chars count=1\n",
        "char id=65 x=0 y=0 width=4 height=5 xoffset=0 yoffset=1 xadvance=5 page=0"
    );

    fn kinds(registry: &BitmapFontFormatRegistry) -> Vec<BitmapFontFormatKind> {
        let mut out = Vec::new();
        get_bitmap_font_format_kinds(&mut out, registry);
        return out;
    }

    fn page_options() -> BitmapFontParseOptions {
        let page = create_texture_atlas(None);
        return BitmapFontParseOptions {
            resolve_page: Some(Arc::new(move |_id, _file| Some(page.clone()))),
        };
    }

    #[test]
    fn apply_bitmap_font_import_options_delegates() {
        let guard = create_bitmap_font_guard_state();
        let mut method = create_bitmap_font_format_registry(&guard);
        let mut function = create_bitmap_font_format_registry(&guard);
        let kind = BITMAP_FONT_FORMAT_KIND_BM_FONT_XML.to_string();
        unregister_bitmap_font_format(&mut method, &kind);
        unregister_bitmap_font_format(&mut function, &kind);
        let options = BitmapFontImportOptions {
            formats: Some(vec![bm_font_xml_format(&method).clone()]),
        };
        method.apply_bitmap_font_import_options(&options);
        apply_bitmap_font_import_options(&mut function, &options);
        assert_eq!(kinds(&method), kinds(&function));
    }

    #[test]
    fn bitmap_font_all_formats_delegates() {
        let guard = create_bitmap_font_guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert_eq!(
            registry.bitmap_font_all_formats().len(),
            bitmap_font_all_formats(&registry).len()
        );
    }

    #[test]
    fn bm_font_binary_format_delegates() {
        let guard = create_bitmap_font_guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert!(std::ptr::eq(
            registry.bm_font_binary_format(),
            bm_font_binary_format(&registry)
        ));
    }

    #[test]
    fn bm_font_json_format_delegates() {
        let guard = create_bitmap_font_guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert!(std::ptr::eq(
            registry.bm_font_json_format(),
            bm_font_json_format(&registry)
        ));
    }

    #[test]
    fn bm_font_text_format_delegates() {
        let guard = create_bitmap_font_guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert!(std::ptr::eq(
            registry.bm_font_text_format(),
            bm_font_text_format(&registry)
        ));
    }

    #[test]
    fn bm_font_xml_format_delegates() {
        let guard = create_bitmap_font_guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert!(std::ptr::eq(
            registry.bm_font_xml_format(),
            bm_font_xml_format(&registry)
        ));
    }

    #[test]
    fn detect_bitmap_font_format_delegates() {
        let guard = create_bitmap_font_guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        assert_eq!(
            registry.detect_bitmap_font_format(FNT.as_bytes()),
            detect_bitmap_font_format(&registry, FNT.as_bytes())
        );
    }

    #[test]
    fn get_bitmap_font_format_delegates() {
        let guard = create_bitmap_font_guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        let kind = BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT.to_string();
        let method = registry.get_bitmap_font_format(&kind).unwrap();
        let function = get_bitmap_font_format(&registry, &kind).unwrap();
        assert!(Arc::ptr_eq(&method, &function));
    }

    #[test]
    fn get_bitmap_font_format_kinds_delegates() {
        let guard = create_bitmap_font_guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        let mut method = Vec::new();
        let mut function = Vec::new();
        registry.get_bitmap_font_format_kinds(&mut method);
        get_bitmap_font_format_kinds(&mut function, &registry);
        assert_eq!(method, function);
    }

    #[test]
    fn new_delegates() {
        let guard = create_bitmap_font_guard_state();
        let method = BitmapFontFormatRegistry::new(&guard);
        let function = create_bitmap_font_format_registry(&guard);
        assert_eq!(kinds(&method), kinds(&function));
    }

    #[test]
    fn parse_bitmap_font_delegates() {
        let guard = create_bitmap_font_guard_state();
        let registry = create_bitmap_font_format_registry(&guard);
        let options = page_options();
        let method = registry.parse_bitmap_font(FNT.as_bytes(), None, Some(&options), None);
        let function = parse_bitmap_font(&registry, FNT.as_bytes(), None, Some(&options), None);
        assert_eq!(method.is_some(), function.is_some());
    }

    #[test]
    fn register_bitmap_font_format_delegates() {
        let guard = create_bitmap_font_guard_state();
        let mut method = create_bitmap_font_format_registry(&guard);
        let mut function = create_bitmap_font_format_registry(&guard);
        let kind = "acme.D18".to_string();
        let entry = Arc::new(BitmapFontFormatEntry {
            detect: Arc::new(|bytes| bytes == b"D18"),
            parse: Arc::new(|_bytes, _options, _diagnostics| None),
        });
        method.register_bitmap_font_format(&kind, entry.clone());
        register_bitmap_font_format(&mut function, &kind, entry);
        assert_eq!(
            method.detect_bitmap_font_format(b"D18"),
            detect_bitmap_font_format(&function, b"D18")
        );
    }

    #[test]
    fn unregister_bitmap_font_format_delegates() {
        let guard = create_bitmap_font_guard_state();
        let mut method = create_bitmap_font_format_registry(&guard);
        let mut function = create_bitmap_font_format_registry(&guard);
        let kind = BITMAP_FONT_FORMAT_KIND_BM_FONT_TEXT.to_string();
        method.unregister_bitmap_font_format(&kind);
        unregister_bitmap_font_format(&mut function, &kind);
        assert_eq!(kinds(&method), kinds(&function));
    }
}

impl BitmapFontFormatRegistry {
    pub fn new(guard_state: &BitmapFontGuardStateRef) -> Self {
        return create_bitmap_font_format_registry(guard_state);
    }

    pub fn apply_bitmap_font_import_options(&mut self, options: &BitmapFontImportOptions) {
        apply_bitmap_font_import_options(self, options);
    }

    pub fn bitmap_font_all_formats(&self) -> &[BitmapFontFormatDescriptor] {
        return bitmap_font_all_formats(self);
    }

    pub fn bm_font_binary_format(&self) -> &BitmapFontFormatDescriptor {
        return bm_font_binary_format(self);
    }

    pub fn bm_font_json_format(&self) -> &BitmapFontFormatDescriptor {
        return bm_font_json_format(self);
    }

    pub fn bm_font_text_format(&self) -> &BitmapFontFormatDescriptor {
        return bm_font_text_format(self);
    }

    pub fn bm_font_xml_format(&self) -> &BitmapFontFormatDescriptor {
        return bm_font_xml_format(self);
    }

    pub fn detect_bitmap_font_format(&self, bytes: &Uint8Array) -> Option<BitmapFontFormatKind> {
        return detect_bitmap_font_format(self, bytes);
    }

    pub fn get_bitmap_font_format(
        &self,
        kind: &BitmapFontFormatKind,
    ) -> Option<Arc<BitmapFontFormatEntry>> {
        return get_bitmap_font_format(self, kind);
    }

    pub fn get_bitmap_font_format_kinds(&self, out: &mut Vec<BitmapFontFormatKind>) {
        get_bitmap_font_format_kinds(out, self);
    }

    pub fn parse_bitmap_font(
        &self,
        bytes: &Uint8Array,
        format_kind: Option<&BitmapFontFormatKind>,
        options: Option<&BitmapFontParseOptions>,
        diagnostics: Option<&mut Vec<ImportDiagnostic>>,
    ) -> Option<Ref<BitmapFont>> {
        return parse_bitmap_font(self, bytes, format_kind, options, diagnostics);
    }

    pub fn register_bitmap_font_format(
        &mut self,
        kind: &BitmapFontFormatKind,
        entry: Arc<BitmapFontFormatEntry>,
    ) {
        register_bitmap_font_format(self, kind, entry);
    }

    pub fn unregister_bitmap_font_format(&mut self, kind: &BitmapFontFormatKind) {
        unregister_bitmap_font_format(self, kind);
    }
}
