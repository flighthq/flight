//! flight-compiler: rust-only — reads the TS and Rust lane sources from disk.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

fn crate_dir() -> PathBuf {
    return PathBuf::from(env!("CARGO_MANIFEST_DIR"));
}

fn package_src_dir() -> PathBuf {
    return crate_dir().join("../../packages/velocity/src");
}

/// Case- and underscore-insensitive identity: `createTransform2D` ↔ `create_transform2d`.
fn normalize(name: &str) -> String {
    return name
        .chars()
        .filter(|c| *c != '_')
        .flat_map(|c| c.to_lowercase())
        .collect();
}

/// Value names (functions and constants) exported by a TS module, ignoring `export type`.
fn ts_module_values(path: &Path) -> BTreeSet<String> {
    let source = fs::read_to_string(path).unwrap();
    let mut names = BTreeSet::new();
    for line in source.lines() {
        for prefix in ["export function ", "export const ", "export let "] {
            if let Some(rest) = line.strip_prefix(prefix) {
                let name: String = rest
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                names.insert(normalize(&name));
            }
        }
    }
    return names;
}

/// Every value `index.ts` exports, from both `export { a, b } from` (single- or multi-line) and
/// `export * from` statements. Type-only exports are excluded.
fn ts_index_values() -> BTreeSet<String> {
    let src = package_src_dir();
    // Line comments (such as a generated provenance header) would otherwise prefix the first
    // statement and hide its `export` keyword.
    let index: String = fs::read_to_string(src.join("index.ts"))
        .unwrap()
        .lines()
        .filter(|line| !line.trim_start().starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n");
    let mut names = BTreeSet::new();
    for statement in index.split(';') {
        let statement = statement.trim();
        if statement.starts_with("export type") {
            continue;
        }
        if let Some(rest) = statement.strip_prefix("export * from") {
            let file = rest.trim().trim_matches(|c| c == '\'' || c == '"');
            names.extend(ts_module_values(&src.join(file)));
            continue;
        }
        if let Some(rest) = statement.strip_prefix("export {") {
            let list = &rest[..rest.find('}').unwrap()];
            for name in list.split(',') {
                let name = name.trim();
                if !name.is_empty() {
                    names.insert(normalize(name));
                }
            }
        }
    }
    return names;
}

/// Lower-case-first (function) and SCREAMING (constant) names re-exported at the crate root.
fn rust_root_values() -> BTreeSet<String> {
    let lib = fs::read_to_string(crate_dir().join("src/lib.rs")).unwrap();
    let mut names = BTreeSet::new();
    for line in lib.lines() {
        if let Some(rest) = line.strip_prefix("pub use contract::") {
            let name = rest.trim_end_matches(';');
            let is_type = name.chars().next().unwrap().is_uppercase()
                && name.chars().any(|c| c.is_lowercase());
            if !is_type {
                names.insert(normalize(name));
            }
        }
    }
    return names;
}

mod root_lane {
    use super::*;

    #[test]
    fn exports_every_value_the_ts_index_exports() {
        let root = rust_root_values();
        let missing: Vec<String> = ts_index_values().difference(&root).cloned().collect();
        assert!(
            missing.is_empty(),
            "TS index.ts exports values missing from the Rust root: {missing:?}"
        );
    }

    #[test]
    fn exports_no_value_the_ts_index_keeps_contract_only() {
        let index = ts_index_values();
        let extra: Vec<String> = rust_root_values().difference(&index).cloned().collect();
        assert!(
            extra.is_empty(),
            "Rust root exports values TS index.ts does not: {extra:?}"
        );
    }

    #[test]
    fn reads_multi_line_and_star_index_exports() {
        let index = ts_index_values();
        assert!(index.contains("addvelocity"));
        assert!(index.contains("zerovelocity"));
        assert!(index.contains("contributetransformvelocity"));
        assert!(index.contains("getvelocitysampleat"));
        assert!(!index.contains("ensurevelocitysample"));
    }
}
