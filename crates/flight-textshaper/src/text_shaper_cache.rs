use std::collections::HashMap;
use std::sync::Arc;

use flight_entity::{Ref, allocate_entity};
use flight_textformat::TextFormat;

use crate::text_shaper::get_text_direction_string;
use crate::text_shaper_run::shape_text_run;
use crate::types::*;

pub fn create_text_shaper_cache() -> TextShaperCache {
    let mut out: TextShaperCache = allocate_entity();
    initialize_text_shaper_cache(&mut out);
    return out;
}

/// The construction initializer of `create_text_shaper_cache`: a live, empty entry table.
pub fn initialize_text_shaper_cache(out: &mut TextShaperCache) {
    out.backends = Vec::new();
    out.entries = Some(HashMap::new());
    out.next_backend_id = 1;
}

/// Drops every cached run; the cache stays usable.
pub fn clear_text_shaper_cache(cache: &mut TextShaperCache) {
    if let Some(entries) = &mut cache.entries {
        entries.clear();
    }
}

/// Drops every cached run and retires the cache: later lookups return `None` without shaping.
/// Idempotent.
pub fn dispose_text_shaper_cache(cache: &mut TextShaperCache) {
    let Some(entries) = &mut cache.entries else {
        return;
    };
    entries.clear();
    cache.entries = None;
}

// Backend identity is allocation state, scoping keys only: one id per live host provider, held
// weakly so a dropped provider is neither retained nor confused with a later one.
fn get_backend_cache_id(cache: &mut TextShaperCache, backend: &HostTextShaperCapability) -> u64 {
    cache
        .backends
        .retain(|(provider, _)| provider.strong_count() > 0);
    let address = Arc::as_ptr(&backend.provider) as *const ();
    if let Some((_, id)) = cache
        .backends
        .iter()
        .find(|(provider, _)| provider.as_ptr() as *const () == address)
    {
        return *id;
    }
    let id = cache.next_backend_id;
    cache.next_backend_id += 1;
    cache.backends.push((Arc::downgrade(&backend.provider), id));
    return id;
}

fn make_cache_key(text: &str, format: &TextFormat, options: Option<&ShapeRunOptions>) -> String {
    let flag = |value: Option<bool>| if value.unwrap_or(false) { "1" } else { "0" };
    let fmt = [
        format.font.clone().unwrap_or_default(),
        format.size.unwrap_or(12.0).to_string(),
        flag(format.bold).to_string(),
        flag(format.italic).to_string(),
        flag(format.kerning).to_string(),
        format.letter_spacing.unwrap_or(0.0).to_string(),
    ]
    .join("\u{1}");
    let opts = match options {
        None => String::new(),
        Some(options) => {
            let direction = options
                .direction
                .map(get_text_direction_string)
                .unwrap_or("");
            format!(
                "{direction}\u{1}{}",
                options.script.as_deref().unwrap_or("")
            )
        }
    };
    return format!("{text}\u{0}{fmt}\u{0}{opts}");
}

/// The cached run for an equivalent earlier call (the same shared run), or shapes, stores and returns
/// a new one. Keys cover the host provider's identity, the text, the shaping-relevant format fields
/// (font, size, bold, italic, kerning, letter spacing) and the options; an omitted options value keys
/// differently from an empty one. `None` results (an advances-only host, or a disposed cache) are not
/// cached.
pub fn shape_text_run_cached(
    host_text_shaper: &HostTextShaperCapability,
    cache: &mut TextShaperCache,
    text: &str,
    format: &TextFormat,
    options: Option<&ShapeRunOptions>,
) -> Option<Ref<ShapedRun>> {
    cache.entries.as_ref()?;
    let backend_id = get_backend_cache_id(cache, host_text_shaper);
    let key = format!("{backend_id}\u{0}{}", make_cache_key(text, format, options));
    if let Some(existing) = cache.entries.as_ref()?.get(&key) {
        return Some(existing.clone());
    }
    let result = shape_text_run(host_text_shaper, text, format, options);
    if let (Some(run), Some(entries)) = (&result, &mut cache.entries) {
        entries.insert(key, run.clone());
    }
    return result;
}
