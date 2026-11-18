//! Pins the public-lane perimeter build.rs applies to generic carriers: the TypeScript export graph
//! reader against focused module fixtures and the checked-in package roots, and the disposer
//! allowlist.

#[path = "../public_perimeter.rs"]
mod public_perimeter;

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use public_perimeter::{
    collect_ts_external_reexports, collect_ts_module_exports, get_export_key, is_disposer_function,
};

mod collect_ts_external_reexports {
    use super::*;

    #[test]
    fn reads_only_named_values_promoted_from_the_requested_contract() {
        let root = create_fixture(
            "external_reexports",
            &[(
                "index.ts",
                "export { initializeFontResource, initializeGlyphRasterizerBackendFromGlyphOutlineSource as initializeGlyphBackend, type FontResource, default as defaultFont } from '@flighthq/font/contract';\nexport { initializeOther } from '@flighthq/other/contract';\nexport * from '@flighthq/font/contract';\n",
            )],
        );
        assert_eq!(
            collect_ts_external_reexports(&root.join("index.ts"), "@flighthq/font/contract"),
            names(&[
                "initializeFontResource",
                "initializeGlyphRasterizerBackendFromGlyphOutlineSource",
            ])
        );
    }
}

mod collect_ts_module_exports {
    use super::*;

    #[test]
    fn follows_relative_star_chains_through_every_module_form() {
        let root = create_fixture(
            "star_chains",
            &[
                (
                    "index.ts",
                    "export * from './first.ts';\nexport * from './second';\nexport * from './nested';\nexport * from './view.tsx';\nexport * from './widget';\n",
                ),
                ("first.ts", "export function firstValue() {}\n"),
                ("second.ts", "export * from './third.js';\n"),
                ("third.ts", "export const thirdValue = 1;\n"),
                ("nested/index.ts", "export class NestedValue {}\n"),
                ("view.tsx", "export function viewValue() {}\n"),
                ("widget.tsx", "export function widgetValue() {}\n"),
            ],
        );
        assert_eq!(
            read_names(&root),
            names(&[
                "NestedValue",
                "firstValue",
                "thirdValue",
                "viewValue",
                "widgetValue"
            ])
        );
    }

    #[test]
    fn ignores_comments_strings_and_module_paths_as_identifiers() {
        let root = create_fixture(
            "comments_and_paths",
            &[
                (
                    "index.ts",
                    "// export function ghostLine() {}\n/* export { ghostBlock } */\nconst label = 'export function ghostString';\nconst flag = settings.export;\nexport * from './getMissingModule.ts';\nexport { realValue } from './realValue.ts';\n",
                ),
                ("realValue.ts", "export function realValue() {}\n"),
            ],
        );
        assert_eq!(read_names(&root), names(&["realValue"]));
    }

    #[test]
    fn reads_every_declared_value_and_skips_type_and_default_exports() {
        let root = create_fixture(
            "declarations",
            &[(
                "index.ts",
                "export function plainFunction() {}\nexport async function asyncFunction() {}\nexport function* generatorFunction() {}\nexport declare function declaredFunction(): void;\nexport const first = 1, second = (a: number, b: number) => a < b, third: Map<string, number> = new Map();\nexport let variable = 2;\nexport const { left, right: renamed, nested: [deep] } = pair;\nexport const enum ConstKind { A }\nexport enum Kind { B }\nexport class Shape {}\nexport interface ShapeLike {}\nexport type ShapeAlias = Shape;\nexport type { HiddenType } from './types.ts';\nexport default function defaultFunction() {}\n",
            )],
        );
        assert_eq!(
            read_names(&root),
            names(&[
                "ConstKind",
                "Kind",
                "Shape",
                "asyncFunction",
                "declaredFunction",
                "deep",
                "first",
                "generatorFunction",
                "left",
                "plainFunction",
                "renamed",
                "second",
                "third",
                "variable",
            ])
        );
    }

    #[test]
    fn applies_relative_aliases_only_to_real_value_exports() {
        let root = create_fixture(
            "relative_aliases",
            &[
                (
                    "index.ts",
                    "import { inner as importedInner, type InnerType } from './inner.ts';\nimport type { innerToo } from './inner.ts';\nimport { createBlob } from './inner';\nconst local = 1;\nexport { local as publicName, undeclared, importedInner as reexported, InnerType, innerToo };\nexport { inner as outer, InnerType as visibleType, missing as ghost, default as defaulted, type inner as typedInner } from './inner.ts';\nexport * as innerNamespace from './inner.ts';\nexport { createBlob };\n",
                ),
                (
                    "inner.ts",
                    "export function inner() {}\nexport function innerToo() {}\nexport type InnerType = number;\nexport default function defaultInner() {}\n",
                ),
            ],
        );
        // `innerToo` is re-exported through `import type`, so it is a type export here.
        assert_eq!(
            read_names(&root),
            names(&["innerNamespace", "outer", "publicName", "reexported"])
        );
        let (_, files) = collect_ts_module_exports(&root.join("index.ts"));
        assert!(files.iter().any(|file| file.ends_with("inner.ts")));
    }

    #[test]
    fn ignores_every_name_from_another_package() {
        // Each external name normalizes to a real Rust function key, so a leak would authorize it.
        let root = create_fixture(
            "external_sources",
            &[(
                "index.ts",
                "import { getArrayBufferStorage } from '@flighthq/buffer';\nimport * as rive from '@flighthq/scene2d-formats';\nexport { getArrayBufferStorage, rive };\nexport { createBlob, other as collectRiveCoreTypeCounts } from '@flighthq/buffer/contract';\nexport * as revealScene3DResourcesOnResolve from '@flighthq/scene3d-resources';\nexport * from '@flighthq/importdiagnostics';\n",
            )],
        );
        let exports = read_names(&root);
        assert!(exports.is_empty(), "{exports:?}");
        let keys: BTreeSet<String> = exports.iter().map(|name| get_export_key(name)).collect();
        for rust_name in [
            "get_array_buffer_storage",
            "create_blob",
            "collect_rive_core_type_counts",
            "reveal_scene3d_resources_on_resolve",
        ] {
            assert!(!keys.contains(&get_export_key(rust_name)));
        }
    }

    #[test]
    fn stops_at_cycles() {
        let root = create_fixture(
            "cycles",
            &[
                (
                    "index.ts",
                    "export * from './a.ts';\nexport { fromB as aliasB } from './b.ts';\n",
                ),
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
        assert_eq!(exports, names(&["aliasB", "fromA", "fromB"]));
        assert_eq!(files.len(), 3);
    }

    #[test]
    fn reads_the_checked_in_package_roots() {
        let packages = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages");
        assert_eq!(
            collect_ts_external_reexports(
                &packages.join("sdk/src/index.ts"),
                "@flighthq/font/contract"
            ),
            names(&[
                "_loadFontFaceFromBytes",
                "_loadFontFaceFromUrl",
                "_loadFontFaceFromUrls",
                "_loadFontFacesFromName",
                "initializeFontResource",
                "initializeGlyphRasterizerBackendFromGlyphOutlineSource",
            ])
        );
        let scene2d_formats = read_keys(&packages.join("scene2d-formats/src/index.ts"));
        // Public through `export * from './riveCoreTypeCensus.ts'`.
        assert!(scene2d_formats.contains(&get_export_key("collect_rive_core_type_counts")));
        assert!(scene2d_formats.contains(&get_export_key("collect_svg_counts")));
        let buffer = read_keys(&packages.join("buffer/src/index.ts"));
        assert!(buffer.contains(&get_export_key("create_byte_reader")));
        assert!(!buffer.contains(&get_export_key("get_array_buffer_storage")));
        assert!(!buffer.contains(&get_export_key("create_blob")));
        let scene3d_resources = read_keys(&packages.join("scene3d-resources/src/index.ts"));
        assert!(scene3d_resources.contains(&get_export_key("reveal_scene3d_resources_on_resolve")));
        let skeleton2d_formats = read_keys(&packages.join("skeleton2d-formats/src/index.ts"));
        assert!(skeleton2d_formats.contains(&get_export_key("create_spine_binary_reader")));
        assert!(skeleton2d_formats.contains(&get_export_key("skip_spine_binary_curve_tag")));
        assert!(!skeleton2d_formats.contains(&get_export_key("report_spine_binary_crumb")));
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
    fn requires_an_allowlisted_name_and_rejects_unapproved_callback_capture() {
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
        assert!(is_disposer_function(
            "connect_signal_at_frame_rate",
            &["&Signal<FrameTick>", "f64", "Arc<dyn Fn(f64) + Send + Sync>"]
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
