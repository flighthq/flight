use std::sync::Arc;

use flight_bitmapfont::{BitmapFont, BitmapFontGuardStateRef};
use flight_entity::{Ref, Uint8Array};
use flight_importdiagnostics::ImportDiagnostic;

use crate::bitmap_font_detect::*;
use crate::types::*;

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
