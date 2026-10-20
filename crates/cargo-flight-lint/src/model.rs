use std::fs;
use std::path::{Path, PathBuf};
use std::process;

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Level {
    Error,
    Warn,
}

pub struct Rule {
    pub name: &'static str,
    pub level: Level,
    pub scope: &'static str,
    pub description: &'static str,
}

/// Every rule the tool can emit. `Warn` rules track directions still under discussion
/// (see agents/design-decisions.md); promote them to `Error` once the ruling is approved.
pub const RULES: &[Rule] = &[
    Rule { name: "parse-error", level: Level::Error, scope: "Source", description: "File failed to parse" },
    Rule { name: "fn-order", level: Level::Error, scope: "Source", description: "Free functions ordered: constructors first, then alphabetical" },
    Rule { name: "impl-order", level: Level::Error, scope: "Source", description: "Impl methods ordered: `new` first, then alphabetical" },
    Rule { name: "file-structure", level: Level::Error, scope: "Source", description: "Sections in order: use/mod, struct, fn, impl" },
    Rule { name: "missing-test-file", level: Level::Error, scope: "Source", description: "Every module with pub free functions needs a `tests/{name}_test.rs`" },
    Rule { name: "test-coverage", level: Level::Error, scope: "Tests", description: "Every pub free function must be called in its test file" },
    Rule { name: "test-module-coverage", level: Level::Error, scope: "Tests", description: "Every pub free function must have a `mod` block in the test file" },
    Rule { name: "test-module-empty", level: Level::Error, scope: "Tests", description: "Test modules must contain at least one `#[test]`" },
    Rule { name: "test-module-order", level: Level::Error, scope: "Tests", description: "Test modules must be alphabetically ordered" },
    Rule { name: "test-method-call", level: Level::Error, scope: "Tests", description: "Tests must not call impl methods" },
    Rule { name: "test-default-call", level: Level::Error, scope: "Tests", description: "Tests must not use `::default()`" },
    Rule { name: "f64", level: Level::Error, scope: "Source", description: "f64 only in items declared with `allow(f64) <reason>` (D1)" },
    Rule { name: "hidden-state", level: Level::Error, scope: "Source", description: "No thread_local!, interior-mutable statics, or clock reads without `allow(hidden-state) <reason>` (D5)" },
    Rule { name: "sugar-delegates", level: Level::Error, scope: "Source", description: "Impl methods delegate to a free function and contain no loops (D6)" },
    Rule { name: "hashmap-iteration", level: Level::Error, scope: "Source", description: "Maps are for lookup: no iteration over HashMap/HashSet bindings (use a Vec) unless marked `allow(hashmap-iteration) <reason>` (D3)" },
    Rule { name: "contract-vocabulary", level: Level::Warn, scope: "Source", description: "Pub signatures, fields, aliases, and constants use only IR vocabulary types (agents/ir-vocabulary.md)" },
    Rule { name: "enum-payload-named", level: Level::Warn, scope: "Source", description: "Data-carrying variants hold exactly one named struct (D2)" },
    Rule { name: "allow-reason", level: Level::Error, scope: "Source", description: "Every `flight-lint: allow(...)` marker states a reason" },
    Rule { name: "allow-unknown-rule", level: Level::Error, scope: "Source", description: "Allow markers name rules that exist" },
    Rule { name: "conform-missing", level: Level::Error, scope: "Conform", description: "Every exported TS function has a Rust pub free function" },
    Rule { name: "conform-extra", level: Level::Error, scope: "Conform", description: "Every Rust pub free function exists in TS, or is marked `allow(conform-extra)`" },
    Rule { name: "conform-params", level: Level::Error, scope: "Conform", description: "Parameter names and order match TS, or are marked `allow(conform-params)`" },
];

pub fn find_rule(name: &str) -> Option<&'static Rule> {
    return RULES.iter().find(|r| r.name == name);
}

pub fn rule_level(name: &str) -> Level {
    return find_rule(name).map(|r| r.level).unwrap_or(Level::Error);
}

// ---------------------------------------------------------------------------
// Violations
// ---------------------------------------------------------------------------

pub struct Violation {
    pub file: PathBuf,
    pub line: usize,
    pub rule: String,
    pub message: String,
}

impl Violation {
    pub fn new(file: &Path, line: usize, rule: &str, message: String) -> Violation {
        return Violation {
            file: file.to_owned(),
            line,
            rule: rule.to_string(),
            message,
        };
    }

    /// Line-insensitive identity, used by baselines so unrelated edits do not churn them.
    pub fn key(&self) -> String {
        return format!("{}\t{}\t{}", self.rule, display_path(&self.file), self.message);
    }

    pub fn level(&self) -> Level {
        return rule_level(&self.rule);
    }
}

pub fn display_path(path: &Path) -> String {
    return path.to_string_lossy().replace('\\', "/");
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

pub const LINT_CRATE: &str = "cargo-flight-lint";

pub fn ensure_workspace_root() {
    if !Path::new("crates").exists() {
        eprintln!("No crates/ directory found. Run from workspace root.");
        process::exit(1);
    }
}

/// All crate directory names under `crates/`, sorted, excluding this tool.
pub fn discover_crates(filter: &[String]) -> Vec<String> {
    ensure_workspace_root();
    let mut names = Vec::new();
    if let Ok(entries) = fs::read_dir("crates") {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name == LINT_CRATE || !entry.path().join("Cargo.toml").exists() {
                continue;
            }
            if !filter.is_empty() && !filter.iter().any(|f| *f == name) {
                continue;
            }
            names.push(name);
        }
    }
    names.sort();
    for f in filter {
        if !names.iter().any(|n| n == f) {
            eprintln!("warning: unknown crate `{}`", f);
        }
    }
    return names;
}

/// `.rs` files under `crates/<crate>/<sub>/`, sorted.
pub fn crate_files(crate_name: &str, sub: &str) -> Vec<PathBuf> {
    let dir = Path::new("crates").join(crate_name).join(sub);
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(&dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.extension().map(|e| e == "rs").unwrap_or(false) {
            files.push(path.to_owned());
        }
    }
    files.sort();
    return files;
}

/// Source files for the given crates (all crates when the filter is empty).
pub fn discover_files(filter: &[String]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for c in discover_crates(filter) {
        files.extend(crate_files(&c, "src"));
    }
    return files;
}

pub fn crate_of(path: &Path) -> String {
    let parts: Vec<String> = path
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect();
    for i in 0..parts.len() {
        if parts[i] == "crates" && i + 1 < parts.len() {
            return parts[i + 1].clone();
        }
    }
    return String::new();
}
