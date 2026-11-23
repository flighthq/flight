//! Pins the TypeScript-root census: every root-lane value is generated and reachable, accepted by
//! design with a reason that proves it has no C ABI meaning, or listed in the committed actionable
//! residual under the cause the generator derives. The residual must equal the derived one exactly
//! and may only shrink relative to the base it is merged onto.

#[path = "../public_perimeter.rs"]
#[allow(dead_code)]
mod public_perimeter;
#[path = "../root_census.rs"]
#[allow(dead_code)]
mod root_census;

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::process::Command;

use root_census::{
    BY_DESIGN_CLASSES, Row, Status, check_by_design_coverage, collect_module_exports,
    is_library_source, parse_by_design, render_residual, validate_reason,
};

const COMMITTED_RESIDUAL: &str = include_str!("ffi_root_census_residual.tsv");
const COMMITTED_BY_DESIGN: &str = include_str!("ffi_root_census_by_design.tsv");
const GENERATED_RESIDUAL: &str =
    include_str!(concat!(env!("OUT_DIR"), "/ffi_root_census_residual.tsv"));
const GENERATED_CENSUS: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_root_census.tsv"));
const RESIDUAL_PATH: &str = "crates/flight-ffi/tests/ffi_root_census_residual.tsv";

// Causes the generator derives. A skip cause carries the generator's skip category.
const DERIVED_CAUSES: &[&str] = &[
    "async_function",
    "constant_value",
    "generic_function",
    "no_rust_crate",
    "no_rust_implementation",
    "node_data_field_accessor",
    "type_value",
    "undiscovered_function",
    "unreachable_carrier",
    "unscanned_crate",
];

fn residual_rows(text: &str) -> BTreeMap<(String, String), String> {
    let mut rows = BTreeMap::new();
    for line in text.lines().filter(|line| !line.starts_with('#')) {
        let fields: Vec<&str> = line.split('\t').collect();
        let [package, export, cause] = fields[..] else {
            panic!("residual line `{line}` must have three fields");
        };
        let previous = rows.insert((package.to_string(), export.to_string()), cause.to_string());
        assert!(
            previous.is_none(),
            "duplicate residual row {package}\t{export}"
        );
    }
    return rows;
}

fn repository_root() -> &'static Path {
    return Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
}

fn git(arguments: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(arguments)
        .current_dir(repository_root())
        .output()
        .ok()?;
    return output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).to_string());
}

// The residual on the base this tree merges onto: `FLIGHT_FFI_CENSUS_BASE` when set, otherwise the
// merge base with `origin/develop`. `None` when the base predates the residual.
fn base_residual() -> Option<String> {
    let base = match std::env::var("FLIGHT_FFI_CENSUS_BASE") {
        Ok(base) => base,
        Err(_) => git(&["merge-base", "HEAD", "origin/develop"])?
            .trim()
            .to_string(),
    };
    return git(&["show", &format!("{base}:{RESIDUAL_PATH}")]);
}

// Rows of `head` absent from `base`, and rows whose cause differs.
fn residual_growth(
    base: &BTreeMap<(String, String), String>,
    head: &BTreeMap<(String, String), String>,
) -> Vec<String> {
    let mut growth = Vec::new();
    for (key, cause) in head {
        match base.get(key) {
            None => growth.push(format!("added {}\t{}\t{cause}", key.0, key.1)),
            Some(previous) if previous != cause => growth.push(format!(
                "cause of {}\t{} changed from {previous} to {cause}",
                key.0, key.1
            )),
            Some(_) => {}
        }
    }
    return growth;
}

fn row(package: &str, export: &str, status: Status) -> Row {
    return Row {
        package: package.to_string(),
        export: export.to_string(),
        status,
    };
}

mod census_residual {
    use super::*;

    #[test]
    fn committed_residual_equals_the_derived_residual() {
        let committed = residual_rows(COMMITTED_RESIDUAL);
        let generated = residual_rows(GENERATED_RESIDUAL);
        let unclassified: Vec<_> = generated
            .iter()
            .filter(|(key, _)| !committed.contains_key(*key))
            .map(|(key, cause)| format!("{}\t{}\t{cause}", key.0, key.1))
            .collect();
        let stale: Vec<_> = committed
            .iter()
            .filter(|(key, _)| !generated.contains_key(*key))
            .map(|(key, cause)| format!("{}\t{}\t{cause}", key.0, key.1))
            .collect();
        let changed: Vec<_> = generated
            .iter()
            .filter_map(|(key, cause)| {
                let committed_cause = committed.get(key)?;
                (committed_cause != cause).then(|| {
                    format!(
                        "{}\t{}: committed {committed_cause}, derived {cause}",
                        key.0, key.1
                    )
                })
            })
            .collect();
        assert!(
            unclassified.is_empty() && stale.is_empty() && changed.is_empty(),
            "root census residual drifted\nunclassified: {unclassified:#?}\nstale: {stale:#?}\ncause changed: {changed:#?}"
        );
        assert_eq!(
            COMMITTED_RESIDUAL, GENERATED_RESIDUAL,
            "residual must be byte-identical"
        );
    }

    #[test]
    fn every_residual_cause_is_derived() {
        for cause in residual_rows(COMMITTED_RESIDUAL).values() {
            assert!(
                DERIVED_CAUSES.contains(&cause.as_str()) || cause.starts_with("skip:"),
                "{cause} is not a derived cause"
            );
        }
    }

    #[test]
    fn actionable_count_stays_visible_until_burned_down() {
        let residual = residual_rows(COMMITTED_RESIDUAL).len();
        let summary = GENERATED_CENSUS
            .lines()
            .find(|line| line.starts_with("summary|"))
            .expect("census summary");
        assert!(
            summary.ends_with(&format!("|{residual} actionable")),
            "census summary `{summary}` must report the {residual} residual rows"
        );
        let actionable = GENERATED_CENSUS
            .lines()
            .filter(|line| line.split('\t').nth(2) == Some("actionable"))
            .count();
        assert_eq!(actionable, residual);
    }

    #[test]
    fn residual_only_shrinks_against_the_base() {
        let Some(base) = base_residual() else {
            return;
        };
        let growth = residual_growth(&residual_rows(&base), &residual_rows(COMMITTED_RESIDUAL));
        assert!(
            growth.is_empty(),
            "the actionable residual may only shrink: {growth:#?}"
        );
    }

    #[test]
    fn shrink_check_rejects_an_added_row_and_a_weakened_cause() {
        let base = residual_rows("# h\na\tf\tasync_function\na\tg\tconstant_value\n");
        let added =
            residual_rows("# h\na\tf\tasync_function\na\tg\tconstant_value\nb\th\ttype_value\n");
        assert_eq!(
            residual_growth(&base, &added),
            vec!["added b\th\ttype_value".to_string()]
        );
        let weakened =
            residual_rows("# h\na\tf\tskip:extension_policy_skip\na\tg\tconstant_value\n");
        assert_eq!(residual_growth(&base, &weakened).len(), 1);
        let shrunk = residual_rows("# h\na\tg\tconstant_value\n");
        assert!(residual_growth(&base, &shrunk).is_empty());
    }

    #[test]
    #[should_panic(expected = "duplicate residual row")]
    fn rejects_a_duplicate_row() {
        residual_rows("# h\na\tf\tasync_function\na\tf\tasync_function\n");
    }

    #[test]
    fn renders_only_actionable_rows_in_order() {
        let rows = [
            row("a", "f", Status::Generated),
            row("a", "g", Status::Actionable("async_function".to_string())),
            row("b", "h", Status::ByDesign("browser_runtime: x".to_string())),
        ];
        assert_eq!(
            render_residual(&rows),
            "# package\texport\tcause\na\tg\tasync_function\n"
        );
    }
}

mod by_design {
    use super::*;

    #[test]
    fn committed_table_parses_and_every_reason_names_a_class() {
        let table = parse_by_design(COMMITTED_BY_DESIGN).unwrap();
        assert!(!table.is_empty());
        for reason in table.values() {
            let class = reason.split_once(": ").unwrap().0;
            assert!(BY_DESIGN_CLASSES.iter().any(|(name, _)| *name == class));
        }
    }

    #[test]
    fn rejects_lowering_causes_dressed_as_reasons() {
        for reason in [
            "browser_runtime: async API",
            "browser_runtime: takes a callback",
            "browser_runtime: optional fields",
            "browser_runtime: not re-exported at the crate root",
            "browser_runtime: hard to lower",
            "browser_runtime: no Rust implementation",
            "javascript_runtime: a generic function",
        ] {
            assert!(validate_reason(reason).is_err(), "{reason} must be refused");
        }
    }

    #[test]
    fn rejects_an_unknown_class_and_empty_prose() {
        assert!(validate_reason("too_complex: reasons").is_err());
        assert!(validate_reason("browser_runtime: ").is_err());
        assert!(validate_reason("browser_runtime").is_err());
        assert!(validate_reason("browser_runtime: draws through a Canvas 2D context").is_ok());
    }

    #[test]
    fn rejects_a_duplicate_row() {
        let text = "a\tf\tbrowser_runtime: x y\na\tf\tbrowser_runtime: x y\n";
        assert!(parse_by_design(text).is_err());
    }

    #[test]
    fn rejects_a_row_that_covers_no_ungenerated_value() {
        let table = parse_by_design("a\tf\tbrowser_runtime: x y\n").unwrap();
        let rows = [row("a", "f", Status::Generated)];
        assert!(check_by_design_coverage(&rows, &table).is_err());
        let rows = [row(
            "a",
            "f",
            Status::ByDesign("browser_runtime: x y".to_string()),
        )];
        assert!(check_by_design_coverage(&rows, &table).is_ok());
    }
}

mod discovery {
    use super::*;

    fn fixture(name: &str, files: &[(&str, &str)]) -> std::path::PathBuf {
        let root = std::env::temp_dir()
            .join("flight-ffi-root-census")
            .join(name);
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        for (file, content) in files {
            std::fs::write(root.join(file), content).unwrap();
        }
        return root;
    }

    #[test]
    fn follows_braced_globbed_and_renamed_reexports() {
        let root = fixture(
            "reexports",
            &[
                (
                    "lib.rs",
                    "mod a;\nmod b;\nmod c;\npub use a::{\n    alpha,\n    Beta,\n};\npub use crate::b::*;\npub use c::gamma as delta;\n",
                ),
                (
                    "a.rs",
                    "pub fn alpha() {}\npub struct Beta;\npub fn hidden() {}\n",
                ),
                (
                    "b.rs",
                    "pub fn bravo() {}\npub struct Bravo;\nfn private() {}\n",
                ),
                ("c.rs", "pub fn gamma() {}\n"),
            ],
        );
        let exports = collect_module_exports(&root, &root.join("lib.rs"));
        assert_eq!(
            exports.functions,
            BTreeSet::from(["alpha", "bravo", "delta"].map(String::from))
        );
        assert_eq!(
            exports.types,
            BTreeSet::from(["Beta", "Bravo"].map(String::from))
        );
    }

    #[test]
    fn decides_library_files_from_module_declarations_not_names() {
        let root = fixture(
            "library",
            &[
                (
                    "lib.rs",
                    "mod hit_tests;\nmod register_text_hit_test;\n#[cfg(test)]\nmod hit_tests_test;\n",
                ),
                ("hit_tests.rs", ""),
                ("register_text_hit_test.rs", ""),
                ("hit_tests_test.rs", ""),
                ("stray.rs", ""),
            ],
        );
        assert!(is_library_source(&root, "lib.rs"));
        assert!(is_library_source(&root, "hit_tests.rs"));
        assert!(is_library_source(&root, "register_text_hit_test.rs"));
        assert!(!is_library_source(&root, "hit_tests_test.rs"));
        assert!(!is_library_source(&root, "stray.rs"));
    }
}

#[test]
fn census_covers_the_named_omissions() {
    let census: BTreeMap<(String, String), String> = GENERATED_CENSUS
        .lines()
        .skip(2)
        .map(|line| {
            let fields: Vec<&str> = line.split('\t').collect();
            (
                (fields[0].to_string(), fields[1].to_string()),
                fields[2].to_string(),
            )
        })
        .collect();
    // Functions behind lib-level `pub use` globs and braced lists in flight-input and flight-swf
    // are discovered: each crate has generated values, and none is left undiscovered.
    for package in ["input", "swf"] {
        assert!(
            census
                .iter()
                .any(|((owner, _), class)| owner == package && class == "generated"),
            "{package} must have generated root values"
        );
    }
    assert!(
        !GENERATED_CENSUS.contains("\tundiscovered_function"),
        "no root function may be left undiscovered"
    );
}
