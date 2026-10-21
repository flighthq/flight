use flight_scene3d::*;

mod get_billboard_mode_string {
    use super::*;
    #[test]
    fn returns_the_exact_three_source_spellings() {
        assert_eq!(get_billboard_mode_string(BillboardMode::AxisY), "axisY");
        assert_eq!(get_billboard_mode_string(BillboardMode::Full), "full");
        assert_eq!(
            get_billboard_mode_string(BillboardMode::ScreenAligned),
            "screenAligned"
        );
    }
}

mod get_mesh_deformer_string {
    use super::*;
    #[test]
    fn returns_the_three_exact_source_deformer_tags() {
        assert_eq!(get_mesh_deformer_string(MESH_DEFORMER_MORPH), "morph");
        assert_eq!(get_mesh_deformer_string(MESH_DEFORMER_NONE), "none");
        assert_eq!(get_mesh_deformer_string(MESH_DEFORMER_SKELETAL), "skeletal");
    }
}

mod get_scene3d_animation_path_string {
    use super::*;
    #[test]
    fn returns_all_four_source_paths_including_weights() {
        for (value, text) in [
            (SCENE3D_ANIMATION_PATH_ROTATION, "Rotation"),
            (SCENE3D_ANIMATION_PATH_SCALE, "Scale"),
            (SCENE3D_ANIMATION_PATH_TRANSLATION, "Translation"),
            (SCENE3D_ANIMATION_PATH_WEIGHTS, "Weights"),
        ] {
            assert_eq!(get_scene3d_animation_path_string(value), text);
        }
    }
}

mod parse_billboard_mode {
    use super::*;
    #[test]
    fn parses_only_the_exact_source_strings() {
        assert_eq!(parse_billboard_mode("axisY"), Some(BillboardMode::AxisY));
        assert_eq!(parse_billboard_mode("full"), Some(BillboardMode::Full));
        assert_eq!(
            parse_billboard_mode("screenAligned"),
            Some(BillboardMode::ScreenAligned)
        );
        for invalid in ["", "axisy", "Full", "screen-aligned"] {
            assert_eq!(parse_billboard_mode(invalid), None);
        }
    }
}

mod parse_mesh_deformer {
    use super::*;
    #[test]
    fn accepts_only_the_exact_source_deformer_tags() {
        assert_eq!(parse_mesh_deformer("morph"), Some(MeshDeformer::Morph));
        assert_eq!(parse_mesh_deformer("none"), Some(MeshDeformer::None));
        assert_eq!(
            parse_mesh_deformer("skeletal"),
            Some(MeshDeformer::Skeletal)
        );
        for invalid in ["", "Morph", "skin", "rigid"] {
            assert_eq!(parse_mesh_deformer(invalid), None);
        }
    }
}

mod parse_scene3d_animation_path {
    use super::*;
    #[test]
    fn parses_only_the_exact_case_sensitive_source_paths() {
        for (text, value) in [
            ("Rotation", Scene3DAnimationPath::Rotation),
            ("Scale", Scene3DAnimationPath::Scale),
            ("Translation", Scene3DAnimationPath::Translation),
            ("Weights", Scene3DAnimationPath::Weights),
        ] {
            assert_eq!(parse_scene3d_animation_path(text), Some(value));
        }
        for invalid in ["", "rotation", "Weights ", "translation"] {
            assert_eq!(parse_scene3d_animation_path(invalid), None);
        }
    }
}
