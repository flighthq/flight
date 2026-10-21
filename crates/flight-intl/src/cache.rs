//! The bounded formatter cache and stable cache keys (TS `cache.ts`).
//!
//! The source keeps one module-level `Map` of immutable `Intl.*` formatter instances. The Rust port
//! makes that cache caller-owned state (D5): every formatter helper takes `&mut FormatterCache`.
//! Eviction is plain FIFO (insertion order), never LRU, with the source's 256-entry capacity.

use std::any::Any;
use std::sync::Arc;

use crate::options::{IntlOptionsKey, get_options_key};
use crate::types::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn new_matches_create_formatter_cache() {
        let method_cache = FormatterCache::new();
        let free_cache = create_formatter_cache();
        let method_value = maybe_get(method_cache, "cache-test|sugar");
        let free_value = maybe_get(free_cache, "cache-test|sugar");
        assert_eq!(*method_value, *free_value);
    }

    fn maybe_get(mut cache: FormatterCache, key: &str) -> Arc<u32> {
        return get_cached(&mut cache, key, || 3u32);
    }

    #[test]
    fn get_method_matches_get_cached() {
        let mut method_cache = FormatterCache::new();
        let mut free_cache = create_formatter_cache();
        let method_value = method_cache.get_or_build("cache-test|get", || 9u32);
        let free_value = get_cached(&mut free_cache, "cache-test|get", || 9u32);
        assert_eq!(*method_value, *free_value);
        assert!(Arc::ptr_eq(
            &method_value,
            &method_cache.get_or_build("cache-test|get", || 0u32)
        ));
    }
}

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

/// Builds the stable cache key for one formatter family (TS `getCacheKey`): `kind|localeKey|options`,
/// with the locale list comma-joined and an omitted option record serializing as the empty string.
/// Present fields serialize in ECMA option order with JSON semantics (non-finite numbers become
/// null), matching the source object literal order.
pub fn get_cache_key(kind: &str, locale: &LocaleInput, options: Option<&IntlOptionsKey>) -> String {
    let locale_key = match locale {
        LocaleInput::Single(value) => value.clone(),
        LocaleInput::List(values) => values.join(","),
    };
    let options_key = match options {
        Some(values) => get_options_key(values),
        None => String::new(),
    };
    return format!("{}|{}|{}", kind, locale_key, options_key);
}

/// Returns the cached value for `key`, building and storing it with `build` on a miss (TS
/// `getCached`). Clones share the exact stored instance, matching the source's object identity.
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache replaces the source module-level Map
// flight-lint: allow(contract-vocabulary) source generic erasure: TS `getCached<T>` stores an immutable formatter in an `unknown`-valued map and returns the same instance; Rust erases to a Send+Sync Any slot and returns the shared Arc identity
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

impl FormatterCache {
    pub fn new() -> FormatterCache {
        return create_formatter_cache();
    }

    pub fn get_or_build<T: 'static + Send + Sync>(
        &mut self,
        key: &str,
        build: impl FnOnce() -> T,
    ) -> Arc<T> {
        return get_cached(self, key, build);
    }
}
