//! flight-compiler: target-native
//! Opt-in `<span class>` styling over a caller-owned class map (TS `markupClassStyles.ts`).

use std::sync::Arc;

use flight_entity::{Record, Ref, get_record_value};
use flight_textformat::TextFormat;

use crate::types::*;

/// Installs a class resolver over the caller's own class-to-format map (TS `registerMarkupClassStyles`).
/// The map is live: the resolver reads it at parse time, so a later caller mutation is visible. Unknown
/// class names resolve to `None`; class names match exactly (CSS classes are case-sensitive). A `class`
/// naming several space-separated classes merges their formats left to right in the `<span>` handler.
pub fn register_markup_class_styles(
    registry: &mut MarkupTagRegistry,
    styles: &Ref<Record<TextFormat>>,
) {
    let styles = styles.clone();
    let resolver: MarkupClassResolver = Arc::new(move |class_name: &str| {
        let guard = styles.read().unwrap();
        return get_record_value(&guard, class_name).cloned();
    });
    registry.seams.write().unwrap().class_resolver = Some(resolver);
}
