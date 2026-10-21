use flight_path::*;
use flight_path_boolean::contract::*;

mod write_path_boolean_contours {
    use super::*;

    #[test]
    fn rebuilds_into_a_supplied_path_without_allocation() {
        let mut out = create_path(Some(PathWinding::EvenOdd));
        write_path_boolean_contours(&mut out, &[vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0]]);
        assert_eq!(out.winding, PathWinding::NonZero);
        assert_eq!(out.commands.len(), 4);
    }

    #[test]
    fn skips_rings_with_fewer_than_three_vertices() {
        let mut out = create_path(Some(PathWinding::NonZero));
        write_path_boolean_contours(&mut out, &[vec![0.0, 0.0, 1.0, 1.0]]);
        assert_eq!(out.commands.len(), 0);
        assert_eq!(out.data.len(), 0);
    }

    #[test]
    fn converts_multiple_rings_to_separate_sub_paths() {
        let mut out = create_path(Some(PathWinding::NonZero));
        write_path_boolean_contours(
            &mut out,
            &[
                vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
                vec![20.0, 20.0, 30.0, 20.0, 30.0, 30.0],
            ],
        );
        let move_count = out.commands.iter().filter(|&&c| c == PathCommand::MoveTo as u8).count();
        let close_count = out.commands.iter().filter(|&&c| c == PathCommand::Close as u8).count();
        assert_eq!(move_count, 2);
        assert_eq!(close_count, 2);
    }

    #[test]
    fn clears_existing_content_before_writing() {
        let mut out = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut out, 99.0, 99.0);
        append_path_line_to(&mut out, 100.0, 100.0);
        write_path_boolean_contours(&mut out, &[vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0]]);
        assert_eq!(out.commands.len(), 4);
    }
}
