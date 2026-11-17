//! Pins the public-lane perimeter build.rs applies to generic carriers: the TypeScript export graph
//! reader against focused module fixtures and the checked-in package roots, and the disposer
//! allowlist.

#[path = "../public_perimeter.rs"]
mod public_perimeter;

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use public_perimeter::{collect_ts_module_exports, get_export_key, is_disposer_function};

mod collect_ts_module_exports {
    use super::*;

    #[test]
    fn follows_relative_star_chains_through_every_module_form() {
        let root = create_fixture(
            "star_chains",
            &[
                (
                    "index.ts",
                    "export * from './first.ts';\nexport * from './second';\nexport * from './nested';\n",
                ),
                ("first.ts", "export function firstValue() {}\n"),
                ("second.ts", "export * from './third.js';\n"),
                ("third.ts", "export const thirdValue = 1;\n"),
                ("nested/index.ts", "export class NestedValue {}\n"),
            ],
        );
        assert_eq!(
            read_names(&root),
            names(&["NestedValue", "firstValue", "thirdValue"])
        );
    }

    #[test]
    fn ignores_comments_strings_and_module_paths_as_identifiers() {
        let root = create_fixture(
            "comments_and_paths",
            &[(
                "index.ts",
                "// export function ghostLine() {}\n/* export { ghostBlock } */\nconst label = 'export function ghostString';\nconst flag = settings.export;\nexport * from './getMissingModule.ts';\nexport { realValue } from './realValue.ts';\n",
            )],
        );
        assert_eq!(read_names(&root), names(&["realValue"]));
    }

    #[test]
    fn reads_declarations_and_skips_type_and_default_exports() {
        let root = create_fixture(
            "declarations",
            &[(
                "index.ts",
                "export function plainFunction() {}\nexport async function asyncFunction() {}\nexport function* generatorFunction() {}\nexport declare function declaredFunction(): void;\nexport const constant = 1;\nexport let variable = 2;\nexport const enum ConstKind { A }\nexport enum Kind { B }\nexport class Shape {}\nexport interface ShapeLike {}\nexport type ShapeAlias = Shape;\nexport type { HiddenType } from './types.ts';\nexport default function defaultFunction() {}\n",
            )],
        );
        assert_eq!(
            read_names(&root),
            names(&[
                "ConstKind",
                "Kind",
                "Shape",
                "asyncFunction",
                "constant",
                "declaredFunction",
                "generatorFunction",
                "plainFunction",
                "variable",
            ])
        );
    }

    #[test]
    fn reads_the_exported_spelling_of_aliased_specifiers() {
        let root = create_fixture(
            "aliases",
            &[(
                "index.ts",
                "const local = 1;\nexport { local as publicName, type TypeOnly, kept };\nexport { innerName as outerName } from './inner.ts';\nexport { PackageKind } from '@flighthq/other/contract';\nexport * as namespaceName from './inner.ts';\nexport * from '@flighthq/other';\n",
            )],
        );
        assert_eq!(
            read_names(&root),
            names(&[
                "PackageKind",
                "kept",
                "namespaceName",
                "outerName",
                "publicName"
            ])
        );
    }

    #[test]
    fn stops_at_cycles() {
        let root = create_fixture(
            "cycles",
            &[
                ("index.ts", "export * from './a.ts';\n"),
                (
                    "a.ts",
                    "export * from './b.ts';\nexport function fromA() {}\n",
                ),
                (
                    "b.ts",
                    "export * from './a.ts';\nexport * from './index.ts';\nexport function fromB() {}\n",
                ),
            ],
        );
        let (exports, files) = collect_ts_module_exports(&root.join("index.ts"));
        assert_eq!(exports, names(&["fromA", "fromB"]));
        assert_eq!(files.len(), 3);
    }

    #[test]
    fn reads_the_checked_in_package_roots() {
        let packages = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages");
        let scene2d_formats = read_keys(&packages.join("scene2d-formats/src/index.ts"));
        // Public through `export * from './riveCoreTypeCensus.ts'`.
        assert!(scene2d_formats.contains(&get_export_key("collect_rive_core_type_counts")));
        let buffer = read_keys(&packages.join("buffer/src/index.ts"));
        assert!(buffer.contains(&get_export_key("create_byte_reader")));
        assert!(!buffer.contains(&get_export_key("get_array_buffer_storage")));
        assert!(!buffer.contains(&get_export_key("create_blob")));
    }

    fn read_keys(index: &Path) -> BTreeSet<String> {
        let (exports, _) = collect_ts_module_exports(index);
        return exports.iter().map(|name| get_export_key(name)).collect();
    }
}

mod get_export_key {
    use super::*;

    #[test]
    fn matches_snake_case_to_camel_case_across_acronyms_and_digits() {
        assert_eq!(
            get_export_key("reveal_scene3d_resources_on_resolve"),
            get_export_key("revealScene3DResourcesOnResolve")
        );
        assert_eq!(
            get_export_key("get_u64_count"),
            get_export_key("getU64Count")
        );
        assert_ne!(get_export_key("get_blob"), get_export_key("getBlobs"));
    }
}

mod is_disposer_function {
    use super::*;

    #[test]
    fn requires_an_allowlisted_name_without_callback_parameters() {
        let mappable = ["&Ref<Scene3DResourceResolver>", "&Scene3D", "&TweenManager"];
        assert!(is_disposer_function(
            "reveal_scene3d_resources_on_resolve",
            &mappable
        ));
        // A disposer-shaped return with mappable parameters is not enough on its own.
        assert!(!is_disposer_function("start_fake_watch", &mappable));
        assert!(!is_disposer_function(
            "reveal_scene3d_resources_on_resolve",
            &["&Scene3D", "Arc<dyn Fn() -> f64 + Send + Sync>"]
        ));
    }
}

fn create_fixture(name: &str, files: &[(&str, &str)]) -> PathBuf {
    let root = Path::new(env!("CARGO_TARGET_TMPDIR"))
        .join("public_perimeter")
        .join(name);
    let _ = fs::remove_dir_all(&root);
    for (path, text) in files {
        let path = root.join(path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }
    return root;
}

fn names(values: &[&str]) -> BTreeSet<String> {
    return values.iter().map(|value| value.to_string()).collect();
}

fn read_names(root: &Path) -> BTreeSet<String> {
    let (exports, _) = collect_ts_module_exports(&root.join("index.ts"));
    return exports;
}
