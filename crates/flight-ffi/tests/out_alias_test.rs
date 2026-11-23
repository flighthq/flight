//! Pins the out-parameter alias pass: a wrapper with a mutable and a shared pointer of one clonable
//! SDK type refuses NULL and snapshots an aliased input before the call; nothing else is touched.

#[path = "../out_alias.rs"]
mod out_alias;

use std::collections::BTreeSet;

use out_alias::{ALIAS_CONTRACT, guard_out_parameter_aliases};

const GENERATED: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));
const STATS: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_stats.txt"));

fn clone_types(names: &[&str]) -> BTreeSet<String> {
    return names.iter().map(|name| name.to_string()).collect();
}

const CONCAT: &str = "#[unsafe(no_mangle)]
pub unsafe extern \"C\" fn flight_concat_value(out: *mut flight_sdk::Value, source: *const flight_sdk::Value, other: *const flight_sdk::Value) {
    flight_sdk::concat_value(unsafe { &mut *out }, unsafe { &*source }, unsafe { &*other });
}
";

mod guard_out_parameter_aliases {
    use super::*;

    #[test]
    fn snapshots_each_aliased_input_and_refuses_null() {
        let (guarded, names) = guard_out_parameter_aliases(CONCAT, &clone_types(&["Value"]));
        assert_eq!(names, ["flight_concat_value"]);
        assert!(guarded.contains(&format!(
            "#[doc = \"flight-ffi contract|{ALIAS_CONTRACT}\"]"
        )));
        assert!(
            guarded.contains(
                "    if other.is_null() || out.is_null() || source.is_null() { return; }\n"
            )
        );
        for input in ["source", "other"] {
            assert!(guarded.contains(&format!(
                "    let ffi_alias_{input} = if std::ptr::eq({input}, out as *const _) {{ Some(Clone::clone(unsafe {{ &*{input} }})) }} else {{ None }};\n"
            )));
            assert!(guarded.contains(&format!(
                "ffi_alias_{input}.as_ref().unwrap_or_else(|| unsafe {{ &*{input} }})"
            )));
        }
        assert!(guarded.contains("unsafe { &mut *out }"));
    }

    #[test]
    fn leaves_a_type_that_is_not_clone_untouched() {
        let (guarded, names) = guard_out_parameter_aliases(CONCAT, &clone_types(&[]));
        assert!(names.is_empty());
        assert_eq!(guarded, CONCAT);
    }

    #[test]
    fn leaves_inputs_of_another_type_untouched() {
        let source = CONCAT.replace(
            "source: *const flight_sdk::Value",
            "source: *const flight_sdk::Other",
        );
        let (guarded, names) = guard_out_parameter_aliases(&source, &clone_types(&["Value"]));
        assert_eq!(names, ["flight_concat_value"]);
        assert!(!guarded.contains("ffi_alias_source"));
        assert!(guarded.contains("ffi_alias_other"));
    }

    #[test]
    fn returns_the_sentinel_of_each_return_type() {
        for (returns, sentinel) in [
            ("-> bool ", "return false;"),
            ("-> *mut flight_sdk::Value ", "return std::ptr::null_mut();"),
            ("-> f32 ", "return Default::default();"),
        ] {
            let source = CONCAT.replace(
                ") {\n    flight_sdk",
                &format!(") {returns}{{\n    flight_sdk"),
            );
            let (guarded, _) = guard_out_parameter_aliases(&source, &clone_types(&["Value"]));
            assert!(guarded.contains(&format!("{{ {sentinel} }}")), "{returns}");
        }
    }
}

#[test]
fn generated_color_scale_bias_out_parameters_are_alias_guarded() {
    for name in [
        "flight_concat_color_scale_bias",
        "flight_copy_color_scale_bias",
        "flight_invert_color_scale_bias",
    ] {
        assert!(
            STATS.contains(&format!("  alias guard: {name}\n")),
            "{name} must be alias guarded"
        );
        let start = GENERATED
            .find(&format!("pub unsafe extern \"C\" fn {name}("))
            .unwrap();
        let body = &GENERATED[start..start + GENERATED[start..].find("\n}\n").unwrap()];
        assert!(
            body.contains("std::ptr::eq(source, out as *const _)"),
            "{name}"
        );
        assert!(body.contains("out.is_null()"), "{name}");
    }
}
