use flight_scene3d_gl::*;

mod gl_mesh_fragment_tail {
    use super::*;

    #[test]
    fn applies_node_alpha_before_premultiplying() {
        let object_alpha = GL_MESH_FRAGMENT_TAIL.find("u_objectAlpha");
        let premultiply = GL_MESH_FRAGMENT_TAIL.find("fragColor.rgb *= fragColor.a");
        assert!(object_alpha.is_some());
        assert!(premultiply.unwrap() > object_alpha.unwrap());
    }

    #[test]
    fn premultiplies_rgb_by_the_final_alpha_as_the_last_statement() {
        assert!(
            GL_MESH_FRAGMENT_TAIL
                .trim_end()
                .ends_with("fragColor.rgb *= fragColor.a;")
        );
    }
}
