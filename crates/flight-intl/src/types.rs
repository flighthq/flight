//! The intl contract types: the locale input union and the closed
//! plural-category and relative-time-unit domains (TS `types/src/LocaleInput.ts` and the external
//! `Intl.*` option domains).

use std::sync::Arc;

use flight_hostcapability::ProviderRef;

use crate::options::*;

/// The array arm of the locale union (TS `readonly string[]`): a named payload record so the
/// untagged union keeps its source shape without an invented runtime discriminator.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LocaleList {
    pub locales: Vec<String>,
}

/// A BCP-47 locale specifier accepted by every formatter (TS `LocaleInput`): either a single locale
/// tag or a priority-ordered fallback list. Passing nothing to `Intl` selects the runtime default;
/// these wrappers require an explicit locale instead, so it is always visible at the call site.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LocaleInput {
    Single(String),
    List(LocaleList),
}

/// A date input (TS `Date | number`): either a `Date`'s epoch-millisecond time or an epoch-millisecond
/// number. Both reduce to the millisecond value; `NaN` is the source's invalid-date sentinel.
// flight-lint: allow(f64) D1: epoch milliseconds need the 53-bit JS number range; f32 cannot represent calendar instants
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum IntlDateInput {
    Date(f64),
    EpochMillis(f64),
}

/// A CLDR plural category (TS `Intl.LDMLPluralRule`), a closed string union.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IntlPluralCategory {
    Zero,
    One,
    Two,
    Few,
    Many,
    Other,
}

/// A relative-time unit (TS `Intl.RelativeTimeFormatUnit`), a closed string union including both
/// singular and plural spellings accepted by the platform API.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IntlRelativeTimeUnit {
    Year,
    Years,
    Quarter,
    Quarters,
    Month,
    Months,
    Week,
    Weeks,
    Day,
    Days,
    Hour,
    Hours,
    Minute,
    Minutes,
    Second,
    Seconds,
}

/// One immutable locale collator handle produced by the host (TS `Intl.Collator`). `compare`
/// returns a negative value when the first string sorts first, 0 when equal, positive otherwise.
// flight-lint: allow(f64) D1: the comparator returns the source's JS number result
#[derive(Clone)]
pub struct IntlCollatorHandle {
    pub compare: Arc<dyn Fn(&str, &str) -> f64 + Send + Sync>,
}

/// One immutable date/time formatter handle produced by the host (TS `Intl.DateTimeFormat`).
/// `format` takes epoch milliseconds.
// flight-lint: allow(f64) D1: format consumes epoch milliseconds in the JS number range
#[derive(Clone)]
pub struct IntlDateTimeFormatHandle {
    pub format: Arc<dyn Fn(f64) -> String + Send + Sync>,
}

/// One immutable list formatter handle produced by the host (TS `Intl.ListFormat`).
#[derive(Clone)]
pub struct IntlListFormatHandle {
    pub format: Arc<dyn Fn(&[String]) -> String + Send + Sync>,
}

/// One immutable number formatter handle produced by the host (TS `Intl.NumberFormat`).
// flight-lint: allow(f64) D1: number formatting consumes the JS number value exactly
#[derive(Clone)]
pub struct IntlNumberFormatHandle {
    pub format: Arc<dyn Fn(f64) -> String + Send + Sync>,
}

/// One immutable plural-rules handle produced by the host (TS `Intl.PluralRules`).
// flight-lint: allow(f64) D1: plural selection consumes the JS number value exactly
#[derive(Clone)]
pub struct IntlPluralRulesHandle {
    pub select: Arc<dyn Fn(f64) -> IntlPluralCategory + Send + Sync>,
}

/// One immutable relative-time formatter handle produced by the host (TS
/// `Intl.RelativeTimeFormat`).
// flight-lint: allow(f64) D1: relative-time formatting consumes the JS number offset exactly
#[derive(Clone)]
pub struct IntlRelativeTimeFormatHandle {
    pub format: Arc<dyn Fn(f64, IntlRelativeTimeUnit) -> String + Send + Sync>,
}

/// The host formatter factories (TS `new Intl.*`). Each builds an immutable handle for the locale
/// and ordered option record; the cache decides when a factory is invoked.
#[derive(Clone)]
pub struct HostIntlCapability {
    pub provider: ProviderRef,
    pub create_collator:
        Arc<dyn Fn(&LocaleInput, &CollatorOptions) -> IntlCollatorHandle + Send + Sync>,
    pub create_date_time_format:
        Arc<dyn Fn(&LocaleInput, &DateTimeFormatOptions) -> IntlDateTimeFormatHandle + Send + Sync>,
    pub create_list_format:
        Arc<dyn Fn(&LocaleInput, &ListFormatOptions) -> IntlListFormatHandle + Send + Sync>,
    pub create_number_format:
        Arc<dyn Fn(&LocaleInput, &NumberFormatOptions) -> IntlNumberFormatHandle + Send + Sync>,
    pub create_plural_rules:
        Arc<dyn Fn(&LocaleInput, &PluralRulesOptions) -> IntlPluralRulesHandle + Send + Sync>,
    pub create_relative_time_format: Arc<
        dyn Fn(&LocaleInput, &RelativeTimeFormatOptions) -> IntlRelativeTimeFormatHandle
            + Send
            + Sync,
    >,
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS `Intl.LDMLPluralRule` literal union; the TS package exports no get_/parse_ free functions
pub fn get_intl_plural_category_string(value: IntlPluralCategory) -> &'static str {
    return match value {
        IntlPluralCategory::Zero => "zero",
        IntlPluralCategory::One => "one",
        IntlPluralCategory::Two => "two",
        IntlPluralCategory::Few => "few",
        IntlPluralCategory::Many => "many",
        IntlPluralCategory::Other => "other",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical string table for the TS `Intl.RelativeTimeFormatUnit` literal union; the TS package exports no get_/parse_ free functions
pub fn get_intl_relative_time_unit_string(value: IntlRelativeTimeUnit) -> &'static str {
    return match value {
        IntlRelativeTimeUnit::Year => "year",
        IntlRelativeTimeUnit::Years => "years",
        IntlRelativeTimeUnit::Quarter => "quarter",
        IntlRelativeTimeUnit::Quarters => "quarters",
        IntlRelativeTimeUnit::Month => "month",
        IntlRelativeTimeUnit::Months => "months",
        IntlRelativeTimeUnit::Week => "week",
        IntlRelativeTimeUnit::Weeks => "weeks",
        IntlRelativeTimeUnit::Day => "day",
        IntlRelativeTimeUnit::Days => "days",
        IntlRelativeTimeUnit::Hour => "hour",
        IntlRelativeTimeUnit::Hours => "hours",
        IntlRelativeTimeUnit::Minute => "minute",
        IntlRelativeTimeUnit::Minutes => "minutes",
        IntlRelativeTimeUnit::Second => "second",
        IntlRelativeTimeUnit::Seconds => "seconds",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS `Intl.LDMLPluralRule` literal union; the TS package exports no get_/parse_ free functions
pub fn parse_intl_plural_category(value: &str) -> Option<IntlPluralCategory> {
    return match value {
        "zero" => Some(IntlPluralCategory::Zero),
        "one" => Some(IntlPluralCategory::One),
        "two" => Some(IntlPluralCategory::Two),
        "few" => Some(IntlPluralCategory::Few),
        "many" => Some(IntlPluralCategory::Many),
        "other" => Some(IntlPluralCategory::Other),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust canonical parser for the TS `Intl.RelativeTimeFormatUnit` literal union; the TS package exports no get_/parse_ free functions
pub fn parse_intl_relative_time_unit(value: &str) -> Option<IntlRelativeTimeUnit> {
    return match value {
        "year" => Some(IntlRelativeTimeUnit::Year),
        "years" => Some(IntlRelativeTimeUnit::Years),
        "quarter" => Some(IntlRelativeTimeUnit::Quarter),
        "quarters" => Some(IntlRelativeTimeUnit::Quarters),
        "month" => Some(IntlRelativeTimeUnit::Month),
        "months" => Some(IntlRelativeTimeUnit::Months),
        "week" => Some(IntlRelativeTimeUnit::Week),
        "weeks" => Some(IntlRelativeTimeUnit::Weeks),
        "day" => Some(IntlRelativeTimeUnit::Day),
        "days" => Some(IntlRelativeTimeUnit::Days),
        "hour" => Some(IntlRelativeTimeUnit::Hour),
        "hours" => Some(IntlRelativeTimeUnit::Hours),
        "minute" => Some(IntlRelativeTimeUnit::Minute),
        "minutes" => Some(IntlRelativeTimeUnit::Minutes),
        "second" => Some(IntlRelativeTimeUnit::Second),
        "seconds" => Some(IntlRelativeTimeUnit::Seconds),
        _ => None,
    };
}
