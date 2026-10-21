//! Text-markup declarations (TS `MarkupTagRegistry`, `MarkupTagHandler`, `MarkupTagEffect`,
//! `MarkupColorResolver`, `MarkupClassResolver`, `TextMarkupExplanation`).

use std::sync::Arc;

use flight_entity::{Record, Ref};
use flight_textformat::TextFormat;

/// A tag handler: maps this tag's parsed attributes and enclosing format to its contribution. Handlers
/// are pure and never see spans, ranges or surrounding text (TS `MarkupTagHandler`).
pub type MarkupTagHandler =
    Arc<dyn Fn(&Record<String>, &TextFormat) -> MarkupTagResult + Send + Sync>;

/// Resolves a `<font color>` value to a packed `0xRRGGBBAA` integer, or `None` when unrecognized
/// (TS `MarkupColorResolver`).
pub type MarkupColorResolver = Arc<dyn Fn(&str) -> Option<u32> + Send + Sync>;

/// Resolves one `<span class>` token to the format fields that class contributes, or `None`
/// (TS `MarkupClassResolver`). Class names are case-sensitive.
pub type MarkupClassResolver = Arc<dyn Fn(&str) -> Option<TextFormat> + Send + Sync>;

/// The live resolver seams a registry carries. The standard `<font>`/`<span>` handlers read the seams
/// at call time, so opting into named colors or class styles after registration affects later parses
/// without re-registering handlers (source ownership: caller-owned live state, D5).
#[derive(Default)]
pub struct MarkupResolverSeams {
    pub class_resolver: Option<MarkupClassResolver>,
    pub color_resolver: Option<MarkupColorResolver>,
}

/// The open tag-name to handler registry that gives markup its meaning (TS `MarkupTagRegistry`).
/// Names are stored lowercased and matched case-insensitively; registration is last-write-wins and a
/// replaced name keeps its original position. The registered set of names IS the supported dialect.
pub struct MarkupTagRegistry {
    pub handlers: Vec<(String, MarkupTagHandler)>,
    pub seams: Ref<MarkupResolverSeams>,
}

/// The structural contribution of a non-formatting tag (TS `MarkupTagEffect`). `format` absent and
/// `text` present is a void insertion tag; `break_before` inserts the collapsing block break.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct MarkupTagEffect {
    pub break_before: Option<bool>,
    pub format: Option<TextFormat>,
    pub text: Option<String>,
}

/// What a tag handler returns (TS `MarkupTagResult`): a bare format contribution or a structural
/// effect. TypeScript distinguishes the two structurally by the reserved keys `format`,
/// `breakBefore`, and `text`; the Rust closed union makes the choice explicit.
#[derive(Clone, Debug, PartialEq)]
pub enum MarkupTagResult {
    Effect(MarkupTagEffect),
    Format(TextFormat),
}

/// One lossy decision made by the parser (TS `TextMarkupIssueKind`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextMarkupIssueKind {
    UnknownTag,
    UnresolvedFontColor,
    UnsafeHref,
}

/// A ping from the parser's guard callback, or a pull record in an explanation
/// (TS `TextMarkupIssue`). `value` is the guarded attribute value, or `None` for an unknown tag.
pub struct TextMarkupIssue {
    pub kind: TextMarkupIssueKind,
    pub offset: usize,
    pub tag: String,
    pub value: Option<String>,
}

/// Pull-style diagnostics for a markup parse (TS `TextMarkupExplanation`). An empty issue list means
/// every token used was represented by the selected registry and all guarded values resolved safely.
pub struct TextMarkupExplanation {
    pub issues: Vec<TextMarkupIssue>,
}

/// The parser's optional diagnostic seam (TS `TextMarkupGuard`).
pub type TextMarkupGuard = Arc<dyn Fn(&TextMarkupIssue) + Send + Sync>;

/// Caller-owned guard slot (D5; source module-global `_guard`).
#[derive(Default)]
pub struct TextMarkupGuardState {
    pub guard: Option<TextMarkupGuard>,
}

// flight-lint: allow(f64) D1: guard log timestamps are millisecond JS numbers
/// Caller-supplied time source for guard logging (D5; the SDK never samples a clock).
pub type TextMarkupClock = Arc<dyn Fn() -> f64 + Send + Sync>;

/// Creates the caller-owned guard slot (Rust initializer for the D5 explicit state).
// flight-lint: allow(conform-extra) D5 Rust constructor for the caller-owned guard state
pub fn create_text_markup_guard_state() -> TextMarkupGuardState {
    return TextMarkupGuardState { guard: None };
}

// flight-lint: allow(conform-extra) D9 string table for the closed TextMarkupIssueKind union
pub fn get_text_markup_issue_kind_string(value: TextMarkupIssueKind) -> &'static str {
    return match value {
        TextMarkupIssueKind::UnknownTag => "unknown-tag",
        TextMarkupIssueKind::UnresolvedFontColor => "unresolved-font-color",
        TextMarkupIssueKind::UnsafeHref => "unsafe-href",
    };
}

// flight-lint: allow(conform-extra) D9 parser for the closed TextMarkupIssueKind union
pub fn parse_text_markup_issue_kind(value: &str) -> Option<TextMarkupIssueKind> {
    return match value {
        "unknown-tag" => Some(TextMarkupIssueKind::UnknownTag),
        "unresolved-font-color" => Some(TextMarkupIssueKind::UnresolvedFontColor),
        "unsafe-href" => Some(TextMarkupIssueKind::UnsafeHref),
        _ => None,
    };
}
