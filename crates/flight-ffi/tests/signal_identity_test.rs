//! Pins how build.rs identifies a signal payload type: by the crate that defines it, so equal
//! spellings merge and distinct same-named types are rejected.

#[path = "../signal_identity.rs"]
mod signal_identity;

use std::collections::{BTreeMap, BTreeSet};

use signal_identity::{
    PayloadIdentity, TypeScope, check_payload_identities, collect_defined_type_names,
    collect_file_imports, display_type_text, resolve_payload,
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

mod collect_defined_type_names {
    use super::*;

    #[test]
    fn reads_structs_enums_unions_and_aliases_at_any_visibility() {
        let file =
            z_parse("pub struct A; enum B { X } pub union C { x: u8 } pub type D = A; fn e() {}");
        assert_eq!(
            collect_defined_type_names(&[file]),
            BTreeSet::from(["A", "B", "C", "D"].map(String::from))
        );
    }
}

mod collect_file_imports {
    use super::*;

    #[test]
    fn maps_named_renamed_and_glob_imports_to_their_crates() {
        let file = z_parse(
            "use flight_input::{InputPointerData, PointerType as Kind};
             use crate::types::KeyboardEventData;
             use flight_alpha::*;
             use crate::types::*;",
        );
        let (imports, globs) = collect_file_imports(&file, "flight-interaction");
        assert_eq!(imports["InputPointerData"], "flight-input");
        assert_eq!(imports["Kind"], "flight-input");
        assert_eq!(imports["KeyboardEventData"], "flight-interaction");
        assert_eq!(globs, ["flight-alpha"]);
    }
}

mod display_type_text {
    use super::*;

    #[test]
    fn reduces_paths_to_names_for_field_shapes() {
        let ty = z_type("Option<Ref<flight_signals::Signal<crate::types::KeyboardEventData>>>");
        assert_eq!(
            display_type_text(&ty),
            "Option<Ref<Signal<KeyboardEventData>>>"
        );
    }
}

mod resolve_payload {
    use super::*;

    #[test]
    fn distinct_same_named_imports_resolve_to_distinct_identities() {
        let defined = z_defined();
        let alpha = z_identities("use flight_alpha::Event;", "Event", &defined);
        let beta = z_identities("use flight_beta::Event;", "Event", &defined);
        assert_eq!(alpha, BTreeSet::from([z_identity("flight-alpha", "Event")]));
        assert_eq!(beta, BTreeSet::from([z_identity("flight-beta", "Event")]));
        let merged = BTreeMap::from([("Event".to_string(), alpha.union(&beta).cloned().collect())]);
        assert!(check_payload_identities(&merged, z_stem).is_err());
    }

    #[test]
    fn qualified_and_unqualified_spellings_share_one_identity() {
        let defined = z_defined();
        let expected = BTreeSet::from([z_identity("flight-interaction", "KeyboardEventData")]);
        for spelling in [
            "KeyboardEventData",
            "crate::types::KeyboardEventData",
            "types::KeyboardEventData",
            "flight_interaction::KeyboardEventData",
        ] {
            assert_eq!(z_identities("", spelling, &defined), expected, "{spelling}");
        }
        let input = BTreeSet::from([z_identity("flight-input", "InputPointerData")]);
        assert_eq!(
            z_identities("", "flight_input::InputPointerData", &defined),
            input
        );
        assert_eq!(
            z_identities(
                "use flight_input::InputPointerData;",
                "InputPointerData",
                &defined
            ),
            input
        );
        assert_eq!(
            z_identities("use flight_input::*;", "Ref<InputPointerData>", &defined),
            input
        );
    }

    #[test]
    fn rejects_names_no_rule_resolves() {
        let defined = z_defined();
        let file = z_parse("use flight_alpha::*; use flight_beta::*;");
        let (imports, globs) = collect_file_imports(&file, "flight-interaction");
        let scope = TypeScope {
            owner: "flight-interaction",
            imports: &imports,
            glob_crates: &globs,
            defined: &defined,
        };
        let unknown = resolve_payload(&z_type("Missing"), &scope, &BTreeSet::new());
        assert!(
            unknown
                .unwrap_err()
                .contains("resolves to no defining crate")
        );
        let ambiguous = resolve_payload(&z_type("Event"), &scope, &BTreeSet::new());
        assert!(
            ambiguous
                .unwrap_err()
                .contains("glob-imported from several crates")
        );
    }

    #[test]
    fn treats_the_enclosing_function_type_parameters_as_non_nominal() {
        let defined = z_defined();
        let (imports, globs) = (BTreeMap::new(), Vec::new());
        let scope = TypeScope {
            owner: "flight-gui",
            imports: &imports,
            glob_crates: &globs,
            defined: &defined,
        };
        let generics = BTreeSet::from(["T".to_string()]);
        let (text, identities) = resolve_payload(&z_type("T"), &scope, &generics).unwrap();
        assert_eq!(text, "T");
        assert!(identities.is_empty());
    }
}

fn z_defined() -> BTreeMap<String, BTreeSet<String>> {
    return BTreeMap::from([
        (
            "flight-alpha".to_string(),
            BTreeSet::from(["Event".to_string()]),
        ),
        (
            "flight-beta".to_string(),
            BTreeSet::from(["Event".to_string()]),
        ),
        (
            "flight-input".to_string(),
            BTreeSet::from(["InputPointerData".to_string()]),
        ),
        (
            "flight-interaction".to_string(),
            BTreeSet::from(["KeyboardEventData".to_string()]),
        ),
    ]);
}

fn z_identities(
    uses: &str,
    payload: &str,
    defined: &BTreeMap<String, BTreeSet<String>>,
) -> BTreeSet<PayloadIdentity> {
    let file = z_parse(uses);
    let (imports, globs) = collect_file_imports(&file, "flight-interaction");
    let scope = TypeScope {
        owner: "flight-interaction",
        imports: &imports,
        glob_crates: &globs,
        defined,
    };
    return resolve_payload(&z_type(payload), &scope, &BTreeSet::new())
        .unwrap()
        .1;
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

fn z_stem(payload: &str) -> String {
    return payload.to_lowercase();
}

fn z_type(source: &str) -> syn::Type {
    return syn::parse_str(source).unwrap();
}
