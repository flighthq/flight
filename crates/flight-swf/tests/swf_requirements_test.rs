use crate::support::*;
use flight_compression::SDK_HOST_DECOMPRESS_DEFLATE;
use flight_requirement::{Requirement, RequirementFacet};
use flight_swf::contract::*;

const CORE_SHAPE_COMMAND_KEYS: [&str; 14] = [
    "beginFill",
    "beginGradientFill",
    "cubicCurveTo",
    "drawCircle",
    "drawEllipse",
    "drawPath",
    "drawRectangle",
    "drawRoundedRectangle",
    "endFill",
    "lineGradientStyle",
    "lineStyle",
    "lineTo",
    "moveTo",
    "quadraticCurveTo",
];

fn core_shape_command_requirements() -> Vec<Requirement> {
    return CORE_SHAPE_COMMAND_KEYS
        .iter()
        .map(|key| requirement(RequirementFacet::SceneShapeCommand, key))
        .collect();
}

fn requirement(facet: RequirementFacet, key: &str) -> Requirement {
    return Requirement {
        facet,
        key: key.to_string(),
    };
}

fn requirements_for(tags: &[Vec<u8>]) -> flight_requirement::RequirementSet {
    return parse_swf_requirements(
        &create_swf(tags, 24.0, [0, 2000, 0, 1000]),
        Some(&SDK_HOST_DECOMPRESS_DEFLATE),
        None,
    );
}

mod parse_swf_requirements {
    use super::*;

    #[test]
    fn collapses_repeats() {
        let shape = create_minimal_shape_body();
        let set = requirements_for(&[
            create_tag(TAG_DEFINE_SHAPE, &shape),
            create_tag(TAG_DEFINE_SHAPE, &shape),
            create_tag(TAG_END, &[]),
        ]);
        let mut expected = vec![requirement(
            RequirementFacet::DocumentFormat,
            "swf.DefineShape",
        )];
        expected.extend(core_shape_command_requirements());
        assert_eq!(set.requirements, expected);
    }

    #[test]
    fn declares_the_facet_it_inspected() {
        let set = requirements_for(&[create_tag(TAG_END, &[])]);
        assert_eq!(set.covers, [RequirementFacet::DocumentFormat]);
    }

    #[test]
    fn emits_blend_mode_requirements_when_place_object3_declares_one() {
        let set = requirements_for(&[create_tag(70, &[0, 2, 1, 0]), create_tag(TAG_END, &[])]);
        assert!(
            set.requirements
                .contains(&requirement(RequirementFacet::SceneBlendMode, "standard"))
        );
        assert!(set.covers.contains(&RequirementFacet::SceneBlendMode));
    }

    #[test]
    fn emits_no_requirement_for_csm_text_settings() {
        assert!(
            requirements_for(&[create_tag(74, &[1]), create_tag(TAG_END, &[])])
                .requirements
                .is_empty()
        );
    }

    #[test]
    fn emits_no_requirement_for_define_font_align_zones() {
        assert!(
            requirements_for(&[create_tag(73, &[1]), create_tag(TAG_END, &[])])
                .requirements
                .is_empty()
        );
    }

    #[test]
    fn emits_no_requirement_for_define_font_name() {
        assert!(
            requirements_for(&[create_tag(88, &[1]), create_tag(TAG_END, &[])])
                .requirements
                .is_empty()
        );
    }

    #[test]
    fn emits_no_requirement_for_file_attributes() {
        assert!(
            requirements_for(&[create_tag(69, &[1]), create_tag(TAG_END, &[])])
                .requirements
                .is_empty()
        );
    }

    #[test]
    fn emits_no_requirement_for_metadata() {
        assert!(
            requirements_for(&[create_tag(77, &[1]), create_tag(TAG_END, &[])])
                .requirements
                .is_empty()
        );
    }

    #[test]
    fn emits_no_requirement_for_protect() {
        assert!(
            requirements_for(&[create_tag(TAG_PROTECT, &[1]), create_tag(TAG_END, &[])])
                .requirements
                .is_empty()
        );
    }

    #[test]
    fn emits_no_requirement_for_show_frame() {
        assert!(
            requirements_for(&[create_tag(TAG_SHOW_FRAME, &[]), create_tag(TAG_END, &[])])
                .requirements
                .is_empty()
        );
    }

    #[test]
    fn emits_texture_shape_commands_when_bitmap_tags_are_present() {
        let shape = create_minimal_shape_body();
        let set = requirements_for(&[
            create_tag(TAG_DEFINE_SHAPE, &shape),
            create_tag(21, &[1, 0, 0xff, 0xd8]),
            create_tag(TAG_END, &[]),
        ]);
        assert!(set.requirements.contains(&requirement(
            RequirementFacet::SceneShapeCommand,
            "beginTextureFill"
        )));
        assert!(set.requirements.contains(&requirement(
            RequirementFacet::SceneShapeCommand,
            "lineTextureStyle"
        )));
    }

    #[test]
    fn keeps_a_tag_this_build_does_not_name() {
        assert_eq!(
            requirements_for(&[
                create_tag(TAG_UNKNOWN, &[1, 2, 3]),
                create_tag(TAG_END, &[])
            ])
            .requirements,
            [requirement(
                RequirementFacet::DocumentFormat,
                "swf.Unknown(100)"
            )]
        );
    }

    #[test]
    fn reports_an_unregistered_tag_like_a_registered_one() {
        let shape = create_minimal_shape_body();
        let set = requirements_for(&[
            create_tag(TAG_DEFINE_SHAPE, &shape),
            create_tag(TAG_SET_BACKGROUND_COLOR, &[0xff; 3]),
            create_tag(TAG_END, &[]),
        ]);
        let mut expected = vec![
            requirement(RequirementFacet::DocumentFormat, "swf.DefineShape"),
            requirement(RequirementFacet::DocumentFormat, "swf.SetBackgroundColor"),
        ];
        expected.extend(core_shape_command_requirements());
        assert_eq!(set.requirements, expected);
    }

    #[test]
    fn reports_content_tags_beside_excluded_ones() {
        let set = requirements_for(&[
            create_tag(69, &[1]),
            create_tag(TAG_SHOW_FRAME, &[]),
            create_tag(TAG_SET_BACKGROUND_COLOR, &[0xff; 3]),
            create_tag(TAG_END, &[]),
        ]);
        assert_eq!(
            set.requirements,
            [requirement(
                RequirementFacet::DocumentFormat,
                "swf.SetBackgroundColor"
            )]
        );
    }

    #[test]
    fn reports_one_requirement_per_distinct_tag_keyed_by_name() {
        let shape = create_minimal_shape_body();
        let set = requirements_for(&[
            create_tag(TAG_SET_BACKGROUND_COLOR, &[0xff; 3]),
            create_tag(TAG_DEFINE_SHAPE, &shape),
            create_tag(TAG_END, &[]),
        ]);
        let mut expected = vec![
            requirement(RequirementFacet::DocumentFormat, "swf.DefineShape"),
            requirement(RequirementFacet::DocumentFormat, "swf.SetBackgroundColor"),
        ];
        expected.extend(core_shape_command_requirements());
        assert_eq!(set.requirements, expected);
    }

    #[test]
    fn returns_an_empty_set_with_coverage_when_unreadable() {
        let set = parse_swf_requirements(
            &bytes_ref(Vec::new()),
            Some(&SDK_HOST_DECOMPRESS_DEFLATE),
            None,
        );
        assert!(set.requirements.is_empty());
        assert_eq!(set.covers, [RequirementFacet::DocumentFormat]);
    }

    #[test]
    fn still_reports_an_unrecognized_tag() {
        assert_eq!(
            requirements_for(&[create_tag(TAG_UNKNOWN, &[1]), create_tag(TAG_END, &[])])
                .requirements,
            [requirement(
                RequirementFacet::DocumentFormat,
                "swf.Unknown(100)"
            )]
        );
    }
}
