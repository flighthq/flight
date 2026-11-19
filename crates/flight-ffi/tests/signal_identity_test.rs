//! Pins how build.rs identifies a signal payload type: by the crate and module that define it, so
//! equal spellings merge, distinct same-named types are rejected, and a path no definition backs
//! is an error rather than a guess.

#[path = "../signal_identity.rs"]
mod signal_identity;

use std::collections::{BTreeMap, BTreeSet};

use signal_identity::{
    CrateTypes, PayloadIdentity, TypeScope, check_payload_identities, collect_crate_types,
    collect_file_imports, display_type_text, resolve_payload, type_parameter_names,
};

mod check_payload_identities {
    use super::*;

    #[test]
    fn accepts_one_identity_per_payload_name() {
        let payloads = BTreeMap::from([(
            "KeyboardEventData".to_string(),
            BTreeSet::from([z_identity("flight-interaction", "KeyboardEventData")]),
        )]);
        assert_eq!(check_payload_identities(&payloads, z_stem), Ok(()));
    }

    #[test]
    fn rejects_distinct_types_that_share_a_name_and_names_both_origins() {
        let payloads = BTreeMap::from([(
            "Event".to_string(),
            BTreeSet::from([
                z_identity("flight-alpha", "Event"),
                z_identity("flight-beta", "Event"),
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

mod collect_crate_types {
    use super::*;

    #[test]
    fn reads_structs_enums_unions_and_aliases_per_module() {
        let types = collect_crate_types(&[
            (String::new(), z_parse("pub struct A; fn e() {}")),
            (
                "types".to_string(),
                z_parse("enum B { X } pub union C { x: u8 } pub type D = A;"),
            ),
        ]);
        assert_eq!(types.modules[""], BTreeSet::from(["A".to_string()]));
        assert_eq!(
            types.modules["types"],
            BTreeSet::from(["B", "C", "D"].map(String::from))
        );
    }
}

mod collect_file_imports {
    use super::*;

    #[test]
    fn records_absolute_paths_for_named_renamed_relative_and_glob_imports() {
        let file = z_parse(
            "use flight_input::{InputPointerData, PointerType as Kind};
             use crate::types::KeyboardEventData;
             use super::sibling::Probe;
             use flight_alpha::*;
             use crate::types::*;",
        );
        let (imports, globs) = collect_file_imports(&file, "flight-interaction", "nested::child");
        assert_eq!(
            imports["InputPointerData"],
            ["flight-input", "InputPointerData"]
        );
        assert_eq!(imports["Kind"], ["flight-input", "PointerType"]);
        assert_eq!(
            imports["KeyboardEventData"],
            ["flight-interaction", "types", "KeyboardEventData"]
        );
        assert_eq!(
            imports["Probe"],
            ["flight-interaction", "nested", "sibling", "Probe"]
        );
        assert_eq!(
            globs,
            [
                vec!["flight-alpha".to_string()],
                vec!["flight-interaction".to_string(), "types".to_string()]
            ]
        );
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

mod resolve_payload {
    use super::*;

    #[test]
    fn distinct_same_named_imports_resolve_to_distinct_identities() {
        let defined = z_defined();
        let alpha = z_identities("use flight_alpha::Event;", "Event", &defined).unwrap();
        let beta = z_identities("use flight_beta::Event;", "Event", &defined).unwrap();
        assert_eq!(alpha, BTreeSet::from([z_identity("flight-alpha", "Event")]));
        assert_eq!(beta, BTreeSet::from([z_identity("flight-beta", "Event")]));
        let merged = BTreeMap::from([("Event".to_string(), alpha.union(&beta).cloned().collect())]);
        assert!(check_payload_identities(&merged, z_stem).is_err());
    }

    #[test]
    fn qualified_and_unqualified_spellings_share_one_identity() {
        let defined = z_defined();
        let expected = BTreeSet::from([z_identity("flight-interaction", "KeyboardEventData")]);
        for (uses, spelling) in [
            ("use crate::types::*;", "KeyboardEventData"),
            ("use crate::types::KeyboardEventData;", "KeyboardEventData"),
            ("", "crate::types::KeyboardEventData"),
            ("use crate::types;", "types::KeyboardEventData"),
            ("", "flight_interaction::KeyboardEventData"),
        ] {
            assert_eq!(
                z_identities(uses, spelling, &defined).unwrap(),
                expected,
                "{spelling}"
            );
        }
        let input = BTreeSet::from([z_identity("flight-input", "InputPointerData")]);
        for (uses, spelling) in [
            ("", "flight_input::InputPointerData"),
            ("use flight_input::InputPointerData;", "InputPointerData"),
            ("use flight_input::*;", "Ref<InputPointerData>"),
        ] {
            assert_eq!(
                z_identities(uses, spelling, &defined).unwrap(),
                input,
                "{spelling}"
            );
        }
    }

    #[test]
    fn rejects_an_ambiguous_glob_and_a_name_nothing_brings_into_scope() {
        let defined = z_defined();
        let ambiguous = z_identities(
            "use flight_alpha::*; use flight_beta::*;",
            "Event",
            &defined,
        );
        assert!(
            ambiguous
                .unwrap_err()
                .contains("glob-imported from several modules")
        );
        let unscoped = z_identities("", "InputPointerData", &defined);
        assert!(
            unscoped
                .unwrap_err()
                .contains("not defined there, imported, or glob-imported")
        );
    }

    #[test]
    fn rejects_unknown_flight_crates_and_types() {
        let defined = z_defined();
        let crate_error = z_identities("", "flight_nowhere::Event", &defined).unwrap_err();
        assert!(
            crate_error.contains("defines no such type"),
            "{crate_error}"
        );
        let type_error = z_identities("", "flight_input::Missing", &defined).unwrap_err();
        assert!(type_error.contains("defines no such type"), "{type_error}");
        let module_error =
            z_identities("", "flight_input::types::KeyboardEventData", &defined).unwrap_err();
        assert!(
            module_error.contains("defines no such type"),
            "{module_error}"
        );
    }

    #[test]
    fn rejects_unknown_local_qualified_paths() {
        let defined = z_defined();
        for spelling in [
            "crate::types::Missing",
            "crate::missing::KeyboardEventData",
            "self::types::Missing",
        ] {
            let error = z_identities("", spelling, &defined).unwrap_err();
            assert!(
                error.contains("defines no such type"),
                "{spelling}: {error}"
            );
        }
        let unrooted = z_identities("", "types::KeyboardEventData", &defined).unwrap_err();
        assert!(unrooted.contains("not rooted"), "{unrooted}");
    }

    #[test]
    fn resolves_and_rejects_through_every_nested_type_form() {
        let defined = z_defined();
        let uses = "use flight_input::InputPointerData; use crate::types::KeyboardEventData;";
        let both = BTreeSet::from([
            z_identity("flight-input", "InputPointerData"),
            z_identity("flight-interaction", "KeyboardEventData"),
        ]);
        for spelling in [
            "(KeyboardEventData, [InputPointerData; 2])",
            "Option<(&[KeyboardEventData], *const InputPointerData)>",
            "fn(&KeyboardEventData) -> Ref<InputPointerData>",
            "Arc<dyn Fn(&KeyboardEventData) -> InputPointerData + Send + Sync>",
            "Box<impl Fn(KeyboardEventData, InputPointerData)>",
        ] {
            assert_eq!(
                z_identities(uses, spelling, &defined).unwrap(),
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
                z_identities(uses, spelling, &defined).is_err(),
                "{spelling}"
            );
        }
        let unsupported = z_identities(uses, "<KeyboardEventData as Trait>::Output", &defined);
        assert!(unsupported.unwrap_err().contains("unsupported type form"));
    }

    #[test]
    fn treats_the_enclosing_item_type_parameters_as_non_nominal() {
        let defined = z_defined();
        let holder = z_parse("pub struct Holder<T> { pub on: Signal<T> }");
        let syn::Item::Struct(holder) = &holder.items[0] else {
            unreachable!()
        };
        let generics = type_parameter_names(&holder.generics);
        assert_eq!(generics, BTreeSet::from(["T".to_string()]));
        let imports = BTreeMap::new();
        let scope = z_scope(&defined, &imports, &[]);
        let (text, identities) = resolve_payload(&z_type("T"), &scope, &generics).unwrap();
        assert_eq!(text, "T");
        assert!(identities.is_empty());
        let unbound = resolve_payload(&z_type("T"), &scope, &BTreeSet::new());
        assert!(
            unbound.is_err(),
            "a parameter the item does not declare is not generic"
        );
    }
}

fn z_defined() -> BTreeMap<String, CrateTypes> {
    let crate_types = |modules: &[(&str, &[&str])]| CrateTypes {
        modules: modules
            .iter()
            .map(|(module, names)| {
                (
                    module.to_string(),
                    names.iter().map(|name| name.to_string()).collect(),
                )
            })
            .collect(),
    };
    return BTreeMap::from([
        ("flight-alpha".to_string(), crate_types(&[("", &["Event"])])),
        ("flight-beta".to_string(), crate_types(&[("", &["Event"])])),
        (
            "flight-input".to_string(),
            crate_types(&[("", &[]), ("types", &["InputPointerData"])]),
        ),
        (
            "flight-interaction".to_string(),
            crate_types(&[("", &[]), ("types", &["KeyboardEventData"])]),
        ),
    ]);
}

// Resolves `payload` as written in `flight-interaction`'s root module with the given `use` items.
fn z_identities(
    uses: &str,
    payload: &str,
    defined: &BTreeMap<String, CrateTypes>,
) -> Result<BTreeSet<PayloadIdentity>, String> {
    let file = z_parse(uses);
    let (imports, globs) = collect_file_imports(&file, "flight-interaction", "");
    let scope = z_scope(defined, &imports, &globs);
    return resolve_payload(&z_type(payload), &scope, &BTreeSet::new())
        .map(|(_, identities)| identities);
}

fn z_identity(krate: &str, name: &str) -> PayloadIdentity {
    return PayloadIdentity {
        krate: krate.to_string(),
        name: name.to_string(),
    };
}

fn z_parse(source: &str) -> syn::File {
    return syn::parse_file(source).unwrap();
}

fn z_scope<'a>(
    defined: &'a BTreeMap<String, CrateTypes>,
    imports: &'a BTreeMap<String, Vec<String>>,
    globs: &'a [Vec<String>],
) -> TypeScope<'a> {
    return TypeScope {
        owner: "flight-interaction",
        module: "",
        imports,
        globs,
        defined,
    };
}

fn z_stem(payload: &str) -> String {
    return payload.to_lowercase();
}

fn z_type(source: &str) -> syn::Type {
    return syn::parse_str(source).unwrap();
}
