//! The bounded formatter cache and stable cache keys (TS `cache.ts`).
//!
//! The source keeps one module-level `Map` of immutable `Intl.*` formatter instances. The Rust port
//! makes that cache caller-owned state (D5): every formatter helper takes `&mut FormatterCache`.
//! Eviction is plain FIFO (insertion order), never LRU, with the source's 256-entry capacity.

use std::any::Any;
use std::sync::Arc;

use flight_entity::{entries, set_record_value};

use crate::types::*;

/// Caller-owned replacement for the source module-level formatter map (D5). Values are immutable
/// formatter handles stored in insertion order; the first entry is the oldest and is evicted first.
pub struct FormatterCache {
    entries: Vec<(String, Arc<dyn Any + Send + Sync>)>,
}

const CACHE_CAPACITY: usize = 256;

/// Creates an empty formatter cache (the caller-owned replacement for the source module map).
// flight-lint: allow(conform-extra) D5: caller-owned FormatterCache replaces the source module-level Map; TS exports no factory
pub fn create_formatter_cache() -> FormatterCache {
    return FormatterCache {
        entries: Vec::new(),
    };
}

/// Builds an ordered option record from literal key/value pairs, preserving the source object
/// literal's insertion order.
pub(crate) fn create_intl_options(values: &[(&str, IntlOptionValue)]) -> IntlOptions {
    let mut out = IntlOptions::default();
    for (key, value) in values {
        set_record_value(&mut out, key.to_string(), value.clone());
    }
    return out;
}

/// Builds the stable cache key for one formatter family (TS `getCacheKey`): `kind|localeKey|options`
/// where the locale list is comma-joined and an omitted options object serializes as the empty string
/// (an explicitly empty object serializes as `{}`). Option key order is the record's insertion order,
/// matching the source object literal.
pub fn get_cache_key(kind: &str, locale: &LocaleInput, options: Option<&IntlOptions>) -> String {
    let locale_key = match locale {
        LocaleInput::Single(value) => value.clone(),
        LocaleInput::List(values) => values.join(","),
    };
    let options_key = match options {
        Some(values) => get_intl_options_key(values),
        None => String::new(),
    };
    return format!("{}|{}|{}", kind, locale_key, options_key);
}

/// Returns the cached value for `key`, building and storing it with `build` on a miss (TS
/// `getCached`). Clones share the exact stored instance, matching the source's object identity.
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache replaces the source module-level Map
// flight-lint: allow(contract-vocabulary) source generic erasure: TS `getCached<T>` stores an immutable formatter in an `unknown`-valued map and returns the same instance; Rust erases to a Send+Sync Any slot, requires T: Send + Sync so the stored handle can be shared like the source formatter objects, and returns the shared Arc identity
pub fn get_cached<T: 'static + Send + Sync>(
    cache: &mut FormatterCache,
    key: &str,
    build: impl FnOnce() -> T,
) -> Arc<T> {
    if let Some((_, existing)) = cache.entries.iter().find(|(entry_key, _)| entry_key == key) {
        return existing
            .clone()
            .downcast::<T>()
            .expect("formatter cache entry matches the requested type");
    }
    let built = Arc::new(build());
    if cache.entries.len() >= CACHE_CAPACITY {
        cache.entries.remove(0);
    }
    cache
        .entries
        .push((key.to_string(), built.clone() as Arc<dyn Any + Send + Sync>));
    return built;
}

/// Serializes an ordered option record exactly as the source `JSON.stringify` does for the scalar
/// domains the package uses (strings escaped, booleans and integers literal).
fn get_intl_options_key(options: &IntlOptions) -> String {
    let mut out = String::from("{");
    let mut first = true;
    for (key, value) in entries(options) {
        if !first {
            out.push(',');
        }
        first = false;
        out.push('"');
        push_json_escaped(&mut out, key);
        out.push('"');
        out.push(':');
        match value {
            IntlOptionValue::Bool(flag) => {
                out.push_str(if *flag { "true" } else { "false" });
            }
            IntlOptionValue::Integer(number) => {
                out.push_str(&number.to_string());
            }
            IntlOptionValue::String(text) => {
                out.push('"');
                push_json_escaped(&mut out, text);
                out.push('"');
            }
        }
    }
    out.push('}');
    return out;
}

/// Applies the source's `{ ...defaults, ...options }` overlay: the base keys keep their positions
/// and caller keys update in place or append in caller insertion order.
pub(crate) fn overlay_intl_options(
    base: &[(&str, IntlOptionValue)],
    options: Option<&IntlOptions>,
) -> IntlOptions {
    let mut out = create_intl_options(base);
    if let Some(values) = options {
        for (key, value) in entries(values) {
            set_record_value(&mut out, key.to_string(), value.clone());
        }
    }
    return out;
}

fn push_json_escaped(out: &mut String, text: &str) {
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000C}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            value if (value as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", value as u32));
            }
            value => out.push(value),
        }
    }
}
