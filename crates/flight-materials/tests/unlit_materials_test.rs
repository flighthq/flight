use flight_materials::unlit_materials::*;
use flight_materials::*;

mod create_depth_material {
    use super::*;
    #[test]
    fn creates_depth_material_with_unit_range() {
        let m = create_depth_material(None);
        assert_eq!(m.kind, DEPTH_MATERIAL_KIND);
        assert_eq!(m.far, 1.0);
        assert_eq!(m.near, 0.0);
    }
}

mod create_emissive_material {
    use super::*;
    #[test]
    fn creates_white_emissive_at_unit_strength() {
        let m = create_emissive_material(None);
        assert_eq!(m.kind, EMISSIVE_MATERIAL_KIND);
        assert_eq!(m.emissive, 0xffffffff);
        assert_eq!(m.emissive_strength, 1.0);
        assert!(m.emissive_map.is_none());
    }
}

mod create_matcap_material {
    use super::*;
    #[test]
    fn creates_matcap_with_white_tint() {
        let m = create_matcap_material(None);
        assert_eq!(m.kind, MATCAP_MATERIAL_KIND);
        assert_eq!(m.tint, 0xffffffff);
        assert!(m.matcap.is_none());
    }
}

mod create_normal_material {
    use super::*;
    #[test]
    fn creates_normal_material_with_unit_scale() {
        let m = create_normal_material(None);
        assert_eq!(m.kind, NORMAL_MATERIAL_KIND);
        assert_eq!(m.normal_scale, 1.0);
        assert!(m.normal_map.is_none());
    }
}

mod create_toon_material {
    use super::*;
    #[test]
    fn creates_toon_with_3_steps() {
        let m = create_toon_material(None);
        assert_eq!(m.kind, TOON_MATERIAL_KIND);
        assert_eq!(m.base_color, 0xffffffff);
        assert_eq!(m.steps, 3);
        assert!(m.ramp.is_none());
    }
}

mod create_unlit_material {
    use super::*;
    #[test]
    fn creates_white_unlit() {
        let m = create_unlit_material(None);
        assert_eq!(m.kind, UNLIT_MATERIAL_KIND);
        assert_eq!(m.base_color, 0xffffffff);
        assert!(m.base_color_map.is_none());
    }
}

mod create_vertex_color_material {
    use super::*;
    #[test]
    fn creates_vertex_color_with_white_tint() {
        let m = create_vertex_color_material(None);
        assert_eq!(m.kind, VERTEX_COLOR_MATERIAL_KIND);
        assert_eq!(m.tint, 0xffffffff);
    }
}

mod create_wireframe_material {
    use super::*;
    #[test]
    fn creates_wireframe_with_unit_thickness() {
        let m = create_wireframe_material(None);
        assert_eq!(m.kind, WIREFRAME_MATERIAL_KIND);
        assert_eq!(m.color, 0xffffffff);
        assert_eq!(m.thickness, 1.0);
    }
}

// flight-lint: allow(test-method-call) D18 sugar comparison: tests intentionally call methods to verify delegation
mod sugar_constructors {
    use super::*;

    #[test]
    fn depth_sugar_new_matches_free_function() {
        let free = create_depth_material(None);
        let sugar = DepthMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.far, sugar.far);
        assert_eq!(free.near, sugar.near);
    }

    #[test]
    fn emissive_sugar_new_matches_free_function() {
        let free = create_emissive_material(None);
        let sugar = EmissiveMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.emissive, sugar.emissive);
    }

    #[test]
    fn matcap_sugar_new_matches_free_function() {
        let free = create_matcap_material(None);
        let sugar = MatcapMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.tint, sugar.tint);
    }

    #[test]
    fn normal_sugar_new_matches_free_function() {
        let free = create_normal_material(None);
        let sugar = NormalMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.normal_scale, sugar.normal_scale);
    }

    #[test]
    fn toon_sugar_new_matches_free_function() {
        let free = create_toon_material(None);
        let sugar = ToonMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.steps, sugar.steps);
    }

    #[test]
    fn unlit_sugar_new_matches_free_function() {
        let free = create_unlit_material(None);
        let sugar = UnlitMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.base_color, sugar.base_color);
    }

    #[test]
    fn vertex_color_sugar_new_matches_free_function() {
        let free = create_vertex_color_material(None);
        let sugar = VertexColorMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.tint, sugar.tint);
    }

    #[test]
    fn wireframe_sugar_new_matches_free_function() {
        let free = create_wireframe_material(None);
        let sugar = WireframeMaterial::new(None);
        assert_eq!(free.kind, sugar.kind);
        assert_eq!(free.thickness, sugar.thickness);
    }
}
