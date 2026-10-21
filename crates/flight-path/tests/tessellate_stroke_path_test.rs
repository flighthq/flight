use flight_path::contract::*;

fn mesh_area(mesh: &PathMesh) -> f64 {
    let mut area = 0.0;
    let mut i = 0;
    while i < mesh.indices.len() {
        let a = mesh.indices[i] as usize * 2;
        let b = mesh.indices[i + 1] as usize * 2;
        let c = mesh.indices[i + 2] as usize * 2;
        area += ((mesh.vertices[b] - mesh.vertices[a]) * (mesh.vertices[c + 1] - mesh.vertices[a + 1])
            - (mesh.vertices[b + 1] - mesh.vertices[a + 1]) * (mesh.vertices[c] - mesh.vertices[a]))
            .abs()
            / 2.0;
        i += 3;
    }
    return area;
}

fn bow_tie() -> Path {
    let mut path = create_path(Some(PathWinding::NonZero));
    append_path_move_to(&mut path, 0.0, 0.0);
    append_path_line_to(&mut path, 40.0, 40.0);
    append_path_line_to(&mut path, 0.0, 40.0);
    append_path_line_to(&mut path, 40.0, 0.0);
    append_path_close(&mut path);
    return path;
}

mod tessellate_stroke_path {
    use super::*;

    #[test]
    fn tessellates_open_butt_capped_line_without_overlapping_triangles() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.cap = StrokeCap::Butt;
        style.width = 10.0;
        let mesh = tessellate_stroke_path(&path, &style, Some(0.25)).unwrap();
        assert_eq!(mesh.indices.len(), 6);
        assert!((mesh_area(&mesh) - 1000.0).abs() < 1.0);
    }

    #[test]
    fn tessellates_closed_rectangle_as_hollow_ring() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.join = StrokeJoin::Miter;
        style.width = 10.0;
        let mesh = tessellate_stroke_path(&path, &style, Some(0.25)).unwrap();
        assert!((mesh_area(&mesh) - 3000.0).abs() < 50.0);
    }

    #[test]
    fn uses_same_round_join_sampling_tolerance_as_stroke_outlines() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.join = StrokeJoin::Round;
        style.width = 10.0;
        let fine = tessellate_stroke_path(&path, &style, Some(0.1)).unwrap();
        let coarse = tessellate_stroke_path(&path, &style, Some(5.0)).unwrap();
        assert!(fine.vertices.len() > coarse.vertices.len());
    }

    #[test]
    fn turns_dashed_closed_path_into_independently_capped_stroke_pieces() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.cap = StrokeCap::Round;
        style.dash = vec![20.0, 10.0];
        style.width = 6.0;
        let mesh = tessellate_stroke_path(&path, &style, Some(0.25)).unwrap();
        assert!(mesh.indices.len() > 6);
    }

    #[test]
    fn returns_none_for_self_intersecting_centerline() {
        let path = bow_tie();
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 8.0;
        assert!(tessellate_stroke_path(&path, &style, Some(0.25)).is_none());
    }

    #[test]
    fn returns_none_for_zero_width() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = 0.0;
        assert!(tessellate_stroke_path(&path, &style, Some(0.25)).is_none());
    }

    #[test]
    fn returns_none_for_nan_width() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 10.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = f64::NAN;
        assert!(tessellate_stroke_path(&path, &style, Some(0.25)).is_none());
    }

    #[test]
    fn returns_nonempty_mesh_for_open_and_closed_paths() {
        let mut open_path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut open_path, 0.0, 0.0);
        append_path_line_to(&mut open_path, 100.0, 0.0);
        append_path_line_to(&mut open_path, 100.0, 100.0);
        let mut open_style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        open_style.cap = StrokeCap::Butt;
        open_style.join = StrokeJoin::Miter;
        open_style.width = 10.0;
        let open_mesh = tessellate_stroke_path(&open_path, &open_style, Some(0.25)).unwrap();
        assert!(open_mesh.vertices.len() > 0);

        let mut closed_path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut closed_path, 0.0, 0.0, 100.0, 50.0);
        let mut closed_style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        closed_style.join = StrokeJoin::Round;
        closed_style.width = 7.0;
        let closed_mesh = tessellate_stroke_path(&closed_path, &closed_style, Some(0.1)).unwrap();
        assert!(closed_mesh.vertices.len() > 0);
    }

    #[test]
    fn returns_none_for_empty_path() {
        let path = create_path(Some(PathWinding::NonZero));
        let style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        assert!(tessellate_stroke_path(&path, &style, Some(0.25)).is_none());
    }

    #[test]
    fn returns_identical_geometry_when_called_repeatedly() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.cap = StrokeCap::Butt;
        style.join = StrokeJoin::Miter;
        style.width = 10.0;
        let baseline = tessellate_stroke_path(&path, &style, Some(0.25)).unwrap();
        for _ in 0..10 {
            let result = tessellate_stroke_path(&path, &style, Some(0.25)).unwrap();
            assert_eq!(result.vertices, baseline.vertices);
            assert_eq!(result.indices, baseline.indices);
        }
    }

    #[test]
    fn does_not_mutate_the_path_or_style() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 100.0, 100.0);
        let commands_before = path.commands.clone();
        let data_before = path.data.clone();
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.cap = StrokeCap::Butt;
        style.join = StrokeJoin::Miter;
        style.width = 10.0;
        let width_before = style.width;
        tessellate_stroke_path(&path, &style, Some(0.25));
        assert_eq!(path.commands, commands_before);
        assert_eq!(path.data, data_before);
        assert_eq!(style.width, width_before);
    }

    #[test]
    fn normalizes_explicit_close_and_return_to_start_to_same_ring() {
        let mut closed = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut closed, 0.0, 0.0, 100.0, 50.0);
        let mut returned = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut returned, 0.0, 0.0);
        append_path_line_to(&mut returned, 100.0, 0.0);
        append_path_line_to(&mut returned, 100.0, 50.0);
        append_path_line_to(&mut returned, 0.0, 50.0);
        append_path_line_to(&mut returned, 0.0, 0.0);
        let style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        let mesh_closed = tessellate_stroke_path(&closed, &style, Some(0.25));
        let mesh_returned = tessellate_stroke_path(&returned, &style, Some(0.25));
        assert_eq!(mesh_closed.is_some(), mesh_returned.is_some());
        if let (Some(mc), Some(mr)) = (mesh_closed, mesh_returned) {
            assert_eq!(mc.vertices, mr.vertices);
            assert_eq!(mc.indices, mr.indices);
        }
    }

    #[test]
    fn returns_none_for_invalid_style() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        let mut style = StrokeStyle { width: 1.0, cap: StrokeCap::Butt, join: StrokeJoin::Miter, miter_limit: 4.0, dash: Vec::new(), dash_offset: 0.0 };
        style.width = -1.0;
        assert!(tessellate_stroke_path(&path, &style, Some(0.25)).is_none());
    }
}
