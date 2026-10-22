use flight_scene3d_formats::contract::*;
mod collect_md5_anim_features {
    use super::*;
    #[test]
    fn reports_only_hierarchy_and_frame_sections_preserving_discovery_order() {
        for source in ["", "// MD5 anim file\n// comment\n"] {
            assert!(
                {
                    let mut output = Vec::new();
                    collect_md5_anim_features(&mut output, source);
                    output
                }
                .is_empty()
            );
        }
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_md5_anim_features(&mut output, "hierarchy {\n\"root\" -1 63 0\n}\n");
                output
            },
            vec!["Hierarchy"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_md5_anim_features(&mut output, "frame 0 {\n1.0 2.0 3.0\n}\n");
                output
            },
            vec!["Animation"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_md5_anim_features(
                    &mut output,
                    "MD5Version 10\nhierarchy {\n\"root\" -1 0 0\n}\nbaseframe {\n( 0 0 0 ) ( 0 0 0 )\n}\n",
                );
                output
            },
            vec!["Hierarchy"]
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_md5_anim_features(&mut output, "mesh {\n}\njoints {\n}\nshader \"x\"");
                output
            },
            Vec::<String>::new()
        );
    }
    #[test]
    fn finds_both_features_with_comments_repeated_frames_and_full_anim_header() {
        let sources = [
            "// comment\nhierarchy {\n// data\n}\n// more\nframe 0 {\n// values\n}\n",
            "hierarchy {\n}\nframe 0 {\n}\nframe 1 {\n}\nframe 2 {\n}\n",
            "MD5Version 10\nnumFrames 2\nnumJoints 1\nframeRate 24\nnumAnimatedComponents 6\nhierarchy {\n\"root\" -1 63 0\n}\nbaseframe {\n( 0 0 0 ) ( 0 0 0 )\n}\nframe 0 {\n0 0 0 0 0 0\n}\nframe 1 {\n1 0 0 0 0 0\n}\n",
        ];
        for source in sources {
            assert_eq!(
                {
                    let mut output = Vec::new();
                    collect_md5_anim_features(&mut output, source);
                    output
                },
                MD5_ANIM_FEATURE_NAMES
            );
        }
    }
    #[test]
    fn clears_stale_results_retains_capacity_and_reads_a_retained_source_before_reusing_its_container()
     {
        let mut out = Vec::with_capacity(32);
        out.push("hierarchy {\n}\nframe 0 {\n}".to_string());
        out.push("stale".to_string());
        let source = out[0].clone();
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        collect_md5_anim_features(&mut out, &source);
        assert_eq!(out, ["Hierarchy", "Animation"]);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        collect_md5_anim_features(&mut out, "");
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}
