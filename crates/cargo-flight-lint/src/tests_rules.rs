use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use syn::Item;

use crate::model::Violation;
use crate::structure::{FileItem, NamedRange, parse_items, sort_group};
use syn::spanned::Spanned;

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

/// Sorts the top-level inline test modules of a test file alphabetically (`test-module-order`), moving
/// each module with its attached comments and attributes. Returns the source unchanged when already
/// sorted or when something unattached sits between two modules.
pub fn fix_test_module_order(source: &str) -> Option<String> {
    let file = syn::parse_file(source).ok()?;
    let lines: Vec<&str> = source.lines().collect();
    let modules: Vec<NamedRange> = file
        .items
        .iter()
        .filter_map(|item| {
            if let Item::Mod(m) = item
                && m.content.is_some()
            {
                return Some(NamedRange {
                    name: m.ident.to_string(),
                    is_pub: false,
                    start_line: m.span().start().line,
                    end_line: m.span().end().line,
                });
            }
            return None;
        })
        .collect();
    let refs: Vec<&NamedRange> = modules.iter().collect();
    let Some((start, end, text)) = sort_group(&refs, &lines, "\n\n", |name: &str| name.to_string()) else {
        return Some(source.to_string());
    };
    let mut result: Vec<String> = lines.iter().map(|s| s.to_string()).collect();
    result.splice((start - 1)..end, text.lines().map(|s| s.to_string()));
    let mut joined = result.join("\n");
    if source.ends_with('\n') {
        joined.push('\n');
    }
    return Some(joined);
}

/// The paired test file of a source file (`tests/{stem}_test.rs`), when the source is a module that
/// the test rules cover.
pub fn paired_test_path(src_path: &std::path::Path) -> Option<PathBuf> {
    let stem = src_path.file_stem()?.to_str()?;
    if stem == "lib" || stem == "mod" {
        return None;
    }
    let crate_dir = src_path.parent()?.parent()?;
    return Some(crate_dir.join("tests").join(format!("{}_test.rs", stem)));
}

// ---------------------------------------------------------------------------
// Test checks
// ---------------------------------------------------------------------------

pub fn check_all_tests(src_files: &[PathBuf]) -> Vec<Violation> {
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
                if let FileItem::FreeFn(r) = i
                    && r.is_pub
                {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fix_sorts_test_modules_with_their_attributes() {
        let src = "use flight_x::*;\n\n// flight-lint: allow(f64) z keeps double\nmod z {\n    #[test]\n    fn t() {}\n}\n\nmod a {\n    use super::*;\n\n    #[test]\n    fn t() {}\n}\n";
        let fixed = fix_test_module_order(src).unwrap();
        assert!(fixed.find("mod a {").unwrap() < fixed.find("mod z {").unwrap(), "{}", fixed);
        assert!(fixed.contains("// flight-lint: allow(f64) z keeps double\nmod z {"));
        assert!(fixed.starts_with("use flight_x::*;\n\n"));
        assert_eq!(fix_test_module_order(&fixed).unwrap(), fixed);
    }

    #[test]
    fn fix_leaves_test_modules_with_unattached_comments_alone() {
        let src = "mod z {\n    #[test]\n    fn t() {}\n}\n\n// divider\n\nmod a {\n    #[test]\n    fn t() {}\n}\n";
        assert_eq!(fix_test_module_order(src).unwrap(), src);
    }
}
