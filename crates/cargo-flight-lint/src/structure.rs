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
    Preamble { start_line: usize },
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

    if let Some(r) = sort_group(&free_fns, &lines, "\n\n") {
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
            if let Some(r) = sort_group(&refs, &lines, sep) {
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

fn sort_group(
    items: &[&NamedRange],
    lines: &[&str],
    separator: &str,
) -> Option<(usize, usize, String)> {
    if items.len() <= 1 {
        return None;
    }

    let is_sorted = items
        .windows(2)
        .all(|w| sort_key(&w[0].name) <= sort_key(&w[1].name));
    if is_sorted {
        return None;
    }

    let group_start = items.first().unwrap().start_line;
    let group_end = items.last().unwrap().end_line;

    let mut blocks: Vec<(&str, String)> = items
        .iter()
        .map(|item| {
            let text = lines[item.start_line - 1..item.end_line].join("\n");
            (item.name.as_str(), text)
        })
        .collect();

    blocks.sort_by_key(|(name, _)| sort_key(name));

    let new_text = blocks
        .iter()
        .map(|(_, text)| text.as_str())
        .collect::<Vec<&str>>()
        .join(separator);

    return Some((group_start, group_end, new_text));
}
