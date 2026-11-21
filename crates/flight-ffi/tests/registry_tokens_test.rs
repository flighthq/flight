#[allow(dead_code)]
#[path = "../registry_tokens.rs"]
mod registry_tokens;

use registry_tokens::{TAG_BITS, TOKEN_FAMILIES, TokenFamily, check_token_families};

const GENERATED: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));

mod check_token_families {
    use super::*;

    // Every pair of families has a distinct odd tag below the sequence, so no token of one family
    // is ever a token of another, and none is an aligned address.
    #[test]
    fn keeps_every_family_pairwise_distinct_odd_and_below_the_sequence() {
        assert_eq!(check_token_families(TOKEN_FAMILIES), Ok(()));
        for (index, family) in TOKEN_FAMILIES.iter().enumerate() {
            assert_eq!(family.tag % 2, 1, "{}", family.name);
            assert!(family.tag < 1 << TAG_BITS, "{}", family.name);
            for other in &TOKEN_FAMILIES[index + 1..] {
                assert_ne!(family.tag, other.tag, "{} and {}", family.name, other.name);
                assert_ne!(family.tag_const, other.tag_const);
            }
        }
    }

    #[test]
    fn refuses_a_shared_even_or_oversized_tag() {
        let family = |tag| TokenFamily {
            name: "probe",
            tag_const: "FFI_PROBE_TOKEN_TAG",
            tag,
        };
        assert!(check_token_families(&[family(3), family(3)]).is_err());
        assert!(check_token_families(&[family(4)]).is_err());
        assert!(check_token_families(&[family(1 << TAG_BITS | 1)]).is_err());
    }
}

mod generate_registry_token_support {
    use super::*;

    // Every registry mints from the one shared sequence: no registry keeps a counter of its own,
    // and every generated family constant carries the audited tag.
    #[test]
    fn mints_every_registry_token_from_the_shared_sequence() {
        assert_eq!(
            GENERATED
                .matches("static FFI_REGISTRY_TOKEN_SEQUENCE:")
                .count(),
            1
        );
        assert!(!GENERATED.contains("checked_mul(2)"));
        assert!(!GENERATED.contains("registry.issued"));
        assert!(GENERATED.contains("ffi_mint_registry_token(FFI_RENDER_PASS_TOKEN_TAG)"));
        for family in TOKEN_FAMILIES {
            let declaration = format!("const {}: usize = {};", family.tag_const, family.tag);
            if GENERATED.contains(&format!("const {}:", family.tag_const)) {
                assert!(GENERATED.contains(&declaration), "{}", family.name);
            }
        }
        assert!(GENERATED.contains("const FFI_RENDER_PASS_TOKEN_TAG: usize = 1;"));
    }
}
