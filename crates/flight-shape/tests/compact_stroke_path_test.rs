use flight_path::create_path;
use flight_shape::contract::*;

use crate::support::*;

mod compact_stroke_path {
    use super::*;

    #[test]
    fn writes_an_empty_path_for_an_empty_stroke() {
        let path = create_path(flight_path::PathWinding::NonZero);
        let mut compacted = create_path(flight_path::PathWinding::NonZero);
        compact_stroke_path(&mut compacted, &path, &stroke_style(), None);
        assert!(compacted.commands.is_empty());
    }
}

mod compact_stroke_path_source_parity {
    use super::*;
    use flight_path::PathCommand;

    #[test]
    fn converts_an_open_centerline_into_a_closed_fill_outline() {
        let mut centerline: flight_path::Path = create_path(flight_path::PathWinding::NonZero);
        centerline.commands = vec![PathCommand::MoveTo as u8, PathCommand::LineTo as u8];
        centerline.data = vec![0.0, 0.0, 20.0, 0.0];
        let style = flight_path::StrokeStyle {
            width: 4.0,
            cap: flight_path::StrokeCap::Square,
            join: flight_path::StrokeJoin::Miter,
            miter_limit: 10.0,
            dash: Vec::new(),
            dash_offset: 0.0,
        };
        let mut compacted = create_path(flight_path::PathWinding::NonZero);
        compact_stroke_path(&mut compacted, &centerline, &style, None);
        assert_eq!(
            compacted.commands.first(),
            Some(&(PathCommand::MoveTo as u8))
        );
        assert_eq!(compacted.commands.last(), Some(&(PathCommand::Close as u8)));
        assert!(compacted.data.contains(&-2.0));
        assert!(compacted.data.contains(&22.0));
    }

    #[test]
    fn returns_an_empty_path_for_a_centerline_without_a_segment() {
        let mut centerline: flight_path::Path = create_path(flight_path::PathWinding::NonZero);
        centerline.commands = vec![PathCommand::MoveTo as u8];
        centerline.data = vec![0.0, 0.0];
        let style = flight_path::StrokeStyle {
            width: 4.0,
            cap: flight_path::StrokeCap::Round,
            join: flight_path::StrokeJoin::Miter,
            miter_limit: 10.0,
            dash: Vec::new(),
            dash_offset: 0.0,
        };
        let mut compacted = create_path(flight_path::PathWinding::NonZero);
        compact_stroke_path(&mut compacted, &centerline, &style, None);
        assert!(compacted.commands.is_empty());
    }
}
