use super::obj_test_helper::*;
use flight_scene3d_formats::*;

mod collect_obj_material_models {
    use super::*;

    #[test]
    fn classifies_actual_final_material_records_in_order_and_keeps_shared_emissive_channels_classic()
     {
        let mut models = Vec::with_capacity(16);
        models.push("stale".to_string());
        let pointer = models.as_ptr();
        let capacity = models.capacity();
        assert_eq!(
            {
                collect_obj_material_models(&mut models, "newmtl Red\nKd 1 0 0\nKs 1 1 1\nNs 30\n");
                models.as_slice()
            },
            [OBJ_MATERIAL_BLINN_PHONG_FEATURE]
        );
        assert_eq!(
            {
                collect_obj_material_models(&mut models, "newmtl Metal\nPr 0.3\nPm 1\n");
                models.as_slice()
            },
            [OBJ_MATERIAL_STANDARD_PBR_FEATURE]
        );
        assert_eq!(
            {
                collect_obj_material_models(
                    &mut models,
                    "newmtl Red\nKd 1 0 0\nnewmtl Metal\nPr 0.3\n",
                );
                models.as_slice()
            },
            [
                OBJ_MATERIAL_BLINN_PHONG_FEATURE,
                OBJ_MATERIAL_STANDARD_PBR_FEATURE
            ]
        );
        assert!(
            {
                collect_obj_material_models(&mut models, "# comment\n");
                models.as_slice()
            }
            .is_empty()
        );
        assert_eq!(
            {
                collect_obj_material_models(
                    &mut models,
                    "newmtl Glow\nKe 1 1 1\nmap_Ke glow.png\nnorm normal.png\n",
                );
                models.as_slice()
            },
            [OBJ_MATERIAL_BLINN_PHONG_FEATURE]
        );
        assert_eq!(
            {
                collect_obj_material_models(&mut models, "newmtl M\nPr 1\nnewmtl M\nKd 1 0 0\n");
                models.as_slice()
            },
            [OBJ_MATERIAL_BLINN_PHONG_FEATURE]
        );
        for directive in [
            "Pr 0.5",
            "Pm 1",
            "Ps 0.4",
            "Pc 0.2",
            "Pcr 0.1",
            "aniso 0.3",
            "anisor 0.2",
            "map_Pr tex.png",
            "map_Pm tex.png",
        ] {
            let library = parse_obj_material_library(&format!("newmtl M\n{directive}\n"), None);
            assert!(has_obj_pbr_directives(&library.materials[0].value));
            assert_eq!(
                {
                    collect_obj_material_models(&mut models, &format!("newmtl M\n{directive}\n"));
                    models.as_slice()
                },
                [OBJ_MATERIAL_STANDARD_PBR_FEATURE]
            );
        }
        assert_eq!(models.as_ptr(), pointer);
        assert_eq!(models.capacity(), capacity);
        for directive in ["Ke 1 1 1", "map_Ke tex.png"] {
            let library = parse_obj_material_library(&format!("newmtl M\n{directive}\n"), None);
            assert!(!has_obj_pbr_directives(&library.materials[0].value));
        }
    }
    #[test]
    fn clears_stale_models_and_reuses_the_buffer_when_the_input_was_retained_from_the_output() {
        let mut models = Vec::with_capacity(8);
        models.push("newmtl A\nPr 0.5\n".to_string());
        models.push("stale".to_string());
        let source = models[0].clone();
        let pointer = models.as_ptr();
        let capacity = models.capacity();
        collect_obj_material_models(&mut models, &source);
        assert_eq!(models, [OBJ_MATERIAL_STANDARD_PBR_FEATURE]);
        assert_eq!(models.as_ptr(), pointer);
        assert_eq!(models.capacity(), capacity);
        collect_obj_material_models(&mut models, "# empty");
        assert!(models.is_empty());
        assert_eq!(models.as_ptr(), pointer);
        assert_eq!(models.capacity(), capacity);
    }
}

mod has_obj_pbr_directives {
    use super::*;
    #[test]
    fn distinguishes_each_stated_pbr_field_including_zero_from_shared_emissive_or_normal_channels()
    {
        assert!(!has_obj_pbr_directives(&material_fixture("classic")));
        for field in 0..9 {
            let mut material = material_fixture("pbr");
            match field {
                0 => material.roughness = Some(0.0),
                1 => material.metallic = Some(0.0),
                2 => material.sheen = Some(0.0),
                3 => material.clearcoat = Some(0.0),
                4 => material.clearcoat_roughness = Some(0.0),
                5 => material.anisotropy = Some(0.0),
                6 => material.anisotropy_rotation = Some(0.0),
                7 => material.map_roughness = Some(String::new()),
                _ => material.map_metallic = Some("metal.png".to_string()),
            }
            assert!(has_obj_pbr_directives(&material), "field {field}");
        }
        let mut shared = material_fixture("shared");
        shared.emissive = Some([1.0; 3]);
        shared.map_emissive = Some("emissive.png".to_string());
        shared.map_normal = Some("normal.png".to_string());
        assert!(!has_obj_pbr_directives(&shared));
    }
}
