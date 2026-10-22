use std::path::Path;

use syn::spanned::Spanned;
use syn::{ImplItem, Item};

use crate::model::Violation;

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

#[derive(Debug)]
pub struct NamedRange {
    pub name: String,
    pub is_pub: bool,
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug)]
pub enum FileItem {
    Preamble {
        start_line: usize,
    },
    Struct(NamedRange),
    FreeFn(NamedRange),
    Impl {
        start_line: usize,
        methods: Vec<NamedRange>,
    },
}

impl FileItem {
    fn start_line(&self) -> usize {
        match self {
            FileItem::Preamble { start_line, .. } => *start_line,
            FileItem::Struct(r) => r.start_line,
            FileItem::FreeFn(r) => r.start_line,
            FileItem::Impl { start_line, .. } => *start_line,
        }
    }

    fn kind_order(&self) -> u8 {
        match self {
            FileItem::Preamble { .. } => 0,
            FileItem::Struct(_) => 1,
            FileItem::FreeFn(_) => 2,
            FileItem::Impl { .. } => 3,
        }
    }

    fn kind_name(&self) -> &'static str {
        match self {
            FileItem::Preamble { .. } => "use/mod",
            FileItem::Struct(_) => "struct",
            FileItem::FreeFn(_) => "fn",
            FileItem::Impl { .. } => "impl",
        }
    }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

pub fn parse_items(source: &str) -> Result<Vec<FileItem>, String> {
    let file = syn::parse_file(source).map_err(|e| format!("{}", e))?;
    let mut items = Vec::new();

    for item in &file.items {
        match item {
            Item::Use(u) => {
                items.push(FileItem::Preamble {
                    start_line: u.use_token.span.start().line,
                });
            }
            Item::Mod(m) => {
                items.push(FileItem::Preamble {
                    start_line: m.mod_token.span.start().line,
                });
            }
            Item::Struct(s) => {
                let start = first_attr_line(&s.attrs).unwrap_or(s.struct_token.span.start().line);
                let end = struct_end_line(s);
                items.push(FileItem::Struct(NamedRange {
                    name: s.ident.to_string(),
                    is_pub: is_pub(&s.vis),
                    start_line: start,
                    end_line: end,
                }));
            }
            Item::Fn(f) => {
                let start = first_attr_line(&f.attrs).unwrap_or(f.sig.fn_token.span.start().line);
                let end = f.block.brace_token.span.close().end().line;
                items.push(FileItem::FreeFn(NamedRange {
                    name: f.sig.ident.to_string(),
                    is_pub: is_pub(&f.vis),
                    start_line: start,
                    end_line: end,
                }));
            }
            Item::Impl(i) => {
                let start = i.impl_token.span.start().line;

                let mut methods = Vec::new();
                for impl_item in &i.items {
                    if let ImplItem::Fn(m) = impl_item {
                        let m_start =
                            first_attr_line(&m.attrs).unwrap_or(m.sig.fn_token.span.start().line);
                        let m_end = m.block.brace_token.span.close().end().line;
                        methods.push(NamedRange {
                            name: m.sig.ident.to_string(),
                            is_pub: is_pub(&m.vis),
                            start_line: m_start,
                            end_line: m_end,
                        });
                    }
                }

                items.push(FileItem::Impl {
                    start_line: start,
                    methods,
                });
            }
            // The approved `impl_entity!(T)` declaration occupies the impl section: it expands to
            // an `impl Entity for T` block. Other macro invocations stay outside the structure
            // rules, as before.
            Item::Macro(m) if is_impl_entity_macro(&m.mac) => {
                items.push(FileItem::Impl {
                    start_line: m.span().start().line,
                    methods: Vec::new(),
                });
            }
            _ => {}
        }
    }

    return Ok(items);
}

fn first_attr_line(attrs: &[syn::Attribute]) -> Option<usize> {
    return attrs.first().map(|a| a.span().start().line);
}

fn struct_end_line(s: &syn::ItemStruct) -> usize {
    if let Some(semi) = &s.semi_token {
        return semi.span.end().line;
    }
    return match &s.fields {
        syn::Fields::Named(f) => f.brace_token.span.close().end().line,
        syn::Fields::Unnamed(f) => f.paren_token.span.close().end().line,
        syn::Fields::Unit => s.ident.span().end().line,
    };
}

/// Only plain `pub` counts as contract surface; `pub(crate)` is internal.
pub fn is_pub(vis: &syn::Visibility) -> bool {
    return matches!(vis, syn::Visibility::Public(_));
}

/// True for the approved entity-runtime declaration, `impl_entity!(T)` or the qualified
/// `flight_entity::impl_entity!(T)`. Matching is by the macro's last path segment, which is the
/// exact approved invocation form rather than general macro expansion.
pub fn is_impl_entity_macro(mac: &syn::Macro) -> bool {
    return mac
        .path
        .segments
        .last()
        .map(|segment| segment.ident == "impl_entity")
        .unwrap_or(false);
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

pub fn check_file(path: &Path, source: &str) -> Vec<Violation> {
    let items = match parse_items(source) {
        Ok(items) => items,
        Err(e) => {
            return vec![Violation::new(path, 0, "parse-error", e)];
        }
    };

    let mut violations = Vec::new();

    // Rule: fn-order — free functions must be alphabetically ordered
    let free_fns: Vec<&NamedRange> = items
        .iter()
        .filter_map(|i| {
            if let FileItem::FreeFn(r) = i {
                Some(r)
            } else {
                None
            }
        })
        .collect();
    check_ordering(&free_fns, "fn-order", path, &mut violations);

    // Rule: impl-order — methods within each impl must be alphabetically ordered
    for item in &items {
        if let FileItem::Impl { methods, .. } = item {
            let refs: Vec<&NamedRange> = methods.iter().collect();
            check_ordering(&refs, "impl-order", path, &mut violations);
        }
    }

    // Rule: file-structure — use/mod → struct → fn → impl
    let mut max_kind: u8 = 0;
    for item in &items {
        let kind = item.kind_order();
        if kind < max_kind {
            violations.push(Violation::new(
                path,
                item.start_line(),
                "file-structure",
                format!("{} appears after a later section", item.kind_name()),
            ));
        }
        max_kind = max_kind.max(kind);
    }

    return violations;
}

fn check_ordering(items: &[&NamedRange], rule: &str, path: &Path, out: &mut Vec<Violation>) {
    for pair in items.windows(2) {
        if sort_key(&pair[0].name) > sort_key(&pair[1].name) {
            out.push(Violation::new(
                path,
                pair[1].start_line,
                rule,
                format!("`{}` should come before `{}`", pair[1].name, pair[0].name),
            ));
        }
    }
}

fn owned_sort_key(name: &str) -> (u8, String) {
    let (rank, name) = sort_key(name);
    return (rank, name.to_string());
}

fn sort_key(name: &str) -> (u8, &str) {
    if name == "new" || name.starts_with("create_") || name.starts_with("initialize_") {
        return (0, name);
    }
    return (1, name);
}

// ---------------------------------------------------------------------------
// Fixing
// ---------------------------------------------------------------------------

pub fn fix_file(source: &str) -> Option<String> {
    let restructured = fix_structure(source)?;
    return fix_ordering(&restructured);
}

fn fix_ordering(source: &str) -> Option<String> {
    let items = parse_items(source).ok()?;
    let lines: Vec<&str> = source.lines().collect();
    let trailing_newline = source.ends_with('\n');

    // Collect replacements (start_line, end_line, new_text). 1-indexed lines.
    let mut replacements: Vec<(usize, usize, String)> = Vec::new();

    // Fix free function ordering
    let free_fns: Vec<&NamedRange> = items
        .iter()
        .filter_map(|i| {
            if let FileItem::FreeFn(r) = i {
                Some(r)
            } else {
                None
            }
        })
        .collect();

    if let Some(r) = sort_group(&free_fns, &lines, "\n\n", owned_sort_key) {
        replacements.push(r);
    }

    // Fix impl method ordering
    for item in &items {
        if let FileItem::Impl { methods, .. } = item {
            let refs: Vec<&NamedRange> = methods.iter().collect();
            // Detect spacing convention: blank line between methods or not
            let sep = if methods.len() >= 2 && methods[0].end_line + 1 < methods[1].start_line {
                "\n\n"
            } else {
                "\n"
            };
            if let Some(r) = sort_group(&refs, &lines, sep, owned_sort_key) {
                replacements.push(r);
            }
        }
    }

    if replacements.is_empty() {
        return Some(source.to_string());
    }

    // Apply from bottom to top so line numbers stay valid
    replacements.sort_by_key(|a| std::cmp::Reverse(a.0));

    let mut result_lines: Vec<String> = lines.iter().map(|s| s.to_string()).collect();

    for (start, end, new_text) in &replacements {
        let new: Vec<String> = new_text.lines().map(|s| s.to_string()).collect();
        result_lines.splice((start - 1)..*end, new);
    }

    let mut result = result_lines.join("\n");
    if trailing_newline && !result.ends_with('\n') {
        result.push('\n');
    }

    return Some(result);
}

/// Reorders top-level sections into use/mod, struct, fn, impl (`file-structure`). Each item moves
/// with its attached comments, docs and attributes. Items the rule does not track (enums, consts,
/// type aliases, traits, other macros) travel with the item before them, so their position relative
/// to their neighbors is kept. The sort is stable: order within a section is untouched (`fn-order` and
/// `impl-order` handle that). Returns the source unchanged when it is already in order, and also when
/// it cannot be reordered safely: an unattached comment between items, or two items on one line.
pub fn fix_structure(source: &str) -> Option<String> {
    let file = syn::parse_file(source).ok()?;
    let lines: Vec<&str> = source.lines().collect();
    let trailing_newline = source.ends_with('\n');

    // (start_line, end_line, section) per top-level item; 1-indexed, inclusive.
    let mut blocks: Vec<(usize, usize, Option<u8>)> = Vec::new();
    for item in &file.items {
        let span = item.span();
        let start = attached_start(&lines, span.start().line);
        let end = span.end().line;
        let section = match item {
            Item::Use(_) | Item::Mod(_) => Some(0),
            Item::Struct(_) => Some(1),
            Item::Fn(_) => Some(2),
            Item::Impl(_) => Some(3),
            Item::Macro(m) if is_impl_entity_macro(&m.mac) => Some(3),
            _ => None,
        };
        blocks.push((start, end, section));
    }
    if blocks.len() <= 1 {
        return Some(source.to_string());
    }

    for i in 1..blocks.len() {
        let (prev_end, start) = (blocks[i - 1].1, blocks[i].0);
        if start <= prev_end {
            return Some(source.to_string());
        }
        if lines[prev_end..start - 1]
            .iter()
            .any(|line| !line.trim().is_empty())
        {
            return Some(source.to_string());
        }
    }

    let mut current = 0u8;
    let sections: Vec<u8> = blocks
        .iter()
        .map(|(_, _, section)| {
            if let Some(s) = section {
                current = *s;
            }
            return current;
        })
        .collect();
    if sections.windows(2).all(|w| w[0] <= w[1]) {
        return Some(source.to_string());
    }

    let mut order: Vec<usize> = (0..blocks.len()).collect();
    order.sort_by_key(|&i| sections[i]);

    let mut text = String::new();
    for (position, &i) in order.iter().enumerate() {
        if position > 0 {
            let prev = order[position - 1];
            // Keep a run of `use` / `mod` lines tight when it was tight before; otherwise one blank line.
            let tight = sections[prev] == 0
                && sections[i] == 0
                && i == prev + 1
                && blocks[i].0 == blocks[prev].1 + 1;
            text.push_str(if tight { "\n" } else { "\n\n" });
        }
        text.push_str(&lines[blocks[i].0 - 1..blocks[i].1].join("\n"));
    }

    let first = blocks[0].0;
    let last = blocks[blocks.len() - 1].1;
    let mut result = String::new();
    for line in &lines[..first - 1] {
        result.push_str(line);
        result.push('\n');
    }
    result.push_str(&text);
    for line in &lines[last..] {
        result.push('\n');
        result.push_str(line);
    }
    if trailing_newline && !result.ends_with('\n') {
        result.push('\n');
    }
    return Some(result);
}

/// The first line (1-indexed) of the comment block attached to an item starting at `start_line`:
/// contiguous plain `//` comment lines directly above it, with no blank line in between. Inner docs
/// (`//!`) belong to the enclosing module and are never attached.
pub fn attached_start(lines: &[&str], start_line: usize) -> usize {
    let mut start = start_line;
    while start > 1 {
        let prev = lines[start - 2].trim_start();
        if prev.starts_with("//") && !prev.starts_with("//!") {
            start -= 1;
        } else {
            break;
        }
    }
    return start;
}

/// Sorts a run of named items by `key`, moving each item together with its attached comment block.
/// Returns the replacement `(start_line, end_line, text)`, or `None` when already sorted or when an
/// unattached comment sits between two items (it has no owner to move with).
pub fn sort_group<K: Ord>(
    items: &[&NamedRange],
    lines: &[&str],
    separator: &str,
    key: impl Fn(&str) -> K,
) -> Option<(usize, usize, String)> {
    if items.len() <= 1 {
        return None;
    }

    let is_sorted = items.windows(2).all(|w| key(&w[0].name) <= key(&w[1].name));
    if is_sorted {
        return None;
    }

    // Each block starts at its attached comment block: plain `//` lines directly above the item
    // (an allow marker, a reason) move with it, exactly like its doc comments and attributes.
    let starts: Vec<usize> = items
        .iter()
        .map(|item| attached_start(lines, item.start_line))
        .collect();

    // Anything else between two items (a section divider separated by a blank line) has no owner to
    // move with; leave the group unsorted rather than dropping it. `check` still reports the order.
    for i in 1..items.len() {
        let gap = &lines[items[i - 1].end_line..starts[i] - 1];
        if gap.iter().any(|line| !line.trim().is_empty()) {
            return None;
        }
    }

    let group_start = starts[0];
    let group_end = items.last().unwrap().end_line;

    let mut blocks: Vec<(&str, String)> = items
        .iter()
        .zip(&starts)
        .map(|(item, start)| {
            let text = lines[start - 1..item.end_line].join("\n");
            (item.name.as_str(), text)
        })
        .collect();

    blocks.sort_by_key(|(name, _)| key(name));

    let new_text = blocks
        .iter()
        .map(|(_, text)| text.as_str())
        .collect::<Vec<&str>>()
        .join(separator);

    return Some((group_start, group_end, new_text));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules(src: &str) -> Vec<String> {
        return check_file(Path::new("a.rs"), src)
            .into_iter()
            .map(|v| v.rule)
            .collect();
    }

    #[test]
    fn impl_entity_macro_occupies_the_impl_section() {
        let ok = "pub fn create_v() -> V { return V; }\nimpl_entity!(V);";
        assert!(rules(ok).is_empty(), "{:?}", rules(ok));
        let qualified = "pub fn create_v() -> V { return V; }\nflight_entity::impl_entity!(V);";
        assert!(rules(qualified).is_empty(), "{:?}", rules(qualified));
    }

    #[test]
    fn impl_entity_macro_before_a_struct_is_a_structure_violation() {
        let bad = "impl_entity!(V);\npub struct V;";
        assert_eq!(rules(bad), vec!["file-structure"]);
    }

    #[test]
    fn unrelated_macros_keep_the_existing_behavior() {
        let src = "some_other_macro!();\npub struct V;\npub fn create_v() -> V { return V; }";
        assert!(rules(src).is_empty(), "{:?}", rules(src));
    }

    /// The plain comment block, docs and attributes directly above `pub fn <name>` in `src`
    /// (the lines between the previous blank or code line and the fn line).
    fn header_of(src: &str, name: &str) -> Vec<String> {
        let lines: Vec<&str> = src.lines().collect();
        let at = lines
            .iter()
            .position(|l| {
                l.trim_start().starts_with(&format!("pub fn {}(", name))
                    || l.trim_start().starts_with(&format!("fn {}(", name))
            })
            .unwrap_or_else(|| panic!("fn {} missing", name));
        let mut start = at;
        while start > 0 {
            let prev = lines[start - 1].trim_start();
            if prev.starts_with("//") || prev.starts_with("#[") {
                start -= 1;
            } else {
                break;
            }
        }
        return lines[start..at]
            .iter()
            .map(|l| l.trim().to_string())
            .collect();
    }

    const MOVED_MARKERS: &str = "pub fn create_v() -> u32 {
    return 0;
}

// flight-lint: allow(f64) c needs double precision
/// Docs for c.
#[inline]
pub fn c(x: f64) -> f64 {
    return x;
}

// flight-lint: allow(conform-extra) a is Rust-only
pub fn a() {}

/// Docs for b.
// flight-lint: allow(conform-params) b keeps out-first
#[must_use]
pub fn b() -> u32 {
    return 1;
}
";

    #[test]
    fn fix_keeps_each_plain_allow_marker_with_the_same_function() {
        let fixed = fix_file(MOVED_MARKERS).unwrap();
        assert_eq!(
            header_of(&fixed, "a"),
            vec!["// flight-lint: allow(conform-extra) a is Rust-only"]
        );
        assert_eq!(
            header_of(&fixed, "b"),
            vec![
                "/// Docs for b.",
                "// flight-lint: allow(conform-params) b keeps out-first",
                "#[must_use]"
            ]
        );
        assert_eq!(
            header_of(&fixed, "c"),
            vec![
                "// flight-lint: allow(f64) c needs double precision",
                "/// Docs for c.",
                "#[inline]"
            ]
        );
        let a = fixed.find("pub fn a(").unwrap();
        let b = fixed.find("pub fn b(").unwrap();
        let c = fixed.find("pub fn c(").unwrap();
        assert!(fixed.find("pub fn create_v(").unwrap() < a && a < b && b < c);
        assert_eq!(fixed.matches("flight-lint:").count(), 3);
        assert!(rules(&fixed).iter().all(|r| r != "fn-order"));
    }

    #[test]
    fn fix_is_idempotent() {
        let once = fix_file(MOVED_MARKERS).unwrap();
        let twice = fix_file(&once).unwrap();
        assert_eq!(once, twice);
    }

    #[test]
    fn fix_never_drops_an_unattached_comment_between_functions() {
        let src = "pub fn b() {}\n\n// --- section divider ---\n\npub fn a() {}\n";
        let fixed = fix_file(src).unwrap();
        assert!(fixed.contains("// --- section divider ---"));
        assert_eq!(fixed.matches("pub fn").count(), 2);
    }

    #[test]
    fn fix_reorders_sections_and_keeps_attached_comments() {
        let src = "use std::fmt;\n\nimpl V {\n    pub fn new() -> Self {\n        return V;\n    }\n}\n\n// flight-lint: allow(f64) b keeps double\npub fn b() -> f64 {\n    return 0.0;\n}\n\n/// The value.\n#[derive(Debug)]\npub struct V;\n\npub const LIMIT: u32 = 3;\n\npub fn a() {}\n";
        assert!(rules(src).contains(&"file-structure".to_string()));
        let fixed = fix_file(src).unwrap();
        assert!(rules(&fixed).is_empty(), "{:?}\n{}", rules(&fixed), fixed);
        let at = |needle: &str| {
            fixed
                .find(needle)
                .unwrap_or_else(|| panic!("{} missing", needle))
        };
        assert!(at("use std::fmt;") < at("pub struct V;"));
        assert!(at("pub struct V;") < at("pub fn a("));
        assert!(at("pub fn a(") < at("pub fn b("));
        assert!(at("pub fn b(") < at("impl V {"));
        // The untracked const stays with the struct before it.
        assert!(
            at("pub struct V;") < at("pub const LIMIT") && at("pub const LIMIT") < at("pub fn a(")
        );
        assert_eq!(
            header_of(&fixed, "b"),
            vec!["// flight-lint: allow(f64) b keeps double"]
        );
        assert!(fixed.contains("/// The value.\n#[derive(Debug)]\npub struct V;"));
        assert_eq!(fix_file(&fixed).unwrap(), fixed);
    }

    #[test]
    fn fix_structure_leaves_files_with_unattached_comments_alone() {
        let src = "pub fn b() {}\n\n// --- divider ---\n\npub struct V;\n";
        assert_eq!(fix_structure(src).unwrap(), src);
    }

    #[test]
    fn fix_structure_keeps_the_file_header_and_inner_docs() {
        let src = "//! Crate docs.\n\npub fn a() {}\n\npub struct V;\n";
        let fixed = fix_structure(src).unwrap();
        assert!(
            fixed.starts_with("//! Crate docs.\n\npub struct V;\n\npub fn a() {}"),
            "{}",
            fixed
        );
    }

    #[test]
    fn fix_keeps_plain_markers_with_moved_impl_methods() {
        let src = "pub struct V;\n\nimpl V {\n    // flight-lint: allow(f64) z keeps double\n    pub fn z(&self) -> f64 {\n        return 0.0;\n    }\n\n    pub fn new() -> Self {\n        return V;\n    }\n}\n";
        let fixed = fix_file(src).unwrap();
        assert!(fixed.find("pub fn new(").unwrap() < fixed.find("pub fn z(").unwrap());
        assert_eq!(
            header_of(&fixed, "z"),
            vec!["// flight-lint: allow(f64) z keeps double"]
        );
        assert!(header_of(&fixed, "new").is_empty());
    }
}
