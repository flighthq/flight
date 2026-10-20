use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;

use syn::spanned::Spanned;
use syn::{ImplItem, Item};

fn main() {
    let raw_args: Vec<String> = env::args().collect();

    // When invoked as `cargo flight-lint`, cargo passes "flight-lint" as argv[1].
    let args: &[String] = if raw_args.get(1).map(|s| s.as_str()) == Some("flight-lint") {
        &raw_args[2..]
    } else {
        &raw_args[1..]
    };

    let command = args.first().map(|s| s.as_str()).unwrap_or("check");

    match command {
        "check" => {
            let files = discover_files();
            let mut violations = Vec::new();
            for file in &files {
                match fs::read_to_string(file) {
                    Ok(source) => violations.extend(check_file(file, &source)),
                    Err(e) => eprintln!("warning: {}: {}", file.display(), e),
                }
            }
            violations.extend(check_all_tests(&files));
            for v in &violations {
                eprintln!(
                    "{}:{}: [{}] {}",
                    v.file.display(),
                    v.line,
                    v.rule,
                    v.message
                );
            }
            if violations.is_empty() {
                println!("All checks passed.");
            } else {
                eprintln!(
                    "\n{} violation(s). Run `cargo flight-lint fix` to auto-fix.",
                    violations.len()
                );
                process::exit(1);
            }
        }
        "fix" => {
            let files = discover_files();
            let mut count = 0;
            for file in &files {
                match fs::read_to_string(file) {
                    Ok(source) => {
                        if let Some(fixed) = fix_file(&source)
                            && fixed != source
                        {
                            fs::write(file, &fixed).expect("write failed");
                            println!("Fixed: {}", file.display());
                            count += 1;
                        }
                    }
                    Err(e) => eprintln!("warning: {}: {}", file.display(), e),
                }
            }
            if count == 0 {
                println!("Nothing to fix.");
            } else {
                println!("Fixed {} file(s).", count);
            }
        }
        "conform" => {
            let ts_dir = match args.get(1) {
                Some(s) => PathBuf::from(s),
                None => {
                    eprintln!("Usage: cargo flight-lint conform <ts-src-dir>");
                    process::exit(1);
                }
            };

            let files = discover_files();
            let mut mismatches = 0u32;

            for src_path in &files {
                let stem = match src_path.file_stem().and_then(|s| s.to_str()) {
                    Some(s) => s,
                    None => continue,
                };
                if stem == "lib" || stem == "mod" {
                    continue;
                }

                let ts_path = ts_dir.join(format!("{}.ts", stem));
                let ts_path = if ts_path.exists() {
                    ts_path
                } else if let Some(p) = find_ts_file_by_snake(&ts_dir, stem) {
                    p
                } else {
                    continue;
                };

                let rs_source = match fs::read_to_string(src_path) {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                let ts_source = match fs::read_to_string(&ts_path) {
                    Ok(s) => s,
                    Err(_) => continue,
                };

                let rs_items = match parse_items(&rs_source) {
                    Ok(items) => items,
                    Err(_) => continue,
                };

                let rs_fn_names: Vec<String> = rs_items
                    .iter()
                    .filter_map(|i| {
                        if let FileItem::FreeFn(r) = i {
                            Some(r.name.clone())
                        } else {
                            None
                        }
                    })
                    .collect();

                let ts_fn_names = extract_ts_exports(&ts_source);

                for ts_name in &ts_fn_names {
                    let rs_name = camel_to_snake(ts_name);
                    if !rs_fn_names.iter().any(|r| *r == rs_name) {
                        eprintln!(
                            "{}:  missing `{}` (TS: `{}`)",
                            src_path.display(),
                            rs_name,
                            ts_name
                        );
                        mismatches += 1;
                    }
                }

                for rs_name in &rs_fn_names {
                    let found = ts_fn_names
                        .iter()
                        .any(|t| camel_to_snake(t) == *rs_name);
                    if !found {
                        eprintln!(
                            "{}:  extra `{}` (not in TS)",
                            src_path.display(),
                            rs_name
                        );
                        mismatches += 1;
                    }
                }
            }

            if mismatches == 0 {
                println!("All Rust signatures conform to TypeScript.");
            } else {
                eprintln!("\n{} mismatch(es).", mismatches);
                process::exit(1);
            }
        }
        _ => {
            eprintln!("Usage: cargo flight-lint [check|fix|conform]");
            process::exit(1);
        }
    }
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

fn discover_files() -> Vec<PathBuf> {
    let crates_dir = PathBuf::from("crates");
    if !crates_dir.exists() {
        eprintln!("No crates/ directory found. Run from workspace root.");
        process::exit(1);
    }

    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(&crates_dir)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().map(|e| e == "rs").unwrap_or(false)
            && has_component(path, "src")
            && !has_component(path, "cargo-flight-lint")
        {
            files.push(path.to_owned());
        }
    }

    files.sort();
    files
}

fn has_component(path: &Path, name: &str) -> bool {
    path.components().any(|c| c.as_os_str() == name)
}

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

struct Violation {
    file: PathBuf,
    line: usize,
    rule: String,
    message: String,
}

#[derive(Debug)]
struct NamedRange {
    name: String,
    start_line: usize,
    end_line: usize,
}

#[derive(Debug)]
enum FileItem {
    Preamble {
        start_line: usize,
        end_line: usize,
    },
    Struct(NamedRange),
    FreeFn(NamedRange),
    Impl {
        type_name: String,
        start_line: usize,
        end_line: usize,
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

fn parse_items(source: &str) -> Result<Vec<FileItem>, String> {
    let file = syn::parse_file(source).map_err(|e| format!("{}", e))?;
    let mut items = Vec::new();

    for item in &file.items {
        match item {
            Item::Use(u) => {
                let start = u.use_token.span.start().line;
                let end = u.semi_token.span.end().line;
                items.push(FileItem::Preamble {
                    start_line: start,
                    end_line: end,
                });
            }
            Item::Mod(m) => {
                let start = m.mod_token.span.start().line;
                let end = m
                    .semi
                    .map(|s| s.span.end().line)
                    .unwrap_or(m.mod_token.span.end().line);
                items.push(FileItem::Preamble {
                    start_line: start,
                    end_line: end,
                });
            }
            Item::Struct(s) => {
                let start = first_attr_line(&s.attrs).unwrap_or(s.struct_token.span.start().line);
                let end = struct_end_line(s);
                items.push(FileItem::Struct(NamedRange {
                    name: s.ident.to_string(),
                    start_line: start,
                    end_line: end,
                }));
            }
            Item::Fn(f) => {
                let start = first_attr_line(&f.attrs).unwrap_or(f.sig.fn_token.span.start().line);
                let end = f.block.brace_token.span.close().end().line;
                items.push(FileItem::FreeFn(NamedRange {
                    name: f.sig.ident.to_string(),
                    start_line: start,
                    end_line: end,
                }));
            }
            Item::Impl(i) => {
                let start = i.impl_token.span.start().line;
                let end = i.brace_token.span.close().end().line;
                let type_name = impl_type_name(i);

                let mut methods = Vec::new();
                for impl_item in &i.items {
                    if let ImplItem::Fn(m) = impl_item {
                        let m_start =
                            first_attr_line(&m.attrs).unwrap_or(m.sig.fn_token.span.start().line);
                        let m_end = m.block.brace_token.span.close().end().line;
                        methods.push(NamedRange {
                            name: m.sig.ident.to_string(),
                            start_line: m_start,
                            end_line: m_end,
                        });
                    }
                }

                items.push(FileItem::Impl {
                    type_name,
                    start_line: start,
                    end_line: end,
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

fn impl_type_name(i: &syn::ItemImpl) -> String {
    if let syn::Type::Path(p) = &*i.self_ty {
        return p
            .path
            .segments
            .last()
            .map(|s| s.ident.to_string())
            .unwrap_or_default();
    }
    return String::new();
}

// ---------------------------------------------------------------------------
// Checking
// ---------------------------------------------------------------------------

fn check_file(path: &Path, source: &str) -> Vec<Violation> {
    let items = match parse_items(source) {
        Ok(items) => items,
        Err(e) => {
            return vec![Violation {
                file: path.to_owned(),
                line: 0,
                rule: "parse-error".into(),
                message: e,
            }];
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
            violations.push(Violation {
                file: path.to_owned(),
                line: item.start_line(),
                rule: "file-structure".into(),
                message: format!("{} appears after a later section", item.kind_name()),
            });
        }
        max_kind = max_kind.max(kind);
    }

    return violations;
}

fn check_ordering(items: &[&NamedRange], rule: &str, path: &Path, out: &mut Vec<Violation>) {
    for pair in items.windows(2) {
        if sort_key(&pair[0].name) > sort_key(&pair[1].name) {
            out.push(Violation {
                file: path.to_owned(),
                line: pair[1].start_line,
                rule: rule.into(),
                message: format!("`{}` should come before `{}`", pair[1].name, pair[0].name),
            });
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

fn fix_file(source: &str) -> Option<String> {
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

// ---------------------------------------------------------------------------
// Test module parsing
// ---------------------------------------------------------------------------

struct TestModule {
    name: String,
    test_count: usize,
    start_line: usize,
}

fn parse_test_modules(source: &str) -> Vec<TestModule> {
    let file = match syn::parse_file(source) {
        Ok(f) => f,
        Err(_) => return Vec::new(),
    };

    let mut modules = Vec::new();

    for item in &file.items {
        if let Item::Mod(m) = item {
            if let Some((_, items)) = &m.content {
                let test_count = items
                    .iter()
                    .filter(|i| {
                        if let Item::Fn(f) = i {
                            f.attrs.iter().any(|a| a.path().is_ident("test"))
                        } else {
                            false
                        }
                    })
                    .count();

                modules.push(TestModule {
                    name: m.ident.to_string(),
                    test_count,
                    start_line: m.mod_token.span.start().line,
                });
            }
        }
    }

    return modules;
}

// ---------------------------------------------------------------------------
// Test checks
// ---------------------------------------------------------------------------

fn check_all_tests(src_files: &[PathBuf]) -> Vec<Violation> {
    let mut violations = Vec::new();

    for src_path in src_files {
        let stem = match src_path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        if stem == "lib" || stem == "mod" {
            continue;
        }

        let source = match fs::read_to_string(src_path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let items = match parse_items(&source) {
            Ok(items) => items,
            Err(_) => continue,
        };

        let free_fns: Vec<&str> = items
            .iter()
            .filter_map(|i| {
                if let FileItem::FreeFn(r) = i {
                    Some(r.name.as_str())
                } else {
                    None
                }
            })
            .collect();

        if free_fns.is_empty() {
            continue;
        }

        let impl_methods: Vec<&str> = items
            .iter()
            .flat_map(|i| {
                if let FileItem::Impl { methods, .. } = i {
                    methods.iter().map(|m| m.name.as_str()).collect::<Vec<_>>()
                } else {
                    vec![]
                }
            })
            .collect();

        let crate_dir = match src_path.parent().and_then(|p| p.parent()) {
            Some(d) => d,
            None => continue,
        };

        let test_path = crate_dir.join("tests").join(format!("{}_test.rs", stem));

        if !test_path.exists() {
            violations.push(Violation {
                file: src_path.to_owned(),
                line: 0,
                rule: "missing-test-file".into(),
                message: format!("no test file (expected {})", test_path.display()),
            });
            continue;
        }

        let test_source = match fs::read_to_string(&test_path) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("warning: {}: {}", test_path.display(), e);
                continue;
            }
        };

        // Rule: test-coverage — each free fn must appear as a call in tests
        for name in &free_fns {
            let call_pattern = format!("{}(", name);
            if !test_source.contains(&call_pattern) {
                violations.push(Violation {
                    file: src_path.to_owned(),
                    line: 0,
                    rule: "test-coverage".into(),
                    message: format!("`{}` is not tested", name),
                });
            }
        }

        // Rule: test-method-call — tests must use free functions, not impl methods
        // Rule: test-default-call — tests must not use ::default() (not transpilable)
        for (line_idx, line) in test_source.lines().enumerate() {
            for name in &impl_methods {
                let pattern = format!(".{}(", name);
                if line.contains(&pattern) {
                    violations.push(Violation {
                        file: test_path.clone(),
                        line: line_idx + 1,
                        rule: "test-method-call".into(),
                        message: format!(
                            "test calls impl method `.{}()` — use the free function",
                            name
                        ),
                    });
                }
            }

            if line.contains("::default()") {
                violations.push(Violation {
                    file: test_path.clone(),
                    line: line_idx + 1,
                    rule: "test-default-call".into(),
                    message: "test calls `::default()` — use the `create_*` function"
                        .into(),
                });
            }
        }

        // Rule: test-module-coverage — each free fn must have a mod in the test file
        let test_modules = parse_test_modules(&test_source);
        let test_mod_names: HashSet<&str> =
            test_modules.iter().map(|m| m.name.as_str()).collect();

        for name in &free_fns {
            if !test_mod_names.contains(name) {
                violations.push(Violation {
                    file: test_path.clone(),
                    line: 0,
                    rule: "test-module-coverage".into(),
                    message: format!(
                        "`{}` has no test module (expected `mod {} {{ ... }}`)",
                        name, name
                    ),
                });
            }
        }

        // Rule: test-module-empty — test modules must have at least one #[test]
        for module in &test_modules {
            if module.test_count == 0 {
                violations.push(Violation {
                    file: test_path.clone(),
                    line: module.start_line,
                    rule: "test-module-empty".into(),
                    message: format!(
                        "module `{}` has no #[test] functions",
                        module.name
                    ),
                });
            }
        }

        // Rule: test-module-order — test modules must be alphabetically ordered
        for pair in test_modules.windows(2) {
            if pair[0].name > pair[1].name {
                violations.push(Violation {
                    file: test_path.clone(),
                    line: pair[1].start_line,
                    rule: "test-module-order".into(),
                    message: format!(
                        "`{}` should come before `{}`",
                        pair[1].name, pair[0].name
                    ),
                });
            }
        }
    }

    return violations;
}

// ---------------------------------------------------------------------------
// TS conformance
// ---------------------------------------------------------------------------

fn extract_ts_exports(source: &str) -> Vec<String> {
    let mut names = Vec::new();
    for line in source.lines() {
        let trimmed = line.trim();
        if let Some(after_fn) = trimmed.strip_prefix("export function ") {
            if let Some(paren_pos) = after_fn.find('(') {
                let mut name = &after_fn[..paren_pos];
                if let Some(angle_pos) = name.find('<') {
                    name = &name[..angle_pos];
                }
                let name = name.trim();
                if !name.is_empty() {
                    names.push(name.to_string());
                }
            }
        }
    }
    return names;
}

fn find_ts_file_by_snake(ts_dir: &Path, rust_stem: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(ts_dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if let Some(ts_stem) = name.strip_suffix(".ts") {
            if camel_to_snake(ts_stem) == rust_stem {
                return Some(entry.path());
            }
        }
    }
    return None;
}

fn camel_to_snake(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut result = String::new();
    for i in 0..chars.len() {
        let c = chars[i];
        if c.is_uppercase() {
            if i > 0 {
                let prev = chars[i - 1];
                let next_is_lower = chars.get(i + 1).map(|c| c.is_lowercase()).unwrap_or(false);
                if prev.is_lowercase()
                    || prev.is_ascii_digit()
                    || (prev.is_uppercase() && next_is_lower)
                {
                    result.push('_');
                }
            }
            result.push(c.to_lowercase().next().unwrap());
        } else {
            result.push(c);
        }
    }
    return result;
}
