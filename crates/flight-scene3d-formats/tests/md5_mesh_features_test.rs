use flight_scene3d_formats::contract::*;

mod collect_md5_mesh_features {
    use super::*;
    #[test]
    fn follows_exact_section_and_nonempty_quoted_shader_vocabulary() {
        let cases = [
            ("", vec![]),
            ("// MD5 mesh file\n// exported\n", vec![]),
            (
                "MD5Version 10\njoints {\n\"root\" -1 ( 0 0 0 ) ( 0 0 0 )\n}\n",
                vec!["Skeleton"],
            ),
            (
                "MD5Version 10\nmesh {\nshader \"\"\nnumverts 0\nnumtris 0\nnumweights 0\n}\n",
                vec!["Mesh"],
            ),
            (
                "mesh {\nshader \"models/player/body\"\nnumverts 0\nnumtris 0\nnumweights 0\n}\n",
                vec!["Mesh", "Material"],
            ),
            (
                "mesh {\nshader\nnumverts 0\nnumtris 0\nnumweights 0\n}\n",
                vec!["Mesh"],
            ),
            (
                "mesh {\nshader \"\"\n}\nmesh {\nshader \"models/arm\"\n}\n",
                vec!["Mesh", "Material"],
            ),
            (
                "// comment\njoints {\n// joint data\n}\n// more\nmesh {\n// mesh data\n}\n",
                vec!["Skeleton", "Mesh"],
            ),
            ("mesh {\nshader \"test\"\n", vec!["Mesh", "Material"]),
        ];
        for (source, expected) in cases {
            assert_eq!(
                {
                    let mut output = Vec::new();
                    collect_md5_mesh_features(&mut output, source);
                    output
                },
                expected,
                "{source}"
            );
        }
    }
    #[test]
    fn reports_every_feature_once_in_discovery_order_and_only_inside_mesh_sections() {
        let source = "joints {\n\"root\" -1 ( 0 0 0 ) ( 0 0 0 )\n}\nmesh {\nshader \"models/body\"\nnumverts 1\nvert 0 ( 0.5 0.5 ) 0 1\nnumtris 1\ntri 0 0 0 0\nnumweights 1\nweight 0 0 1.0 ( 0 0 0 )\n}\n";
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_md5_mesh_features(&mut output, source);
                output
            },
            MD5_MESH_FEATURE_NAMES
        );
        assert_eq!(
            {
                let mut output = Vec::new();
                collect_md5_mesh_features(
                    &mut output,
                    "shader \"not-in-mesh\"\nmesh {\n}\nshader \"after\"",
                );
                output
            },
            vec!["Mesh"]
        );
    }
    #[test]
    fn clears_stale_results_retains_capacity_and_reads_a_retained_source_before_reusing_its_container()
     {
        let mut out = Vec::with_capacity(32);
        out.push("joints {\n}\nmesh {\nshader \"stone\"\n}".to_string());
        out.push("stale".to_string());
        let source = out[0].clone();
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        collect_md5_mesh_features(&mut out, &source);
        assert_eq!(out, ["Skeleton", "Mesh", "Material"]);
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        collect_md5_mesh_features(&mut out, "");
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}
