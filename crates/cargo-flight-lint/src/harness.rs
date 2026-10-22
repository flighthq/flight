use std::fs;
use std::path::{Path, PathBuf};

use syn::spanned::Spanned;
use syn::{Item, Meta};

// ---------------------------------------------------------------------------
// Test harness: one integration-test binary per crate, named after the crate
// ---------------------------------------------------------------------------
//
// `tests/main.rs` keeps its own helpers (support modules, fixtures, `block_on`) at the crate root, so
// `crate::…` paths in test files keep working. Every `tests/<file>_test.rs` is declared as
// `mod <crate>_<file>_test` (e.g. `flight_physics3d_stress_test`), so `cargo test` names each test
// with its crate and file: `flight_physics3d_stress_test::<function>::<case>`. The `_test` suffix keeps
// the name from ever matching a crate. The target stays `tests` (nextest prefixes the crate itself).
// Crates without doc examples set `doctest = false`, so `cargo test` skips their rustdoc pass.

/// Rewrites the crate's test harness into the canonical form. Returns the files it changed.
pub fn fix_harness(crate_dir: &Path) -> Vec<PathBuf> {
    let mut changed = Vec::new();
    let tests_dir = crate_dir.join("tests");
    let main_path = tests_dir.join("main.rs");
    let Some(crate_ident) = crate_ident(crate_dir) else {
        return changed;
    };
    let Ok(main_source) = fs::read_to_string(&main_path) else {
        return changed;
    };

    let stems = test_file_stems(&tests_dir);
    if let Some(fixed) = fix_main(&main_source, &crate_ident, &stems)
        && fixed != main_source
    {
        fs::write(&main_path, &fixed).expect("write failed");
        changed.push(main_path.clone());
    }

    for path in rust_files(&tests_dir) {
        let Ok(source) = fs::read_to_string(&path) else {
            continue;
        };
        let fixed = rewrite_test_module_paths(&source, &crate_ident, &stems);
        if fixed != source {
            fs::write(&path, &fixed).expect("write failed");
            changed.push(path);
        }
    }

    let manifest_path = crate_dir.join("Cargo.toml");
    if let Ok(manifest) = fs::read_to_string(&manifest_path)
        && let Some(fixed) = fix_manifest(&manifest, has_doc_examples(&crate_dir.join("src")))
        && fixed != manifest
    {
        fs::write(&manifest_path, &fixed).expect("write failed");
        changed.push(manifest_path);
    }

    return changed;
}

/// The crate's name as an identifier (`flight_physics3d`).
fn crate_ident(crate_dir: &Path) -> Option<String> {
    return Some(crate_dir.file_name()?.to_str()?.replace('-', "_"));
}

/// True when any source file carries a fenced code block in its docs (`///` or `//!`), i.e. a doctest.
fn has_doc_examples(src_dir: &Path) -> bool {
    let mut stack = vec![src_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().is_some_and(|ext| ext == "rs")
                && let Ok(source) = fs::read_to_string(&path)
                && source.lines().any(|line| {
                    let trimmed = line.trim_start();
                    return (trimmed.starts_with("///") || trimmed.starts_with("//!")) && trimmed.contains("```");
                })
            {
                return true;
            }
        }
    }
    return false;
}

/// The stems of `tests/*_test.rs`, sorted.
fn test_file_stems(tests_dir: &Path) -> Vec<String> {
    let mut stems: Vec<String> = rust_files(tests_dir)
        .iter()
        .filter_map(|path| path.file_stem()?.to_str().map(|s| s.to_string()))
        .filter(|stem| stem.ends_with("_test"))
        .collect();
    stems.sort();
    return stems;
}

fn rust_files(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext == "rs"))
        .collect();
    files.sort();
    return files;
}

/// The test-file module name: crate plus file stem (`flight_physics3d` + `stress_test`). Leading
/// underscores of a private-module stem (`_font_face_load_test.rs`) are dropped so the name stays
/// snake case.
fn module_name(crate_ident: &str, stem: &str) -> String {
    return format!("{}_{}", crate_ident, stem.trim_start_matches('_'));
}

/// Regenerates `main.rs`: removes every test-file module declaration (plain `mod x_test;`, the
/// generated `#[path = "x_test.rs"] mod …_test;` form, and the older `#[path = "."]` wrapper), keeps
/// everything else in place, and appends one declaration per test file. `None` when the file does not
/// parse or declares a test-file module in a form this tool does not own, so it is left for a human.
pub fn fix_main(source: &str, crate_ident: &str, stems: &[String]) -> Option<String> {
    let file = syn::parse_file(source).ok()?;
    let lines: Vec<&str> = source.lines().collect();
    let mut removed: Vec<(usize, usize)> = Vec::new();

    for item in &file.items {
        let Item::Mod(m) = item else {
            continue;
        };
        let name = m.ident.to_string();
        if m.content.is_none() && name.ends_with("_test") {
            let owned = m.attrs.is_empty() || (m.attrs.len() == 1 && path_attr(&m.attrs).is_some_and(|p| p.ends_with("_test.rs")));
            if !owned {
                return None;
            }
            removed.push((m.span().start().line, m.span().end().line));
        } else if m.content.is_some() && path_attr(&m.attrs).as_deref() == Some(".") {
            removed.push((m.span().start().line, m.span().end().line));
        }
    }

    let mut kept: Vec<&str> = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let number = index + 1;
        if !removed.iter().any(|(start, end)| number >= *start && number <= *end) {
            kept.push(line);
        }
    }
    // Collapse the blank runs the removal leaves behind, and trim the ends.
    let mut body: Vec<&str> = Vec::new();
    for line in kept {
        if line.trim().is_empty() && body.last().is_none_or(|last| last.trim().is_empty()) {
            continue;
        }
        body.push(line);
    }
    while body.last().is_some_and(|last| last.trim().is_empty()) {
        body.pop();
    }

    let mut result = body.join("\n");
    if !result.is_empty() {
        result.push_str("\n\n");
    }
    for stem in stems {
        result.push_str(&format!("#[path = \"{}.rs\"]\nmod {};\n", stem, module_name(crate_ident, stem)));
    }
    return Some(result);
}

fn path_attr(attrs: &[syn::Attribute]) -> Option<String> {
    for attr in attrs {
        if let Meta::NameValue(nv) = &attr.meta
            && nv.path.is_ident("path")
            && let syn::Expr::Lit(lit) = &nv.value
            && let syn::Lit::Str(s) = &lit.lit
        {
            return Some(s.value());
        }
    }
    return None;
}

/// Points `crate::…` references to another test file's module at its current name:
/// `crate::x_test::` and the older wrapper form `crate::<short>::x::` become `crate::<crate>_x_test::`.
pub fn rewrite_test_module_paths(source: &str, crate_ident: &str, stems: &[String]) -> String {
    let short = crate_ident.strip_prefix("flight_").unwrap_or(crate_ident);
    let mut result = source.to_string();
    for stem in stems {
        let target = format!("crate::{}::", module_name(crate_ident, stem));
        let bare = stem.strip_suffix("_test").unwrap_or(stem);
        result = result.replace(&format!("crate::{}::{}::", short, bare), &target);
        result = result.replace(&format!("crate::{}::r#{}::", short, bare), &target);
        result = replace_whole_segment(&result, &format!("crate::{}::", stem), &target);
    }
    return result;
}

/// Replaces `from` only where it is not the tail of a longer identifier (`crate::a_test::` must not
/// match inside `crate::b_a_test::`).
fn replace_whole_segment(source: &str, from: &str, to: &str) -> String {
    let mut result = String::with_capacity(source.len());
    let mut rest = source;
    while let Some(at) = rest.find(from) {
        let boundary = rest[..at].chars().last().is_none_or(|c| !(c.is_ascii_alphanumeric() || c == '_'));
        result.push_str(&rest[..at]);
        result.push_str(if boundary { to } else { from });
        rest = &rest[at + from.len()..];
    }
    result.push_str(rest);
    return result;
}

/// The canonical manifest: one `tests/main.rs` target named `tests` (with `autotests = false`), and a
/// `[lib] doctest = false` section, just before that target, exactly when the crate has no doc
/// examples. Edits in place. `None` when the manifest has a test target or `[lib]` section this tool
/// does not own.
pub fn fix_manifest(manifest: &str, doctests: bool) -> Option<String> {
    let mut lines: Vec<String> = manifest.lines().map(|l| l.to_string()).collect();

    // Remove this tool's `[lib]` block (and the blank line after it); re-added below when wanted.
    if let Some(at) = lines.iter().position(|l| l.trim() == "[lib]")
        && lines.get(at + 1).is_some_and(|l| l.trim() == "doctest = false")
        && lines.get(at + 2).is_none_or(|l| l.trim().is_empty())
    {
        let end = (at + 3).min(lines.len());
        lines.drain(at..end);
    }
    if lines.iter().any(|l| l.trim() == "[lib]") {
        return None;
    }

    let targets: Vec<usize> = lines.iter().enumerate().filter(|(_, l)| l.trim() == "[[test]]").map(|(i, _)| i).collect();
    let target_at = match targets.as_slice() {
        [] => None,
        [at] => {
            let at = *at;
            if !(lines.get(at + 1).is_some_and(|l| l.trim_start().starts_with("name"))
                && lines.get(at + 2).is_some_and(|l| l.trim() == "path = \"tests/main.rs\""))
            {
                return None;
            }
            lines[at + 1] = "name = \"tests\"".to_string();
            Some(at)
        }
        _ => return None,
    };

    if !lines.iter().any(|l| l.trim_start().starts_with("autotests")) {
        let package = lines.iter().position(|l| l.trim() == "[package]")?;
        let mut insert = package + 1;
        while insert < lines.len() && !lines[insert].trim().is_empty() && !lines[insert].trim_start().starts_with('[') {
            insert += 1;
        }
        lines.insert(insert, "autotests = false".to_string());
    }

    let target_at = match target_at {
        Some(at) => lines.iter().position(|l| l.trim() == "[[test]]").unwrap_or(at),
        None => {
            while lines.last().is_some_and(|l| l.trim().is_empty()) {
                lines.pop();
            }
            lines.push(String::new());
            lines.push("[[test]]".to_string());
            lines.push("name = \"tests\"".to_string());
            lines.push("path = \"tests/main.rs\"".to_string());
            lines.len() - 3
        }
    };

    if !doctests {
        lines.insert(target_at, String::new());
        lines.insert(target_at, "doctest = false".to_string());
        lines.insert(target_at, "[lib]".to_string());
    }

    let mut result = lines.join("\n");
    result.push('\n');
    return Some(result);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_keeps_helpers_and_names_modules_after_crate_and_file() {
        let src = "use flight_x::contract::*;\n\nmod aabb_test;\nmod support;\nmod type_test;\n\nuse support::*;\n";
        let stems = vec!["aabb_test".to_string(), "type_test".to_string()];
        let fixed = fix_main(src, "flight_x", &stems).unwrap();
        assert_eq!(
            fixed,
            "use flight_x::contract::*;\n\nmod support;\n\nuse support::*;\n\n#[path = \"aabb_test.rs\"]\nmod flight_x_aabb_test;\n#[path = \"type_test.rs\"]\nmod flight_x_type_test;\n"
        );
        assert_eq!(fix_main(&fixed, "flight_x", &stems).unwrap(), fixed);
    }

    #[test]
    fn main_drops_leading_underscores_from_private_module_stems() {
        let fixed = fix_main("", "flight_x", &["_load_test".to_string()]).unwrap();
        assert_eq!(fixed, "#[path = \"_load_test.rs\"]\nmod flight_x_load_test;\n");
    }

    #[test]
    fn main_replaces_the_older_wrapper_and_picks_up_new_files() {
        let src = "#[path = \".\"]\nmod x {\n    #[allow(unused_imports)]\n    use super::*;\n\n    #[path = \"b_test.rs\"]\n    mod b;\n}\n";
        let stems = vec!["a_test".to_string(), "b_test".to_string()];
        let fixed = fix_main(src, "flight_x", &stems).unwrap();
        assert_eq!(fixed, "#[path = \"a_test.rs\"]\nmod flight_x_a_test;\n#[path = \"b_test.rs\"]\nmod flight_x_b_test;\n");
    }

    #[test]
    fn main_leaves_foreign_test_modules_alone() {
        assert!(fix_main("#[cfg(feature = \"x\")]\nmod a_test;\n", "flight_x", &["a_test".to_string()]).is_none());
    }

    #[test]
    fn cross_test_paths_follow_the_module_names() {
        let stems = vec!["svg_document_conformance_test".to_string(), "a_test".to_string()];
        let src = "use crate::svg_document_conformance_test::{a, b};\nuse crate::x::svg_document_conformance::c;\nuse crate::b_a_test::d;\nuse crate::support::*;\n";
        assert_eq!(
            rewrite_test_module_paths(src, "flight_x", &stems),
            "use crate::flight_x_svg_document_conformance_test::{a, b};\nuse crate::flight_x_svg_document_conformance_test::c;\nuse crate::b_a_test::d;\nuse crate::support::*;\n"
        );
    }

    #[test]
    fn manifest_keeps_the_tests_target_and_disables_empty_doctests() {
        let src = "[package]\nname = \"flight-x\"\nautotests = false\n\n[dependencies]\nserde = \"1\"\n\n[[test]]\nname = \"tests\"\npath = \"tests/main.rs\"\n";
        let fixed = fix_manifest(src, false).unwrap();
        assert!(fixed.ends_with("serde = \"1\"\n\n[lib]\ndoctest = false\n\n[[test]]\nname = \"tests\"\npath = \"tests/main.rs\"\n"), "{}", fixed);
        assert_eq!(fix_manifest(&fixed, false).unwrap(), fixed);
        assert_eq!(fix_manifest(&fixed, true).unwrap(), src);
    }

    #[test]
    fn manifest_restores_a_crate_named_target() {
        let src = "[package]\nname = \"flight-x\"\nautotests = false\n\n[[test]]\nname = \"flight_x\"\npath = \"tests/main.rs\"\n";
        assert!(fix_manifest(src, true).unwrap().ends_with("[[test]]\nname = \"tests\"\npath = \"tests/main.rs\"\n"));
    }

    #[test]
    fn manifest_without_a_target_gains_one() {
        let src = "[package]\nname = \"flight-x\"\nedition = \"2024\"\n\n[dependencies]\nserde = \"1\"\n";
        let fixed = fix_manifest(src, true).unwrap();
        assert!(fixed.contains("edition = \"2024\"\nautotests = false\n"), "{}", fixed);
        assert!(fixed.ends_with("serde = \"1\"\n\n[[test]]\nname = \"tests\"\npath = \"tests/main.rs\"\n"), "{}", fixed);
        assert_eq!(fix_manifest(&fixed, true).unwrap(), fixed);
    }

    #[test]
    fn manifest_leaves_foreign_lib_sections_alone() {
        assert!(fix_manifest("[package]\nname = \"x\"\n\n[lib]\ncrate-type = [\"cdylib\"]\n", false).is_none());
    }
}
