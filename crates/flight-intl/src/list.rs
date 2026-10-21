//! Locale-aware list joining (TS `list.ts`).

use crate::cache::{FormatterCache, get_cache_key, get_cached};
use crate::options::*;
use crate::types::*;
#[cfg(test)]
mod sugar_tests {
    use super::*;
    use crate::intl_test_support::{locale, test_host};

    #[test]
    fn format_and_open_list_format_match_their_free_functions() {
        let host = test_host();
        let handle = host.open_list_format(&locale(), &ListFormatOptions::default());
        let items = vec!["a".to_string(), "b".to_string()];
        assert_eq!(handle.format(&items), format_intl_list(&handle, &items));
        let via_free = create_intl_list_format(&host, &locale(), &ListFormatOptions::default());
        assert_eq!(
            format_intl_list(&via_free, &items),
            format_intl_list(&handle, &items)
        );
    }
}

// flight-lint: allow(conform-extra) D18: the source interface exposes formatter construction on the provider object; TS exports no free function
pub fn create_intl_list_format(
    host: &HostIntlCapability,
    locale: &LocaleInput,
    options: &ListFormatOptions,
) -> IntlListFormatHandle {
    return (host.create_list_format)(locale, options);
}

/// Delegates one list join to a cached list handle (Rust-owned receiver sugar).
// flight-lint: allow(conform-extra) D18: the source interface exposes `format` on the formatter instance; TS exports no free function
pub fn format_intl_list(formatter: &IntlListFormatHandle, items: &[String]) -> String {
    return (formatter.format)(items);
}

/// Joins `items` into one locale-aware list string (TS `formatList`); the default is a conjunction
/// list.
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_list(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    items: &[String],
    locale: &LocaleInput,
    options: Option<&ListFormatOptions>,
) -> String {
    let empty = ListFormatOptions::default();
    let values = options.unwrap_or(&empty);
    let key = get_cache_key("list", locale, options.map(IntlOptionsKey::List).as_ref());
    let formatter = get_cached(cache, &key, || host.open_list_format(locale, values));
    return format_intl_list(&formatter, items);
}

impl IntlListFormatHandle {
    pub fn format(&self, items: &[String]) -> String {
        return format_intl_list(self, items);
    }
}

/// Delegates one list-formatter construction to the host capability.

impl HostIntlCapability {
    pub fn open_list_format(
        &self,
        locale: &LocaleInput,
        options: &ListFormatOptions,
    ) -> IntlListFormatHandle {
        return create_intl_list_format(self, locale, options);
    }
}
