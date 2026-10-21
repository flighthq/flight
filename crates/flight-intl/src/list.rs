//! Locale-aware list joining (TS `list.ts`).

use crate::cache::{FormatterCache, get_cache_key, get_cached};
use crate::types::*;

/// Joins `items` into one locale-aware list string (TS `formatList`); the default is a conjunction
/// list, and options select disjunction or a tighter style.
// flight-lint: allow(conform-params) D5: caller-owned FormatterCache and the explicit host capability replace the source module map and ambient Intl
pub fn format_list(
    cache: &mut FormatterCache,
    host: &HostIntlCapability,
    items: &[String],
    locale: &LocaleInput,
    options: Option<&IntlOptions>,
) -> String {
    let key = get_cache_key("list", locale, options);
    let empty = IntlOptions::default();
    let values = options.unwrap_or(&empty);
    let formatter = get_cached(cache, &key, || (host.create_list_format)(locale, values));
    return (formatter.format)(items);
}
