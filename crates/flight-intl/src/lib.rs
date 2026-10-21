//! Locale-aware formatting seam: explicit locale input, ordered Intl option records, a bounded
//! caller-owned formatter cache, and the format/compare/select wrappers. Every platform `Intl.*`
//! operation is supplied by the explicit host capability; no ambient locale, OS or clock access
//! lives here.

mod cache;
mod collator;
mod datetime;
#[cfg(test)]
mod intl_test_support;
mod list;
mod number;
mod options;
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

pub use contract::CollatorCaseFirst;
pub use contract::CollatorOptions;
pub use contract::CollatorSensitivity;
pub use contract::CollatorUsage;
pub use contract::CompactDisplay;
pub use contract::CurrencyDisplay;
pub use contract::CurrencySign;
pub use contract::DateFormatMatcher;
pub use contract::DateTimeFormatOptions;
pub use contract::DateTimeStyle;
pub use contract::DateTimeTextStyle;
pub use contract::DayPeriodStyle;
pub use contract::FormatterCache;
pub use contract::HostIntlCapability;
pub use contract::HourCycle;
pub use contract::IntlCollatorHandle;
pub use contract::IntlDateInput;
pub use contract::IntlDateTimeFormatHandle;
pub use contract::IntlListFormatHandle;
pub use contract::IntlNumberFormatHandle;
pub use contract::IntlOptionsKey;
pub use contract::IntlPluralCategory;
pub use contract::IntlPluralRulesHandle;
pub use contract::IntlRelativeTimeFormatHandle;
pub use contract::IntlRelativeTimeUnit;
pub use contract::ListFormatOptions;
pub use contract::ListStyle;
pub use contract::ListType;
pub use contract::LocaleInput;
pub use contract::LocaleMatcher;
pub use contract::MonthStyle;
pub use contract::NumberFormatOptions;
pub use contract::NumberNotation;
pub use contract::NumberStyle;
pub use contract::PluralRulesOptions;
pub use contract::PluralType;
pub use contract::RelativeTimeFormatOptions;
pub use contract::RelativeTimeNumeric;
pub use contract::RelativeTimeStyle;
pub use contract::SignDisplay;
pub use contract::TimeFieldStyle;
pub use contract::TimeZoneNameStyle;
pub use contract::UnitDisplay;
pub use contract::UseGrouping;
