use flight_shape::contract::*;

use crate::support::*;

mod explain_shape_tessellation {
    use super::*;

    #[test]
    fn tessellates_a_solid_empty_stream() {
        let explanation = explain_shape_tessellation(&[], None);
        assert_eq!(explanation.status, ShapeTessellationStatus::Tessellates);
        assert_eq!(explanation.blocked_by, ShapeTessellationBlockedBy::None);
    }

    #[test]
    fn blocks_a_gradient_fill() {
        let commands = stream(&[("beginGradientFill", vec![])]);
        let explanation = explain_shape_tessellation(&commands, None);
        assert_eq!(explanation.status, ShapeTessellationStatus::NeedsRasterizer);
        assert_eq!(
            explanation.blocked_by,
            ShapeTessellationBlockedBy::NonSolidFill
        );
    }
}

mod tessellation_source_parity {
    use super::*;

    #[test]
    fn reports_a_solid_fill_as_tessellating_at_any_alpha() {
        for alpha in [1.0, 0.25, 0.0] {
            let shape = shape();
            append_shape_begin_fill(&shape, 0xff0000ff, Some(alpha));
            append_shape_rectangle(&shape, 0.0, 0.0, 50.0, 50.0);
            append_shape_end_fill(&shape);
            let explanation = explain_shape_tessellation(&tokens(&shape), None);
            assert_eq!(explanation.status, ShapeTessellationStatus::Tessellates);
            assert_eq!(explanation.blocked_by, ShapeTessellationBlockedBy::None);
        }
    }

    #[test]
    fn reports_an_open_stroke_as_tessellating() {
        let shape = shape();
        append_shape_line_style(
            &shape,
            Some(2.0),
            0x000000ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        append_shape_move_to(&shape, 0.0, 0.0);
        append_shape_line_to(&shape, 50.0, 0.0);
        let explanation = explain_shape_tessellation(&tokens(&shape), None);
        assert_eq!(explanation.status, ShapeTessellationStatus::Tessellates);
        assert_eq!(explanation.blocked_by, ShapeTessellationBlockedBy::None);
    }

    #[test]
    fn names_the_closed_stroke_the_default_lane_declines_and_clears_it_for_the_opt_in_lane() {
        let shape = shape();
        append_shape_begin_fill(&shape, 0xff0000ff, Some(1.0));
        append_shape_line_style(
            &shape,
            Some(2.0),
            0x000000ff,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        append_shape_rectangle(&shape, 0.0, 0.0, 50.0, 50.0);
        append_shape_end_fill(&shape);
        let commands = tokens(&shape);
        assert_eq!(
            explain_shape_tessellation(&commands, None),
            ShapeTessellationExplanation {
                blocked_by: ShapeTessellationBlockedBy::StrokeOutline,
                status: ShapeTessellationStatus::NeedsRasterizer,
            }
        );
        assert_eq!(
            explain_shape_tessellation(&commands, Some(true)),
            ShapeTessellationExplanation {
                blocked_by: ShapeTessellationBlockedBy::None,
                status: ShapeTessellationStatus::Tessellates,
            }
        );
    }

    #[test]
    fn names_a_non_solid_fill_which_no_stroke_lane_setting_can_rescue() {
        let shape = shape();
        append_shape_begin_gradient_fill(
            &shape,
            GradientType::Linear,
            &[0xff0000ff, 0x0000ffff],
            &[1.0, 1.0],
            &[0.0, 255.0],
            None,
            None,
            None,
            None,
        );
        append_shape_rectangle(&shape, 0.0, 0.0, 50.0, 50.0);
        append_shape_end_fill(&shape);
        let commands = tokens(&shape);
        assert_eq!(
            explain_shape_tessellation(&commands, None),
            ShapeTessellationExplanation {
                blocked_by: ShapeTessellationBlockedBy::NonSolidFill,
                status: ShapeTessellationStatus::NeedsRasterizer,
            }
        );
        assert_eq!(
            explain_shape_tessellation(&commands, Some(true)).status,
            ShapeTessellationStatus::NeedsRasterizer
        );
    }
}
