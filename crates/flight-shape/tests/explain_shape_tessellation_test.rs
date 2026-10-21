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
