//! Pins the claim-guard pass: every wrapper taking a claim-guarded carrier claims it, refuses NULL
//! and a held carrier with its failure value, and runs its body inside a panic boundary.

#[path = "../claim_guard.rs"]
mod claim_guard;

use claim_guard::{CLAIM_CONTRACT, CLAIM_SUPPORT, guard_claimed_carriers};

const GENERATED: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));
const STATS: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_stats.txt"));

const WRAPPER: &str = "#[unsafe(no_mangle)]
pub unsafe extern \"C\" fn flight_probe(ctx: *const flight_sdk::interaction::contract::HitTestContext, x: f64) -> bool {
    return flight_sdk::probe(unsafe { &*ctx }, x);
}
";

mod guard_claimed_carriers {
    use super::*;

    #[test]
    fn claims_the_carrier_and_wraps_the_body_in_a_panic_boundary() {
        let (guarded, names) = guard_claimed_carriers(WRAPPER);
        assert_eq!(names, ["flight_probe"]);
        assert!(guarded.contains(&format!(
            "#[doc = \"flight-ffi contract|{CLAIM_CONTRACT}\"]"
        )));
        assert!(guarded.contains(
            "    let Some(_ffi_claim_ctx) = ffi_claim_carrier(ctx.addr()) else { return false; };\n    return match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {\n        return flight_sdk::probe(unsafe { &*ctx }, x);\n    })) {\n        Ok(value) => value,\n        Err(_) => false,\n    };\n}\n"
        ));
    }

    #[test]
    fn leaves_other_wrappers_untouched() {
        let other = WRAPPER.replace("interaction::contract::HitTestContext", "Other");
        let (guarded, names) = guard_claimed_carriers(&other);
        assert!(names.is_empty());
        assert_eq!(guarded, other);
    }
}

#[test]
fn a_refused_claim_never_releases_the_held_one() {
    assert!(!CLAIM_SUPPORT.contains(".then_some(FfiCarrierClaim"));
    assert!(CLAIM_SUPPORT.contains("if !inserted {\n        return None;\n    }"));
}

#[test]
fn every_hit_test_context_wrapper_and_its_free_are_claim_guarded() {
    for name in [
        "flight_create_hit_test_context",
        "flight_free_hit_test_context",
        "flight_hit_test_graph_point",
        "flight_register_default_hit_tests",
        "flight_register_hit_test",
        "flight_register_hit_test_precise",
        "flight_register_quad_batch_hit_test",
        "flight_register_shape_hit_test",
        "flight_register_sprite_hit_test",
        "flight_register_text_hit_test",
        "flight_register_tilemap_hit_test",
    ] {
        assert!(
            GENERATED.contains(&format!("pub unsafe extern \"C\" fn {name}(")),
            "{name}"
        );
        if name != "flight_create_hit_test_context" {
            assert!(
                STATS.contains(&format!("  claim guard: {name}\n")),
                "{name}"
            );
        }
    }
    assert!(STATS.contains("  state seam: flight_create_hit_test_context\n"));
}
