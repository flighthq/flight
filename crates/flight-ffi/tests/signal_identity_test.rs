//! Pins how build.rs identifies a signal payload type: by its canonical definition (crate, module
//! and item). Spellings unify only through real `use`/`pub use` bindings, same-named types stay
//! distinct, and a path no definition backs is an error rather than a guess.

#[path = "../signal_identity.rs"]
mod signal_identity;

use std::collections::{BTreeMap, BTreeSet};

use signal_identity::{
    CrateIndex, PayloadIdentity, check_payload_identities, display_type_text, index_crate,
    resolve_payload, type_parameter_names,
};

mod check_payload_identities {
    use super::*;

    #[test]
    fn accepts_one_identity_per_payload_name() {
        let payloads = BTreeMap::from([(
            "KeyboardEventData".to_string(),
            BTreeSet::from([z_identity(
                "flight-interaction",
                "types",
                "KeyboardEventData",
            )]),
        )]);
        assert_eq!(check_payload_identities(&payloads, z_stem), Ok(()));
    }

    #[test]
    fn rejects_distinct_types_that_share_a_name_and_names_both_origins() {
        let payloads = BTreeMap::from([(
            "Event".to_string(),
            BTreeSet::from([
                z_identity("flight-alpha", "", "Event"),
                z_identity("flight-beta", "", "Event"),
            ]),
        )]);
        let error = check_payload_identities(&payloads, z_stem).unwrap_err();
        assert!(
            error.contains("flight-alpha::Event and flight-beta::Event"),
            "{error}"
        );
    }

    #[test]
    fn rejects_two_payloads_that_would_share_a_wrapper_stem() {
        let payloads = BTreeMap::from([
            ("Event".to_string(), BTreeSet::new()),
            ("EVENT".to_string(), BTreeSet::new()),
        ]);
        let error = check_payload_identities(&payloads, z_stem).unwrap_err();
        assert!(error.contains("wrapper stem `event`"), "{error}");
    }
}

mod display_type_text {
    use super::*;

    #[test]
    fn reduces_paths_to_names_for_field_shapes() {
        let ty = z_type("Option<Ref<flight_signals::Signal<crate::types::KeyboardEventData>>>");
        assert_eq!(
            display_type_text(&ty).unwrap(),
            "Option<Ref<Signal<KeyboardEventData>>>"
        );
    }

    #[test]
    fn renders_trait_objects_structurally_and_rejects_unsupported_forms() {
        let ty = z_type("Arc<dyn Fn(&Ref<TrayIcon>) -> Option<Signal<TrayEvent>> + Send + Sync>");
        assert_eq!(
            display_type_text(&ty).unwrap(),
            "Arc<dyn Fn(&Ref<TrayIcon>) -> Option<Signal<TrayEvent>> + Send + Sync>"
        );
        assert!(
            display_type_text(&z_type("_"))
                .unwrap_err()
                .contains("unsupported type form")
        );
    }
}

mod index_crate {
    use super::*;

    #[test]
    fn records_definitions_children_bindings_and_inline_modules_per_module() {
        let index = z_index(&[(
            "flight-probe",
            &[
                (
                    "",
                    "pub mod types; mod hidden; pub use types::{self, Event as Renamed}; use crate::hidden::*;",
                ),
                (
                    "types",
                    "pub struct Event; enum Kind { A } pub union Bits { x: u8 } pub type Alias = Event; pub mod inner { pub struct Deep; }",
                ),
            ],
        )]);
        let krate = &index["flight-probe"];
        let root = &krate.modules[""];
        assert_eq!(
            root.children,
            BTreeSet::from(["hidden", "types"].map(String::from))
        );
        let bindings: Vec<(&str, Vec<&str>, bool)> = root
            .uses
            .iter()
            .map(|binding| {
                (
                    binding.name.as_str(),
                    binding.path.iter().map(String::as_str).collect(),
                    binding.public,
                )
            })
            .collect();
        assert_eq!(
            bindings,
            [
                ("types", vec!["types"], true),
                ("Renamed", vec!["types", "Event"], true),
            ]
        );
        assert_eq!(root.globs.len(), 1);
        assert!(!root.globs[0].public);
        assert_eq!(
            krate.modules["types"].types,
            BTreeSet::from(["Alias", "Bits", "Event", "Kind"].map(String::from))
        );
        assert_eq!(
            krate.modules["types::inner"].types,
            BTreeSet::from(["Deep".to_string()])
        );
    }
}

mod resolve_payload {
    use super::*;

    #[test]
    fn a_crate_root_spelling_resolves_only_through_a_real_reexport() {
        let index = z_fixture();
        let canonical = z_identity("flight-input", "types", "InputPointerData");
        assert_eq!(
            z_resolve(
                &index,
                "flight-interaction",
                "",
                "flight_input::InputPointerData"
            ),
            Ok(BTreeSet::from([canonical.clone()]))
        );
        assert_eq!(
            z_resolve(&index, "flight-input", "", "crate::types::InputPointerData"),
            Ok(BTreeSet::from([canonical]))
        );
        let internal = z_resolve(
            &index,
            "flight-interaction",
            "",
            "flight_input::InternalOnly",
        );
        assert!(
            internal
                .unwrap_err()
                .contains("not defined in, imported into, or re-exported by `flight-input`")
        );
    }

    #[test]
    fn distinct_same_named_imports_resolve_to_distinct_identities() {
        let index = z_fixture();
        let alpha = z_resolve(&index, "flight-interaction", "uses_alpha", "Event").unwrap();
        let beta = z_resolve(&index, "flight-interaction", "uses_beta", "Event").unwrap();
        assert_eq!(
            alpha,
            BTreeSet::from([z_identity("flight-alpha", "", "Event")])
        );
        assert_eq!(
            beta,
            BTreeSet::from([z_identity("flight-beta", "", "Event")])
        );
        let merged = BTreeMap::from([("Event".to_string(), alpha.union(&beta).cloned().collect())]);
        assert!(check_payload_identities(&merged, z_stem).is_err());
    }

    #[test]
    fn inline_module_definitions_resolve_to_their_inline_module() {
        let index = z_fixture();
        let expected = BTreeSet::from([z_identity("flight-interaction", "host::inner", "Hidden")]);
        for (module, spelling) in [
            ("", "crate::host::inner::Hidden"),
            ("", "host::inner::Hidden"),
            ("host", "inner::Hidden"),
            ("host", "self::inner::Hidden"),
        ] {
            assert_eq!(
                z_resolve(&index, "flight-interaction", module, spelling),
                Ok(expected.clone()),
                "{module}: {spelling}"
            );
        }
    }

    #[test]
    fn private_imports_are_visible_only_to_their_module_and_its_descendants() {
        let index = z_fixture();
        let alpha = Ok(BTreeSet::from([z_identity("flight-alpha", "", "Event")]));
        assert_eq!(
            z_resolve(&index, "flight-interaction", "scoped::leaf", "super::Event"),
            alpha
        );
        assert_eq!(
            z_resolve(
                &index,
                "flight-interaction",
                "scoped::leaf",
                "crate::scoped::Event"
            ),
            alpha
        );
        for spelling in [
            "uses_alpha::Event",
            "uses_glob::KeyboardEventData",
            "scoped::Event",
        ] {
            assert!(
                z_resolve(&index, "flight-interaction", "", spelling)
                    .unwrap_err()
                    .contains("not defined in, imported into"),
                "{spelling}"
            );
        }
    }

    #[test]
    fn qualified_and_unqualified_spellings_share_one_canonical_identity() {
        let index = z_fixture();
        let expected = Ok(BTreeSet::from([z_identity(
            "flight-interaction",
            "types",
            "KeyboardEventData",
        )]));
        for (module, spelling) in [
            ("", "KeyboardEventData"),
            ("", "crate::types::KeyboardEventData"),
            ("", "types::KeyboardEventData"),
            ("", "flight_interaction::KeyboardEventData"),
            ("uses_glob", "KeyboardEventData"),
            ("uses_named", "KeyboardEventData"),
            ("uses_self", "types::KeyboardEventData"),
            ("types", "KeyboardEventData"),
        ] {
            assert_eq!(
                z_resolve(&index, "flight-interaction", module, spelling),
                expected,
                "{module}: {spelling}"
            );
        }
    }

    #[test]
    fn rejects_an_ambiguous_glob_and_a_name_nothing_brings_into_scope() {
        let index = z_fixture();
        let ambiguous = z_resolve(&index, "flight-interaction", "uses_both", "Event");
        assert!(ambiguous.unwrap_err().contains("through several globs"));
        let unscoped = z_resolve(
            &index,
            "flight-interaction",
            "uses_alpha",
            "InputPointerData",
        );
        assert!(
            unscoped
                .unwrap_err()
                .contains("not defined in, imported into")
        );
    }

    #[test]
    fn rejects_unknown_flight_crates_and_types() {
        let index = z_fixture();
        let crate_error = z_resolve(&index, "flight-interaction", "", "flight_nowhere::Event");
        assert!(
            crate_error
                .unwrap_err()
                .contains("no Flight crate `flight-nowhere`")
        );
        let type_error = z_resolve(&index, "flight-interaction", "", "flight_input::Missing");
        assert!(type_error.unwrap_err().contains("not defined in"));
        let module_error = z_resolve(
            &index,
            "flight-interaction",
            "",
            "flight_input::events::InputPointerData",
        );
        assert!(module_error.unwrap_err().contains("not a module of"));
    }

    #[test]
    fn rejects_unknown_local_qualified_paths() {
        let index = z_fixture();
        for spelling in [
            "crate::types::Missing",
            "crate::missing::KeyboardEventData",
            "self::types::Missing",
            "missing::KeyboardEventData",
        ] {
            assert!(
                z_resolve(&index, "flight-interaction", "", spelling).is_err(),
                "{spelling}"
            );
        }
    }

    #[test]
    fn repeated_super_and_self_normalize_from_the_current_module_and_never_leave_the_crate() {
        let index = z_fixture();
        let expected = Ok(BTreeSet::from([z_identity(
            "flight-interaction",
            "types",
            "KeyboardEventData",
        )]));
        for spelling in [
            "super::super::types::KeyboardEventData",
            "self::super::super::types::KeyboardEventData",
            "super::self::super::types::KeyboardEventData",
        ] {
            assert_eq!(
                z_resolve(&index, "flight-interaction", "nested::child", spelling),
                expected,
                "{spelling}"
            );
        }
        let escaped = z_resolve(
            &index,
            "flight-interaction",
            "nested::child",
            "super::super::super::types::KeyboardEventData",
        );
        assert!(escaped.unwrap_err().contains("leaves the crate root"));
    }

    #[test]
    fn resolves_and_rejects_through_every_nested_type_form() {
        let index = z_fixture();
        let both = Ok(BTreeSet::from([
            z_identity("flight-input", "types", "InputPointerData"),
            z_identity("flight-interaction", "types", "KeyboardEventData"),
        ]));
        for spelling in [
            "(KeyboardEventData, [InputPointerData; 2])",
            "Option<(&[KeyboardEventData], *const InputPointerData)>",
            "fn(&KeyboardEventData) -> Ref<InputPointerData>",
            "Arc<dyn Fn(&KeyboardEventData) -> InputPointerData + Send + Sync>",
            "Box<impl Fn(KeyboardEventData, InputPointerData)>",
        ] {
            assert_eq!(
                z_resolve(&index, "flight-interaction", "uses_named", spelling),
                both,
                "{spelling}"
            );
        }
        for spelling in [
            "Option<(Ref<Missing>, u32)>",
            "[Missing; 2]",
            "&[Missing]",
            "*const Missing",
            "fn(Missing) -> u32",
            "Arc<dyn Fn(&Missing)>",
            "Box<impl Fn() -> Missing>",
        ] {
            assert!(
                z_resolve(&index, "flight-interaction", "uses_named", spelling).is_err(),
                "{spelling}"
            );
        }
        let unsupported = z_resolve(
            &index,
            "flight-interaction",
            "uses_named",
            "<KeyboardEventData as Trait>::Output",
        );
        assert!(unsupported.unwrap_err().contains("unsupported type form"));
    }

    #[test]
    fn same_named_types_in_different_modules_of_one_crate_stay_distinct() {
        let index = z_fixture();
        let a = z_resolve(&index, "flight-interaction", "", "crate::a::Event").unwrap();
        let b = z_resolve(&index, "flight-interaction", "", "crate::b::Event").unwrap();
        assert_eq!(
            a,
            BTreeSet::from([z_identity("flight-interaction", "a", "Event")])
        );
        assert_eq!(
            b,
            BTreeSet::from([z_identity("flight-interaction", "b", "Event")])
        );
        let merged = BTreeMap::from([("Event".to_string(), a.union(&b).cloned().collect())]);
        let error = check_payload_identities(&merged, z_stem).unwrap_err();
        assert!(
            error.contains("flight-interaction::a::Event and flight-interaction::b::Event"),
            "{error}"
        );
    }

    #[test]
    fn treats_the_enclosing_item_type_parameters_as_non_nominal() {
        let index = z_fixture();
        let holder = z_parse("pub struct Holder<T> { pub on: Signal<T> }");
        let syn::Item::Struct(holder) = &holder.items[0] else {
            unreachable!()
        };
        let generics = type_parameter_names(&holder.generics);
        assert_eq!(generics, BTreeSet::from(["T".to_string()]));
        let (text, identities) =
            resolve_payload(&z_type("T"), &index, "flight-interaction", "", &generics).unwrap();
        assert_eq!(text, "T");
        assert!(identities.is_empty());
        let unbound = resolve_payload(
            &z_type("T"),
            &index,
            "flight-interaction",
            "",
            &BTreeSet::new(),
        );
        assert!(
            unbound.is_err(),
            "a parameter the item does not declare is not generic"
        );
    }

    #[test]
    fn use_path_self_binds_the_module_name() {
        let index = z_fixture();
        assert_eq!(
            z_resolve(
                &index,
                "flight-interaction",
                "uses_self",
                "types::KeyboardEventData"
            ),
            Ok(BTreeSet::from([z_identity(
                "flight-interaction",
                "types",
                "KeyboardEventData"
            )]))
        );
        let unbound = z_resolve(&index, "flight-interaction", "uses_self", "self::Missing");
        assert!(unbound.is_err());
    }
}

// Two external crates that each define `Event`, an input crate with a root re-export and an
// internal-only type, and an interaction crate whose modules exercise every resolution rule.
fn z_fixture() -> BTreeMap<String, CrateIndex> {
    return z_index(&[
        ("flight-alpha", &[("", "pub struct Event;")]),
        ("flight-beta", &[("", "pub struct Event;")]),
        (
            "flight-input",
            &[
                ("", "mod types; pub use types::InputPointerData;"),
                (
                    "types",
                    "pub struct InputPointerData; pub struct InternalOnly;",
                ),
            ],
        ),
        (
            "flight-interaction",
            &[
                (
                    "",
                    "pub mod types; pub use types::*; mod a; mod b; mod nested; mod host; mod scoped; mod uses_alpha; mod uses_beta; mod uses_both; mod uses_glob; mod uses_named; mod uses_self;",
                ),
                ("types", "pub struct KeyboardEventData;"),
                ("a", "pub struct Event;"),
                ("b", "pub struct Event;"),
                ("nested", "pub mod child;"),
                ("nested::child", ""),
                ("host", "pub mod inner { pub struct Hidden; }"),
                ("scoped", "use flight_alpha::Event; mod leaf;"),
                ("scoped::leaf", ""),
                ("uses_alpha", "use flight_alpha::Event;"),
                ("uses_beta", "use flight_beta::*;"),
                ("uses_both", "use flight_alpha::*; use flight_beta::*;"),
                ("uses_glob", "use crate::types::*;"),
                (
                    "uses_named",
                    "use crate::types::KeyboardEventData; use flight_input::InputPointerData;",
                ),
                ("uses_self", "use crate::types::{self};"),
            ],
        ),
    ]);
}

fn z_identity(krate: &str, module: &str, name: &str) -> PayloadIdentity {
    return PayloadIdentity {
        krate: krate.to_string(),
        module: module.to_string(),
        name: name.to_string(),
    };
}

fn z_index(crates: &[(&str, &[(&str, &str)])]) -> BTreeMap<String, CrateIndex> {
    return crates
        .iter()
        .map(|(krate, files)| {
            let parsed: Vec<(String, syn::File)> = files
                .iter()
                .map(|(module, source)| (module.to_string(), z_parse(source)))
                .collect();
            (krate.to_string(), index_crate(&parsed))
        })
        .collect();
}

fn z_parse(source: &str) -> syn::File {
    return syn::parse_file(source).unwrap();
}

// Resolves `payload` as written in `krate::module`.
fn z_resolve(
    index: &BTreeMap<String, CrateIndex>,
    krate: &str,
    module: &str,
    payload: &str,
) -> Result<BTreeSet<PayloadIdentity>, String> {
    return resolve_payload(&z_type(payload), index, krate, module, &BTreeSet::new())
        .map(|(_, identities)| identities);
}

fn z_stem(payload: &str) -> String {
    return payload.to_lowercase();
}

fn z_type(source: &str) -> syn::Type {
    return syn::parse_str(source).unwrap();
}
