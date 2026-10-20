use flight_textbidi::*;

mod compact_bidi_class_kernel {
    use super::*;

    #[test]
    fn is_the_shared_kernel_the_bidi_operations_are_handed() {
        let kernel = compact_bidi_class_kernel();
        assert_eq!((kernel.get_bidi_class)(0x0061), BidiClass::L); // 'a'
    }
}

mod create_compact_bidi_class_kernel {
    use super::*;

    #[test]
    fn classifies_a_representative_sample_of_common_script_codepoints() {
        let kernel = create_compact_bidi_class_kernel();
        assert_eq!((kernel.get_bidi_class)(0x0061), BidiClass::L); // 'a'
        assert_eq!((kernel.get_bidi_class)(0x005A), BidiClass::L); // 'Z'
        assert_eq!((kernel.get_bidi_class)(0x05D0), BidiClass::R); // Hebrew alef
        assert_eq!((kernel.get_bidi_class)(0x0627), BidiClass::AL); // Arabic alef
        assert_eq!((kernel.get_bidi_class)(0x0035), BidiClass::EN); // '5'
        assert_eq!((kernel.get_bidi_class)(0x0660), BidiClass::AN); // Arabic-Indic digit zero
        assert_eq!((kernel.get_bidi_class)(0x0020), BidiClass::WS); // ' '
        assert_eq!((kernel.get_bidi_class)(0x0301), BidiClass::NSM); // combining acute accent
        assert_eq!((kernel.get_bidi_class)(0x2066), BidiClass::LRI);
        assert_eq!((kernel.get_bidi_class)(0x2069), BidiClass::PDI);
        assert_eq!((kernel.get_bidi_class)(0x202B), BidiClass::RLE);
    }

    #[test]
    fn resolves_uncovered_codepoints_to_the_ltr_default() {
        let kernel = create_compact_bidi_class_kernel();
        assert_eq!((kernel.get_bidi_class)(0x4E2D), BidiClass::L); // CJK ideograph
    }
}

mod explain_bidi_class_kernel {
    use super::*;

    #[test]
    fn describes_the_compact_fallback_and_proves_its_flattened_table_invariants() {
        let explanation = explain_bidi_class_kernel(&create_compact_bidi_class_kernel());
        assert_eq!(explanation.kernel, "compact");
        assert_eq!(explanation.coverage, "common-script-ranges");
        assert_eq!(explanation.fallback_class, Some(BidiClass::L));
        assert_eq!(explanation.table_valid, Some(true));
        for i in 0..explanation.covered_code_point_ranges.len() {
            let range = &explanation.covered_code_point_ranges[i];
            assert!(range.start <= range.end);
            if i > 0 {
                assert!(range.start > explanation.covered_code_point_ranges[i - 1].end);
            }
        }
    }

    #[test]
    fn does_not_claim_a_custom_provider_coverage_boundary() {
        let custom = BidiClassKernel {
            get_bidi_class: |_| BidiClass::R,
            is_compact: false,
        };
        let explanation = explain_bidi_class_kernel(&custom);
        assert_eq!(
            explanation,
            BidiClassKernelExplanation {
                kernel: "custom",
                coverage: "provider-defined",
                covered_code_point_ranges: vec![],
                fallback_class: None,
                table_valid: None,
            }
        );
    }
}

mod initialize_compact_bidi_class_kernel_test {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_compact_bidi_class_kernel() {
        let mut kernel = BidiClassKernel::default();
        initialize_compact_bidi_class_kernel(&mut kernel);
        assert_eq!((kernel.get_bidi_class)(0x0061), BidiClass::L); // 'a'
    }
}
