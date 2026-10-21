//! Locale-aware formatting seam: explicit locale input, ordered Intl option records, a bounded
//! caller-owned formatter cache, and the format/compare/select wrappers. Every platform `Intl.*`
//! operation is supplied by the explicit host capability; no ambient locale, OS or clock access
//! lives here.

mod cache;
mod collator;
mod datetime;
mod list;
mod number;
mod plural;
mod relative_time;
mod types;

pub mod contract;

// Public lane: the functions exported by pinned TS `index.ts`, plus the locally owned types their
// signatures use. The cache helpers stay contract-only, as in the source `index.ts`.
pub use contract::compare_strings;
pub use contract::format_compact_number;
pub use contract::format_currency;
pub use contract::format_date;
pub use contract::format_date_time;
pub use contract::format_list;
pub use contract::format_number;
pub use contract::format_percent;
pub use contract::format_relative_time;
pub use contract::format_time;
pub use contract::format_unit;
pub use contract::select_ordinal_category;
pub use contract::select_plural_category;
pub use contract::sort_strings;

pub use contract::FormatterCache;
pub use contract::HostIntlCapability;
pub use contract::IntlCollatorHandle;
pub use contract::IntlDateInput;
pub use contract::IntlDateTimeFormatHandle;
pub use contract::IntlListFormatHandle;
pub use contract::IntlNumberFormatHandle;
pub use contract::IntlOptionValue;
pub use contract::IntlOptions;
pub use contract::IntlPluralCategory;
pub use contract::IntlPluralRulesHandle;
pub use contract::IntlRelativeTimeFormatHandle;
pub use contract::IntlRelativeTimeUnit;
pub use contract::LocaleInput;
