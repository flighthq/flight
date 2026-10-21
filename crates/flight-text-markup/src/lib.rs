//! `htmlText`-subset markup: the open tag registry and standard dialect, hex and named colors,
//! caller-owned class styles, and opt-in parse guards. The parser/formatter (`textMarkup.ts`) waits
//! for the canonical `createRichTextContent`/`initializeRichTextContent` lower API.

mod enable_text_markup_guards;
mod markup_class_styles;
mod markup_named_colors;
mod markup_tag_registry;
mod text_markup;
mod text_markup_guards;
mod types;

pub mod contract;

pub use contract::MARKUP_HEX_COLOR_RESOLVER;
pub use contract::create_markup_tag_registry;
pub use contract::create_text_markup_guard_state;
pub use contract::disable_text_markup_guards;
pub use contract::enable_text_markup_guards;
pub use contract::explain_text_markup;
pub use contract::format_text_markup;
pub use contract::parse_text_markup;
pub use contract::register_markup_class_styles;
pub use contract::register_markup_named_colors;
pub use contract::register_markup_tag;
pub use contract::register_standard_markup_tags;
pub use contract::resolve_markup_hex_color;

pub use contract::get_text_markup_issue_kind_string;
pub use contract::parse_text_markup_issue_kind;
pub use contract::report_text_markup_issue;
pub use contract::set_text_markup_guard;

pub use contract::MarkupClassResolver;
pub use contract::MarkupColorResolver;
pub use contract::MarkupResolverSeams;
pub use contract::MarkupTagEffect;
pub use contract::MarkupTagHandler;
pub use contract::MarkupTagRegistry;
pub use contract::MarkupTagResult;
pub use contract::TextMarkupClock;
pub use contract::TextMarkupExplanation;
pub use contract::TextMarkupGuard;
pub use contract::TextMarkupGuardState;
pub use contract::TextMarkupIssue;
pub use contract::TextMarkupIssueKind;
