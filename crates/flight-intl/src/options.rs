//! ECMA-402 option records owned by this package: field names mirror the platform option names,
//! closed string unions are enums with exact platform strings, open identifiers stay String, every
//! field is optional, and numeric properties keep the JS number domain (f64).

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LocaleMatcher {
    Lookup,
    BestFit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CollatorUsage {
    Sort,
    Search,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CollatorSensitivity {
    Base,
    Accent,
    Case,
    Variant,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CollatorCaseFirst {
    Upper,
    Lower,
    False,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NumberStyle {
    Decimal,
    Percent,
    Currency,
    Unit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CurrencyDisplay {
    Code,
    Symbol,
    NarrowSymbol,
    Name,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CurrencySign {
    Standard,
    Accounting,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UnitDisplay {
    Short,
    Long,
    Narrow,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NumberNotation {
    Standard,
    Scientific,
    Engineering,
    Compact,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CompactDisplay {
    Short,
    Long,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignDisplay {
    Auto,
    Never,
    Always,
    ExceptZero,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DateFormatMatcher {
    Basic,
    BestFit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DateTimeStyle {
    Full,
    Long,
    Medium,
    Short,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HourCycle {
    H11,
    H12,
    H23,
    H24,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DateTimeTextStyle {
    Long,
    Short,
    Narrow,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MonthStyle {
    Numeric,
    TwoDigit,
    Long,
    Short,
    Narrow,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DayPeriodStyle {
    Narrow,
    Short,
    Long,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TimeZoneNameStyle {
    Short,
    Long,
    ShortOffset,
    LongOffset,
    ShortGeneric,
    LongGeneric,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TimeFieldStyle {
    Numeric,
    TwoDigit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ListType {
    Conjunction,
    Disjunction,
    Unit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ListStyle {
    Long,
    Short,
    Narrow,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PluralType {
    Cardinal,
    Ordinal,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RelativeTimeNumeric {
    Always,
    Auto,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RelativeTimeStyle {
    Long,
    Short,
    Narrow,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum UseGrouping {
    Bool(bool),
    Always,
    Auto,
    Min2,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CollatorOptions {
    pub locale_matcher: Option<LocaleMatcher>,
    pub usage: Option<CollatorUsage>,
    pub sensitivity: Option<CollatorSensitivity>,
    pub ignore_punctuation: Option<bool>,
    pub collation: Option<String>,
    pub numeric: Option<bool>,
    pub case_first: Option<CollatorCaseFirst>,
}

// flight-lint: allow(f64) D1: TS numeric option properties are `number`; the host interprets digit and limit values
#[derive(Clone, Debug, Default, PartialEq)]
pub struct DateTimeFormatOptions {
    pub locale_matcher: Option<LocaleMatcher>,
    pub weekday: Option<DateTimeTextStyle>,
    pub era: Option<DateTimeTextStyle>,
    pub year: Option<TimeFieldStyle>,
    pub month: Option<MonthStyle>,
    pub day: Option<TimeFieldStyle>,
    pub hour: Option<TimeFieldStyle>,
    pub minute: Option<TimeFieldStyle>,
    pub second: Option<TimeFieldStyle>,
    pub time_zone_name: Option<TimeZoneNameStyle>,
    pub format_matcher: Option<DateFormatMatcher>,
    pub hour12: Option<bool>,
    pub time_zone: Option<String>,
    pub calendar: Option<String>,
    pub day_period: Option<DayPeriodStyle>,
    pub numbering_system: Option<String>,
    pub date_style: Option<DateTimeStyle>,
    pub time_style: Option<DateTimeStyle>,
    pub hour_cycle: Option<HourCycle>,
    pub fractional_second_digits: Option<f64>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ListFormatOptions {
    pub locale_matcher: Option<LocaleMatcher>,
    pub type_: Option<ListType>,
    pub style: Option<ListStyle>,
}

// flight-lint: allow(f64) D1: TS numeric option properties are `number`; the host interprets digit and limit values
#[derive(Clone, Debug, Default, PartialEq)]
pub struct NumberFormatOptions {
    pub locale_matcher: Option<LocaleMatcher>,
    pub style: Option<NumberStyle>,
    pub currency: Option<String>,
    pub currency_display: Option<CurrencyDisplay>,
    pub currency_sign: Option<CurrencySign>,
    pub unit: Option<String>,
    pub unit_display: Option<UnitDisplay>,
    pub notation: Option<NumberNotation>,
    pub compact_display: Option<CompactDisplay>,
    pub use_grouping: Option<UseGrouping>,
    pub sign_display: Option<SignDisplay>,
    pub minimum_integer_digits: Option<f64>,
    pub minimum_fraction_digits: Option<f64>,
    pub maximum_fraction_digits: Option<f64>,
    pub minimum_significant_digits: Option<f64>,
    pub maximum_significant_digits: Option<f64>,
}

// flight-lint: allow(f64) D1: TS numeric option properties are `number`; the host interprets digit and limit values
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PluralRulesOptions {
    pub locale_matcher: Option<LocaleMatcher>,
    pub type_: Option<PluralType>,
    pub minimum_integer_digits: Option<f64>,
    pub minimum_fraction_digits: Option<f64>,
    pub maximum_fraction_digits: Option<f64>,
    pub minimum_significant_digits: Option<f64>,
    pub maximum_significant_digits: Option<f64>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct RelativeTimeFormatOptions {
    pub locale_matcher: Option<LocaleMatcher>,
    pub numeric: Option<RelativeTimeNumeric>,
    pub style: Option<RelativeTimeStyle>,
}

#[derive(Clone, Copy)]
pub struct CollatorOptionsKey<'a> {
    pub options: &'a CollatorOptions,
}

#[derive(Clone, Copy)]
pub struct DateTimeFormatOptionsKey<'a> {
    pub options: &'a DateTimeFormatOptions,
}

#[derive(Clone, Copy)]
pub struct ListFormatOptionsKey<'a> {
    pub options: &'a ListFormatOptions,
}

#[derive(Clone, Copy)]
pub struct NumberFormatOptionsKey<'a> {
    pub options: &'a NumberFormatOptions,
}

#[derive(Clone, Copy)]
pub struct PluralRulesOptionsKey<'a> {
    pub options: &'a PluralRulesOptions,
}

#[derive(Clone, Copy)]
pub struct RelativeTimeFormatOptionsKey<'a> {
    pub options: &'a RelativeTimeFormatOptions,
}

/// The family-tagged option record passed to `get_cache_key` (TS `Readonly<object>`).
#[derive(Clone, Copy)]
pub enum IntlOptionsKey<'a> {
    Collator(CollatorOptionsKey<'a>),
    DateTimeFormat(DateTimeFormatOptionsKey<'a>),
    List(ListFormatOptionsKey<'a>),
    Number(NumberFormatOptionsKey<'a>),
    Plural(PluralRulesOptionsKey<'a>),
    RelativeTime(RelativeTimeFormatOptionsKey<'a>),
}

pub(crate) fn escape_json(text: &str) -> String {
    let mut out = String::new();
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
    return out;
}

pub(crate) fn get_collator_case_first_string(value: CollatorCaseFirst) -> &'static str {
    return match value {
        CollatorCaseFirst::Upper => "upper",
        CollatorCaseFirst::Lower => "lower",
        CollatorCaseFirst::False => "false",
    };
}

pub(crate) fn get_collator_options_key(options: &CollatorOptions) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(value) = options.locale_matcher {
        parts.push(format!(
            "\"localeMatcher\":\"{}\"",
            get_locale_matcher_string(value)
        ));
    }
    if let Some(value) = options.usage {
        parts.push(format!(
            "\"usage\":\"{}\"",
            get_collator_usage_string(value)
        ));
    }
    if let Some(value) = options.sensitivity {
        parts.push(format!(
            "\"sensitivity\":\"{}\"",
            get_collator_sensitivity_string(value)
        ));
    }
    if let Some(value) = options.ignore_punctuation {
        parts.push(format!("\"ignorePunctuation\":{}", value));
    }
    if let Some(value) = &options.collation {
        parts.push(format!("\"collation\":\"{}\"", escape_json(value)));
    }
    if let Some(value) = options.numeric {
        parts.push(format!("\"numeric\":{}", value));
    }
    if let Some(value) = options.case_first {
        parts.push(format!(
            "\"caseFirst\":\"{}\"",
            get_collator_case_first_string(value)
        ));
    }
    return format!("{{{}}}", parts.join(","));
}

pub(crate) fn get_collator_sensitivity_string(value: CollatorSensitivity) -> &'static str {
    return match value {
        CollatorSensitivity::Base => "base",
        CollatorSensitivity::Accent => "accent",
        CollatorSensitivity::Case => "case",
        CollatorSensitivity::Variant => "variant",
    };
}

pub(crate) fn get_collator_usage_string(value: CollatorUsage) -> &'static str {
    return match value {
        CollatorUsage::Sort => "sort",
        CollatorUsage::Search => "search",
    };
}

pub(crate) fn get_compact_display_string(value: CompactDisplay) -> &'static str {
    return match value {
        CompactDisplay::Short => "short",
        CompactDisplay::Long => "long",
    };
}

pub(crate) fn get_currency_display_string(value: CurrencyDisplay) -> &'static str {
    return match value {
        CurrencyDisplay::Code => "code",
        CurrencyDisplay::Symbol => "symbol",
        CurrencyDisplay::NarrowSymbol => "narrowSymbol",
        CurrencyDisplay::Name => "name",
    };
}

pub(crate) fn get_currency_sign_string(value: CurrencySign) -> &'static str {
    return match value {
        CurrencySign::Standard => "standard",
        CurrencySign::Accounting => "accounting",
    };
}

pub(crate) fn get_date_format_matcher_string(value: DateFormatMatcher) -> &'static str {
    return match value {
        DateFormatMatcher::Basic => "basic",
        DateFormatMatcher::BestFit => "best fit",
    };
}

pub(crate) fn get_date_time_format_options_key(options: &DateTimeFormatOptions) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(value) = options.locale_matcher {
        parts.push(format!(
            "\"localeMatcher\":\"{}\"",
            get_locale_matcher_string(value)
        ));
    }
    if let Some(value) = options.weekday {
        parts.push(format!(
            "\"weekday\":\"{}\"",
            get_date_time_text_style_string(value)
        ));
    }
    if let Some(value) = options.era {
        parts.push(format!(
            "\"era\":\"{}\"",
            get_date_time_text_style_string(value)
        ));
    }
    if let Some(value) = options.year {
        parts.push(format!(
            "\"year\":\"{}\"",
            get_time_field_style_string(value)
        ));
    }
    if let Some(value) = options.month {
        parts.push(format!("\"month\":\"{}\"", get_month_style_string(value)));
    }
    if let Some(value) = options.day {
        parts.push(format!(
            "\"day\":\"{}\"",
            get_time_field_style_string(value)
        ));
    }
    if let Some(value) = options.hour {
        parts.push(format!(
            "\"hour\":\"{}\"",
            get_time_field_style_string(value)
        ));
    }
    if let Some(value) = options.minute {
        parts.push(format!(
            "\"minute\":\"{}\"",
            get_time_field_style_string(value)
        ));
    }
    if let Some(value) = options.second {
        parts.push(format!(
            "\"second\":\"{}\"",
            get_time_field_style_string(value)
        ));
    }
    if let Some(value) = options.time_zone_name {
        parts.push(format!(
            "\"timeZoneName\":\"{}\"",
            get_time_zone_name_style_string(value)
        ));
    }
    if let Some(value) = options.format_matcher {
        parts.push(format!(
            "\"formatMatcher\":\"{}\"",
            get_date_format_matcher_string(value)
        ));
    }
    if let Some(value) = options.hour12 {
        parts.push(format!("\"hour12\":{}", value));
    }
    if let Some(value) = &options.time_zone {
        parts.push(format!("\"timeZone\":\"{}\"", escape_json(value)));
    }
    if let Some(value) = &options.calendar {
        parts.push(format!("\"calendar\":\"{}\"", escape_json(value)));
    }
    if let Some(value) = options.day_period {
        parts.push(format!(
            "\"dayPeriod\":\"{}\"",
            get_day_period_style_string(value)
        ));
    }
    if let Some(value) = &options.numbering_system {
        parts.push(format!("\"numberingSystem\":\"{}\"", escape_json(value)));
    }
    if let Some(value) = options.date_style {
        parts.push(format!(
            "\"dateStyle\":\"{}\"",
            get_date_time_style_string(value)
        ));
    }
    if let Some(value) = options.time_style {
        parts.push(format!(
            "\"timeStyle\":\"{}\"",
            get_date_time_style_string(value)
        ));
    }
    if let Some(value) = options.hour_cycle {
        parts.push(format!(
            "\"hourCycle\":\"{}\"",
            get_hour_cycle_string(value)
        ));
    }
    if let Some(value) = options.fractional_second_digits {
        parts.push(format!("\"fractionalSecondDigits\":{}", json_number(value)));
    }
    return format!("{{{}}}", parts.join(","));
}

pub(crate) fn get_date_time_style_string(value: DateTimeStyle) -> &'static str {
    return match value {
        DateTimeStyle::Full => "full",
        DateTimeStyle::Long => "long",
        DateTimeStyle::Medium => "medium",
        DateTimeStyle::Short => "short",
    };
}

pub(crate) fn get_date_time_text_style_string(value: DateTimeTextStyle) -> &'static str {
    return match value {
        DateTimeTextStyle::Long => "long",
        DateTimeTextStyle::Short => "short",
        DateTimeTextStyle::Narrow => "narrow",
    };
}

pub(crate) fn get_day_period_style_string(value: DayPeriodStyle) -> &'static str {
    return match value {
        DayPeriodStyle::Narrow => "narrow",
        DayPeriodStyle::Short => "short",
        DayPeriodStyle::Long => "long",
    };
}

pub(crate) fn get_hour_cycle_string(value: HourCycle) -> &'static str {
    return match value {
        HourCycle::H11 => "h11",
        HourCycle::H12 => "h12",
        HourCycle::H23 => "h23",
        HourCycle::H24 => "h24",
    };
}

pub(crate) fn get_list_format_options_key(options: &ListFormatOptions) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(value) = options.locale_matcher {
        parts.push(format!(
            "\"localeMatcher\":\"{}\"",
            get_locale_matcher_string(value)
        ));
    }
    if let Some(value) = options.type_ {
        parts.push(format!("\"type\":\"{}\"", get_list_type_string(value)));
    }
    if let Some(value) = options.style {
        parts.push(format!("\"style\":\"{}\"", get_list_style_string(value)));
    }
    return format!("{{{}}}", parts.join(","));
}

pub(crate) fn get_list_style_string(value: ListStyle) -> &'static str {
    return match value {
        ListStyle::Long => "long",
        ListStyle::Short => "short",
        ListStyle::Narrow => "narrow",
    };
}

pub(crate) fn get_list_type_string(value: ListType) -> &'static str {
    return match value {
        ListType::Conjunction => "conjunction",
        ListType::Disjunction => "disjunction",
        ListType::Unit => "unit",
    };
}

pub(crate) fn get_locale_matcher_string(value: LocaleMatcher) -> &'static str {
    return match value {
        LocaleMatcher::Lookup => "lookup",
        LocaleMatcher::BestFit => "best fit",
    };
}

pub(crate) fn get_month_style_string(value: MonthStyle) -> &'static str {
    return match value {
        MonthStyle::Numeric => "numeric",
        MonthStyle::TwoDigit => "2-digit",
        MonthStyle::Long => "long",
        MonthStyle::Short => "short",
        MonthStyle::Narrow => "narrow",
    };
}

pub(crate) fn get_number_format_options_key(options: &NumberFormatOptions) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(value) = options.locale_matcher {
        parts.push(format!(
            "\"localeMatcher\":\"{}\"",
            get_locale_matcher_string(value)
        ));
    }
    if let Some(value) = options.style {
        parts.push(format!("\"style\":\"{}\"", get_number_style_string(value)));
    }
    if let Some(value) = &options.currency {
        parts.push(format!("\"currency\":\"{}\"", escape_json(value)));
    }
    if let Some(value) = options.currency_display {
        parts.push(format!(
            "\"currencyDisplay\":\"{}\"",
            get_currency_display_string(value)
        ));
    }
    if let Some(value) = options.currency_sign {
        parts.push(format!(
            "\"currencySign\":\"{}\"",
            get_currency_sign_string(value)
        ));
    }
    if let Some(value) = &options.unit {
        parts.push(format!("\"unit\":\"{}\"", escape_json(value)));
    }
    if let Some(value) = options.unit_display {
        parts.push(format!(
            "\"unitDisplay\":\"{}\"",
            get_unit_display_string(value)
        ));
    }
    if let Some(value) = options.notation {
        parts.push(format!(
            "\"notation\":\"{}\"",
            get_number_notation_string(value)
        ));
    }
    if let Some(value) = options.compact_display {
        parts.push(format!(
            "\"compactDisplay\":\"{}\"",
            get_compact_display_string(value)
        ));
    }
    if let Some(value) = options.use_grouping {
        parts.push(format!("\"useGrouping\":{}", use_grouping_json(value)));
    }
    if let Some(value) = options.sign_display {
        parts.push(format!(
            "\"signDisplay\":\"{}\"",
            get_sign_display_string(value)
        ));
    }
    if let Some(value) = options.minimum_integer_digits {
        parts.push(format!("\"minimumIntegerDigits\":{}", json_number(value)));
    }
    if let Some(value) = options.minimum_fraction_digits {
        parts.push(format!("\"minimumFractionDigits\":{}", json_number(value)));
    }
    if let Some(value) = options.maximum_fraction_digits {
        parts.push(format!("\"maximumFractionDigits\":{}", json_number(value)));
    }
    if let Some(value) = options.minimum_significant_digits {
        parts.push(format!(
            "\"minimumSignificantDigits\":{}",
            json_number(value)
        ));
    }
    if let Some(value) = options.maximum_significant_digits {
        parts.push(format!(
            "\"maximumSignificantDigits\":{}",
            json_number(value)
        ));
    }
    return format!("{{{}}}", parts.join(","));
}

pub(crate) fn get_number_notation_string(value: NumberNotation) -> &'static str {
    return match value {
        NumberNotation::Standard => "standard",
        NumberNotation::Scientific => "scientific",
        NumberNotation::Engineering => "engineering",
        NumberNotation::Compact => "compact",
    };
}

pub(crate) fn get_number_style_string(value: NumberStyle) -> &'static str {
    return match value {
        NumberStyle::Decimal => "decimal",
        NumberStyle::Percent => "percent",
        NumberStyle::Currency => "currency",
        NumberStyle::Unit => "unit",
    };
}

pub(crate) fn get_options_key(options: &IntlOptionsKey) -> String {
    return match options {
        IntlOptionsKey::Collator(value) => get_collator_options_key(value.options),
        IntlOptionsKey::DateTimeFormat(value) => get_date_time_format_options_key(value.options),
        IntlOptionsKey::List(value) => get_list_format_options_key(value.options),
        IntlOptionsKey::Number(value) => get_number_format_options_key(value.options),
        IntlOptionsKey::Plural(value) => get_plural_rules_options_key(value.options),
        IntlOptionsKey::RelativeTime(value) => get_relative_time_format_options_key(value.options),
    };
}

pub(crate) fn get_plural_rules_options_key(options: &PluralRulesOptions) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(value) = options.locale_matcher {
        parts.push(format!(
            "\"localeMatcher\":\"{}\"",
            get_locale_matcher_string(value)
        ));
    }
    if let Some(value) = options.type_ {
        parts.push(format!("\"type\":\"{}\"", get_plural_type_string(value)));
    }
    if let Some(value) = options.minimum_integer_digits {
        parts.push(format!("\"minimumIntegerDigits\":{}", json_number(value)));
    }
    if let Some(value) = options.minimum_fraction_digits {
        parts.push(format!("\"minimumFractionDigits\":{}", json_number(value)));
    }
    if let Some(value) = options.maximum_fraction_digits {
        parts.push(format!("\"maximumFractionDigits\":{}", json_number(value)));
    }
    if let Some(value) = options.minimum_significant_digits {
        parts.push(format!(
            "\"minimumSignificantDigits\":{}",
            json_number(value)
        ));
    }
    if let Some(value) = options.maximum_significant_digits {
        parts.push(format!(
            "\"maximumSignificantDigits\":{}",
            json_number(value)
        ));
    }
    return format!("{{{}}}", parts.join(","));
}

pub(crate) fn get_plural_type_string(value: PluralType) -> &'static str {
    return match value {
        PluralType::Cardinal => "cardinal",
        PluralType::Ordinal => "ordinal",
    };
}

pub(crate) fn get_relative_time_format_options_key(options: &RelativeTimeFormatOptions) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(value) = options.locale_matcher {
        parts.push(format!(
            "\"localeMatcher\":\"{}\"",
            get_locale_matcher_string(value)
        ));
    }
    if let Some(value) = options.numeric {
        parts.push(format!(
            "\"numeric\":\"{}\"",
            get_relative_time_numeric_string(value)
        ));
    }
    if let Some(value) = options.style {
        parts.push(format!(
            "\"style\":\"{}\"",
            get_relative_time_style_string(value)
        ));
    }
    return format!("{{{}}}", parts.join(","));
}

pub(crate) fn get_relative_time_numeric_string(value: RelativeTimeNumeric) -> &'static str {
    return match value {
        RelativeTimeNumeric::Always => "always",
        RelativeTimeNumeric::Auto => "auto",
    };
}

pub(crate) fn get_relative_time_style_string(value: RelativeTimeStyle) -> &'static str {
    return match value {
        RelativeTimeStyle::Long => "long",
        RelativeTimeStyle::Short => "short",
        RelativeTimeStyle::Narrow => "narrow",
    };
}

pub(crate) fn get_sign_display_string(value: SignDisplay) -> &'static str {
    return match value {
        SignDisplay::Auto => "auto",
        SignDisplay::Never => "never",
        SignDisplay::Always => "always",
        SignDisplay::ExceptZero => "exceptZero",
    };
}

pub(crate) fn get_time_field_style_string(value: TimeFieldStyle) -> &'static str {
    return match value {
        TimeFieldStyle::Numeric => "numeric",
        TimeFieldStyle::TwoDigit => "2-digit",
    };
}

pub(crate) fn get_time_zone_name_style_string(value: TimeZoneNameStyle) -> &'static str {
    return match value {
        TimeZoneNameStyle::Short => "short",
        TimeZoneNameStyle::Long => "long",
        TimeZoneNameStyle::ShortOffset => "shortOffset",
        TimeZoneNameStyle::LongOffset => "longOffset",
        TimeZoneNameStyle::ShortGeneric => "shortGeneric",
        TimeZoneNameStyle::LongGeneric => "longGeneric",
    };
}

pub(crate) fn get_unit_display_string(value: UnitDisplay) -> &'static str {
    return match value {
        UnitDisplay::Short => "short",
        UnitDisplay::Long => "long",
        UnitDisplay::Narrow => "narrow",
    };
}

// flight-lint: allow(f64) D1: option numbers use the canonical JS spelling; JSON.stringify projects non-finite numbers to null
fn json_number(value: f64) -> String {
    if !value.is_finite() {
        return "null".to_string();
    }
    return flight_entity::unknown_to_js_string(&Some(std::sync::Arc::new(value)));
}

pub(crate) fn overlay_number_format_options(
    base: &mut NumberFormatOptions,
    options: Option<&NumberFormatOptions>,
) {
    let Some(values) = options else {
        return;
    };
    if values.locale_matcher.is_some() {
        base.locale_matcher = values.locale_matcher.clone();
    }
    if values.style.is_some() {
        base.style = values.style.clone();
    }
    if values.currency.is_some() {
        base.currency = values.currency.clone();
    }
    if values.currency_display.is_some() {
        base.currency_display = values.currency_display.clone();
    }
    if values.currency_sign.is_some() {
        base.currency_sign = values.currency_sign.clone();
    }
    if values.unit.is_some() {
        base.unit = values.unit.clone();
    }
    if values.unit_display.is_some() {
        base.unit_display = values.unit_display.clone();
    }
    if values.notation.is_some() {
        base.notation = values.notation.clone();
    }
    if values.compact_display.is_some() {
        base.compact_display = values.compact_display.clone();
    }
    if values.use_grouping.is_some() {
        base.use_grouping = values.use_grouping.clone();
    }
    if values.sign_display.is_some() {
        base.sign_display = values.sign_display.clone();
    }
    if values.minimum_integer_digits.is_some() {
        base.minimum_integer_digits = values.minimum_integer_digits.clone();
    }
    if values.minimum_fraction_digits.is_some() {
        base.minimum_fraction_digits = values.minimum_fraction_digits.clone();
    }
    if values.maximum_fraction_digits.is_some() {
        base.maximum_fraction_digits = values.maximum_fraction_digits.clone();
    }
    if values.minimum_significant_digits.is_some() {
        base.minimum_significant_digits = values.minimum_significant_digits.clone();
    }
    if values.maximum_significant_digits.is_some() {
        base.maximum_significant_digits = values.maximum_significant_digits.clone();
    }
}

pub(crate) fn overlay_plural_rules_options(
    base: &mut PluralRulesOptions,
    options: Option<&PluralRulesOptions>,
) {
    let Some(values) = options else {
        return;
    };
    if values.locale_matcher.is_some() {
        base.locale_matcher = values.locale_matcher.clone();
    }
    if values.type_.is_some() {
        base.type_ = values.type_.clone();
    }
    if values.minimum_integer_digits.is_some() {
        base.minimum_integer_digits = values.minimum_integer_digits.clone();
    }
    if values.minimum_fraction_digits.is_some() {
        base.minimum_fraction_digits = values.minimum_fraction_digits.clone();
    }
    if values.maximum_fraction_digits.is_some() {
        base.maximum_fraction_digits = values.maximum_fraction_digits.clone();
    }
    if values.minimum_significant_digits.is_some() {
        base.minimum_significant_digits = values.minimum_significant_digits.clone();
    }
    if values.maximum_significant_digits.is_some() {
        base.maximum_significant_digits = values.maximum_significant_digits.clone();
    }
}

fn use_grouping_json(value: UseGrouping) -> String {
    return match value {
        UseGrouping::Bool(flag) => flag.to_string(),
        UseGrouping::Always => "\"always\"".to_string(),
        UseGrouping::Auto => "\"auto\"".to_string(),
        UseGrouping::Min2 => "\"min2\"".to_string(),
    };
}
