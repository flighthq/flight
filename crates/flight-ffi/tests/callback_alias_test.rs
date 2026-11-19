//! Pins how build.rs resolves a callback-shaped alias before callback lowering: from its one source
//! definition, with generic arguments substituted, and only for aliases its policy names.

#[path = "../callback_alias.rs"]
mod callback_alias;
#[path = "../signal_identity.rs"]
mod signal_identity;

use std::collections::BTreeMap;

use callback_alias::{
    CallbackAlias, check_callback_aliases, collect_callback_aliases, is_callback_target,
    resolve_callback_alias,
};

mod check_callback_aliases {
    use super::*;

    #[test]
    fn accepts_identical_definitions_from_two_crates() {
        let definitions = z_collect(&[
            (
                "flight-a",
                "pub type Listener = Arc<dyn Fn(f64) + Send + Sync>;",
            ),
            (
                "flight-b",
                "pub type Listener = std::sync::Arc<dyn Fn(f64) + Send + Sync>;",
            ),
        ]);
        let checked = check_callback_aliases(&definitions, &["Listener"]).unwrap();
        assert_eq!(checked["Listener"].target, "Arc<dyn Fn(f64) + Send + Sync>");
    }

    #[test]
    fn rejects_a_listed_alias_two_crates_define_differently_and_names_both() {
        let definitions = z_collect(&[
            (
                "flight-a",
                "pub type Listener = Arc<dyn Fn(f64) + Send + Sync>;",
            ),
            (
                "flight-b",
                "pub type Listener = Arc<dyn Fn(&Event) + Send + Sync>;",
            ),
        ]);
        let error = check_callback_aliases(&definitions, &["Listener"]).unwrap_err();
        assert!(error.contains("defined differently by flight-a"), "{error}");
        assert!(
            error.contains("flight-b (`Arc<dyn Fn(&Event) + Send + Sync>`)"),
            "{error}"
        );
    }

    #[test]
    fn rejects_a_listed_alias_no_crate_defines_as_a_callback() {
        let definitions = z_collect(&[("flight-node", "pub type NodeRef = Ref<dyn Node>;")]);
        for name in ["NodeRef", "Missing"] {
            let error = check_callback_aliases(&definitions, &[name]).unwrap_err();
            assert!(
                error.contains("is not defined as `Arc<dyn Fn(..)>`"),
                "{error}"
            );
        }
    }

    #[test]
    fn returns_only_the_listed_aliases() {
        let definitions = z_collect(&[(
            "flight-a",
            "pub type Kept = Arc<dyn Fn() + Send + Sync>; pub type Unlisted = Arc<dyn Fn() + Send + Sync>;",
        )]);
        let checked = check_callback_aliases(&definitions, &["Kept"]).unwrap();
        assert_eq!(checked.keys().collect::<Vec<_>>(), ["Kept"]);
    }

    #[test]
    fn unlisted_conflicting_aliases_do_not_block_the_listed_ones() {
        let definitions = z_collect(&[
            (
                "flight-a",
                "pub type Clash = Arc<dyn Fn() + Send + Sync>; pub type Kept = Arc<dyn Fn() + Send + Sync>;",
            ),
            (
                "flight-b",
                "pub type Clash = Arc<dyn Fn(f64) + Send + Sync>;",
            ),
        ]);
        assert!(check_callback_aliases(&definitions, &["Kept"]).is_ok());
    }
}

mod collect_callback_aliases {
    use super::*;

    #[test]
    fn ignores_private_and_non_callback_aliases() {
        let definitions = z_collect(&[(
            "flight-a",
            "type Private = Arc<dyn Fn() + Send + Sync>; pub type NodeRef = Ref<dyn Node>; pub type Boxed = Box<dyn Fn()>; pub type Id = u32;",
        )]);
        assert!(definitions.is_empty(), "{definitions:?}");
    }

    #[test]
    fn records_public_plain_generic_and_inline_module_callback_aliases() {
        let definitions = z_collect(&[(
            "flight-signals",
            "pub type SignalSlot<T> = Arc<dyn Fn(&T) + Send + Sync>; pub mod inner { pub type Repeat = std::sync::Arc<dyn Fn() + Send + Sync>; }",
        )]);
        assert_eq!(
            definitions["SignalSlot"],
            [CallbackAlias {
                owner: "flight-signals".to_string(),
                params: vec!["T".to_string()],
                target: "Arc<dyn Fn(&T) + Send + Sync>".to_string(),
            }]
        );
        assert_eq!(
            definitions["Repeat"][0].target,
            "Arc<dyn Fn() + Send + Sync>"
        );
    }
}

mod is_callback_target {
    use super::*;

    #[test]
    fn accepts_only_an_arc_of_a_dyn_fn() {
        assert!(is_callback_target("Arc<dyn Fn(&T) + Send + Sync>"));
        for target in [
            "Box<dyn Fn()>",
            "Arc<dyn Node>",
            "Ref<dyn Fn()>",
            "Arc<Mutex<u8>>",
        ] {
            assert!(!is_callback_target(target), "{target}");
        }
    }
}

mod resolve_callback_alias {
    use super::*;

    #[test]
    fn keeps_option_around_the_resolved_target() {
        let aliases = z_checked(&["Listener"]);
        assert_eq!(
            resolve_callback_alias("Option<Listener>", &aliases).as_deref(),
            Some("Option<Arc<dyn Fn(&FileWatchEvent) + Send + Sync>>")
        );
    }

    #[test]
    fn leaves_unlisted_unknown_and_misapplied_aliases_alone() {
        let aliases = z_checked(&["Listener", "SignalSlot"]);
        for ty in [
            "Unlisted",
            "NodeRef",
            "&Listener",
            "SignalSlot",
            "SignalSlot<A, B>",
            "Listener<u8>",
            "Vec<Listener>",
        ] {
            assert_eq!(resolve_callback_alias(ty, &aliases), None, "{ty}");
        }
    }

    #[test]
    fn resolves_a_plain_alias_to_its_target() {
        let aliases = z_checked(&["Listener"]);
        assert_eq!(
            resolve_callback_alias("Listener", &aliases).as_deref(),
            Some("Arc<dyn Fn(&FileWatchEvent) + Send + Sync>")
        );
    }

    #[test]
    fn substitutes_generic_arguments_as_whole_type_names() {
        let aliases = z_checked(&["SignalSlot", "Pair"]);
        assert_eq!(
            resolve_callback_alias("SignalSlot<TrayDropEvent>", &aliases).as_deref(),
            Some("Arc<dyn Fn(&TrayDropEvent) + Send + Sync>")
        );
        assert_eq!(
            resolve_callback_alias("Pair<Option<Ref<Node>>, f32>", &aliases).as_deref(),
            Some("Arc<dyn Fn(&Option<Ref<Node>>, Target, Vec<f32>) -> UT + Send + Sync>")
        );
    }
}

// Collects callback aliases from `(owner, source)` pairs.
fn z_collect(sources: &[(&str, &str)]) -> BTreeMap<String, Vec<CallbackAlias>> {
    let mut definitions = BTreeMap::new();
    for (owner, source) in sources {
        let file = syn::parse_file(source).unwrap();
        collect_callback_aliases(&file, owner, &mut definitions);
    }
    return definitions;
}

// The fixture aliases, checked for `names`.
fn z_checked(names: &[&str]) -> BTreeMap<String, CallbackAlias> {
    let definitions = z_collect(&[
        (
            "flight-filesystem",
            "pub type Listener = Arc<dyn Fn(&crate::types::FileWatchEvent) + Send + Sync>;",
        ),
        (
            "flight-signals",
            "pub type SignalSlot<T> = Arc<dyn Fn(&T) + Send + Sync>; pub type Pair<T, U> = Arc<dyn Fn(&T, Target, Vec<U>) -> UT + Send + Sync>;",
        ),
    ]);
    return check_callback_aliases(&definitions, names).unwrap();
}
