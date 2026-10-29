//! `htmlText`-subset markup: the open tag registry and standard dialect, hex and named colors,
//! caller-owned class styles, and opt-in parse guards. The parser/formatter (`textMarkup.ts`) waits
//! for the canonical `createRichTextContent`/`initializeRichTextContent` lower API.

mod enable_text_markup_guards;
mod markup_class_styles;
mod markup_named_colors;
mod markup_tag_registry;
mod normalize_markup_tag_result;
mod text_markup;
mod text_markup_guards;
mod types;

pub mod contract;

// Public lane: preserve the function-only surface exported by the pinned TS `index.ts`.
// Contract-only state, diagnostics seams, constants, and shared type aliases stay in `contract`.
pub use contract::create_markup_tag_registry;
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
