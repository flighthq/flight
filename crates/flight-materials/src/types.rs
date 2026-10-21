use std::sync::Arc;

use flight_entity::{EntityRuntimeSlot, Kind, Ref};
use flight_texture::Texture;

#[cfg(test)]
mod sugar_tests {
    mod color_scale_bias {
        use crate::color_scale_bias::*;
        use crate::*;

        #[test]
        fn sugar_new_matches_free_function() {
            let free = create_color_scale_bias(None);
            let sugar = ColorScaleBias::new(None);
            assert_eq!(free.red_scale, sugar.red_scale);
            assert_eq!(free.green_scale, sugar.green_scale);
            assert_eq!(free.blue_scale, sugar.blue_scale);
            assert_eq!(free.alpha_scale, sugar.alpha_scale);
            assert_eq!(free.red_bias, sugar.red_bias);
            assert_eq!(free.green_bias, sugar.green_bias);
            assert_eq!(free.blue_bias, sugar.blue_bias);
            assert_eq!(free.alpha_bias, sugar.alpha_bias);
        }

        #[test]
        fn sugar_clone_matches_free_function() {
            let opts = ColorScaleBiasOptions {
                red_scale: Some(0.5),
                green_scale: Some(0.6),
                blue_scale: Some(0.7),
                alpha_scale: Some(0.8),
                red_bias: Some(0.1),
                green_bias: Some(0.2),
                blue_bias: Some(0.3),
                alpha_bias: Some(0.4),
            };
            let source = create_color_scale_bias(Some(&opts));
            let free = clone_color_scale_bias(&source);
            let sugar = source.clone_color_scale_bias();
            assert_eq!(free.red_scale, sugar.red_scale);
            assert_eq!(free.alpha_bias, sugar.alpha_bias);
        }

        #[test]
        fn sugar_copy_from_matches_free_function() {
            let source = create_color_scale_bias(Some(&ColorScaleBiasOptions {
                red_scale: Some(2.0),
                green_scale: None,
                blue_scale: None,
                alpha_scale: None,
                red_bias: Some(0.5),
                green_bias: None,
                blue_bias: None,
                alpha_bias: None,
            }));
            let mut free_out = create_color_scale_bias(None);
            let mut sugar_out = create_color_scale_bias(None);
            copy_color_scale_bias(&mut free_out, &source);
            sugar_out.copy_from(&source);
            assert_eq!(free_out.red_scale, sugar_out.red_scale);
            assert_eq!(free_out.red_bias, sugar_out.red_bias);
        }

        #[test]
        fn sugar_equals_matches_free_function() {
            let a = create_color_scale_bias(None);
            let b = create_color_scale_bias(None);
            assert_eq!(equals_color_scale_bias(&a, &b), a.equals(&b));
        }

        #[test]
        fn sugar_equals_biases_matches_free_function() {
            let a = create_color_scale_bias(None);
            let b = create_color_scale_bias(None);
            assert_eq!(
                equals_color_scale_bias_biases(&a, &b, true),
                a.equals_biases(&b, true),
            );
            assert_eq!(
                equals_color_scale_bias_biases(&a, &b, false),
                a.equals_biases(&b, false),
            );
        }

        #[test]
        fn sugar_equals_scales_matches_free_function() {
            let a = create_color_scale_bias(None);
            let b = create_color_scale_bias(None);
            assert_eq!(
                equals_color_scale_bias_scales(&a, &b, true),
                a.equals_scales(&b, true),
            );
        }

        #[test]
        fn sugar_bias_rgb_matches_free_function() {
            let csb = create_color_scale_bias(None);
            assert_eq!(get_color_scale_bias_bias_rgb(&csb), csb.bias_rgb());
        }

        #[test]
        fn sugar_bias_rgba_matches_free_function() {
            let csb = create_color_scale_bias(None);
            assert_eq!(get_color_scale_bias_bias_rgba(&csb), csb.bias_rgba());
        }

        #[test]
        fn sugar_is_identity_matches_free_function() {
            let csb = create_color_scale_bias(None);
            assert_eq!(
                is_identity_color_scale_bias(&csb, true),
                csb.is_identity(true),
            );
            assert_eq!(
                is_identity_color_scale_bias(&csb, false),
                csb.is_identity(false),
            );
        }

        #[test]
        fn sugar_concat_matches_free_function() {
            let a = create_color_scale_bias(Some(&ColorScaleBiasOptions {
                red_scale: Some(0.5),
                green_scale: Some(1.0),
                blue_scale: Some(1.0),
                alpha_scale: Some(1.0),
                red_bias: Some(0.1),
                green_bias: Some(0.0),
                blue_bias: Some(0.0),
                alpha_bias: Some(0.0),
            }));
            let b = create_color_scale_bias(Some(&ColorScaleBiasOptions {
                red_scale: Some(2.0),
                green_scale: Some(1.0),
                blue_scale: Some(1.0),
                alpha_scale: Some(1.0),
                red_bias: Some(0.05),
                green_bias: Some(0.0),
                blue_bias: Some(0.0),
                alpha_bias: Some(0.0),
            }));
            let mut free_out = create_color_scale_bias(None);
            let mut sugar_out = create_color_scale_bias(None);
            concat_color_scale_bias(&mut free_out, &a, &b);
            sugar_out.concat(&a, &b);
            assert_eq!(free_out.red_scale, sugar_out.red_scale);
            assert_eq!(free_out.red_bias, sugar_out.red_bias);
        }

        #[test]
        fn sugar_invert_from_matches_free_function() {
            let source = create_color_scale_bias(Some(&ColorScaleBiasOptions {
                red_scale: Some(2.0),
                green_scale: Some(0.5),
                blue_scale: Some(1.0),
                alpha_scale: Some(1.0),
                red_bias: Some(0.1),
                green_bias: Some(0.0),
                blue_bias: Some(0.0),
                alpha_bias: Some(0.0),
            }));
            let mut free_out = create_color_scale_bias(None);
            let mut sugar_out = create_color_scale_bias(None);
            invert_color_scale_bias(&mut free_out, &source);
            sugar_out.invert_from(&source);
            assert_eq!(free_out.red_scale, sugar_out.red_scale);
            assert_eq!(free_out.red_bias, sugar_out.red_bias);
        }

        #[test]
        fn sugar_set_values_matches_free_function() {
            let mut free_out = create_color_scale_bias(None);
            let mut sugar_out = create_color_scale_bias(None);
            set_color_scale_bias(&mut free_out, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8);
            sugar_out.set_values(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8);
            assert_eq!(free_out.red_scale, sugar_out.red_scale);
            assert_eq!(free_out.alpha_bias, sugar_out.alpha_bias);
        }

        #[test]
        fn sugar_set_bias_rgb_matches_free_function() {
            let mut free_out = create_color_scale_bias(None);
            let mut sugar_out = create_color_scale_bias(None);
            set_color_scale_bias_bias_rgb(&mut free_out, 0xff8040);
            sugar_out.set_bias_rgb(0xff8040);
            assert_eq!(free_out.red_bias, sugar_out.red_bias);
            assert_eq!(free_out.green_bias, sugar_out.green_bias);
            assert_eq!(free_out.blue_bias, sugar_out.blue_bias);
        }

        #[test]
        fn sugar_set_bias_rgba_matches_free_function() {
            let mut free_out = create_color_scale_bias(None);
            let mut sugar_out = create_color_scale_bias(None);
            set_color_scale_bias_bias_rgba(&mut free_out, 0xff8040cc);
            sugar_out.set_bias_rgba(0xff8040cc);
            assert_eq!(free_out.red_bias, sugar_out.red_bias);
            assert_eq!(free_out.alpha_bias, sugar_out.alpha_bias);
        }

        #[test]
        fn sugar_set_identity_matches_free_function() {
            let opts = ColorScaleBiasOptions {
                red_scale: Some(2.0),
                green_scale: Some(3.0),
                blue_scale: Some(4.0),
                alpha_scale: Some(5.0),
                red_bias: Some(0.1),
                green_bias: Some(0.2),
                blue_bias: Some(0.3),
                alpha_bias: Some(0.4),
            };
            let mut free_out = create_color_scale_bias(Some(&opts));
            let mut sugar_out = create_color_scale_bias(Some(&opts));
            set_color_scale_bias_identity(&mut free_out);
            sugar_out.set_identity();
            assert_eq!(free_out.red_scale, sugar_out.red_scale);
            assert_eq!(free_out.alpha_bias, sugar_out.alpha_bias);
        }

        #[test]
        fn sugar_initialize_matches_free_function() {
            let opts = ColorScaleBiasOptions {
                red_scale: Some(0.5),
                green_scale: None,
                blue_scale: None,
                alpha_scale: None,
                red_bias: None,
                green_bias: None,
                blue_bias: None,
                alpha_bias: Some(0.9),
            };
            let mut free_out = create_color_scale_bias(None);
            let mut sugar_out = create_color_scale_bias(None);
            initialize_color_scale_bias(&mut free_out, Some(&opts));
            sugar_out.initialize(Some(&opts));
            assert_eq!(free_out.red_scale, sugar_out.red_scale);
            assert_eq!(free_out.alpha_bias, sugar_out.alpha_bias);
        }

        #[test]
        fn sugar_copy_to_arrays_matches_free_function() {
            let csb = create_color_scale_bias(Some(&ColorScaleBiasOptions {
                red_scale: Some(0.5),
                green_scale: Some(0.6),
                blue_scale: Some(0.7),
                alpha_scale: Some(0.8),
                red_bias: Some(0.1),
                green_bias: Some(0.2),
                blue_bias: Some(0.3),
                alpha_bias: Some(0.4),
            }));
            let mut free_scales: Vec<f32> = Vec::new();
            let mut free_biases: Vec<f32> = Vec::new();
            let mut sugar_scales: Vec<f32> = Vec::new();
            let mut sugar_biases: Vec<f32> = Vec::new();
            copy_color_scale_bias_to_arrays(&mut free_scales, &mut free_biases, &csb);
            csb.copy_to_arrays(&mut sugar_scales, &mut sugar_biases);
            assert_eq!(free_scales, sugar_scales);
            assert_eq!(free_biases, sugar_biases);
        }
    }

    mod material {
        use crate::material::*;
        use crate::*;

        #[test]
        fn sugar_new_matches_free_function() {
            let free = create_material("TestKind".to_string());
            let sugar = Material::new("TestKind".to_string());
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.name, sugar.name);
        }

        #[test]
        fn sugar_clone_material_matches_free_function() {
            let mut source = create_material("CloneTest".to_string());
            source.name = Some("original".to_string());
            let free = clone_material(&source);
            let sugar = source.clone_material();
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.name, sugar.name);
        }

        #[test]
        fn sugar_copy_from_matches_free_function() {
            let mut source = create_material("CopyKind".to_string());
            source.name = Some("src".to_string());
            let mut free_out = create_material("".to_string());
            let mut sugar_out = create_material("".to_string());
            copy_material(&mut free_out, &source);
            sugar_out.copy_from(&source);
            assert_eq!(free_out.kind, sugar_out.kind);
            assert_eq!(free_out.name, sugar_out.name);
        }

        #[test]
        fn sugar_equals_matches_free_function() {
            let a = create_material("A".to_string());
            let b = create_material("A".to_string());
            let c = create_material("C".to_string());
            assert_eq!(equals_material(&a, &b), a.equals(&b));
            assert_eq!(equals_material(&a, &c), a.equals(&c));
        }

        #[test]
        fn sugar_of_kind_matches_free_function() {
            let mat = create_material("TargetKind".to_string());
            let free_some = get_material_of_kind(Some(&mat), "TargetKind");
            let sugar_some = Material::of_kind(Some(&mat), "TargetKind");
            assert!(free_some.is_some());
            assert!(sugar_some.is_some());
            assert_eq!(free_some.unwrap().kind, sugar_some.unwrap().kind);
            let free_none = get_material_of_kind(Some(&mat), "Other");
            let sugar_none = Material::of_kind(Some(&mat), "Other");
            assert!(free_none.is_none());
            assert!(sugar_none.is_none());
        }

        #[test]
        fn sugar_initialize_matches_free_function() {
            let mut free_out = create_material("".to_string());
            let mut sugar_out = create_material("".to_string());
            initialize_material(&mut free_out, "InitKind".to_string());
            sugar_out.initialize("InitKind".to_string());
            assert_eq!(free_out.kind, sugar_out.kind);
        }
    }

    mod material3d {
        use crate::material3d::*;
        use crate::*;
        use flight_entity::allocate_entity;

        #[test]
        fn sugar_new_matches_free_function() {
            let free = create_material3d("Test3D".to_string(), None);
            let sugar = Material3DFields::new("Test3D".to_string(), None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.name, sugar.name);
            assert_eq!(free.alpha_mode, sugar.alpha_mode);
            assert_eq!(free.alpha_cutoff, sugar.alpha_cutoff);
            assert_eq!(free.blend_mode, sugar.blend_mode);
            assert_eq!(free.double_sided, sugar.double_sided);
        }

        #[test]
        fn sugar_alpha_mode_matches_free_function() {
            let mat = create_material3d("Test".to_string(), None);
            assert_eq!(get_material3d_alpha_mode(&mat), mat.alpha_mode());
        }

        #[test]
        fn sugar_is_blended_matches_free_function() {
            let mat = create_material3d("Test".to_string(), None);
            assert_eq!(is_material3d_blended(&mat), mat.is_blended());
        }

        #[test]
        fn sugar_is_masked_matches_free_function() {
            let mat = create_material3d("Test".to_string(), None);
            assert_eq!(is_material3d_masked(&mat), mat.is_masked());
        }

        #[test]
        fn sugar_is_opaque_matches_free_function() {
            let mat = create_material3d("Test".to_string(), None);
            assert_eq!(is_material3d_opaque(&mat), mat.is_opaque());
        }

        #[test]
        fn sugar_initialize_matches_free_function() {
            let mut free_mat: Material3DFields = allocate_entity();
            let mut sugar_mat: Material3DFields = allocate_entity();
            initialize_material3d(&mut free_mat, "Init3D".to_string(), None);
            sugar_mat.initialize("Init3D".to_string(), None);
            assert_eq!(free_mat.kind, sugar_mat.kind);
            assert_eq!(free_mat.alpha_mode, sugar_mat.alpha_mode);
        }

        #[test]
        fn material3d_is_separate_from_material2d() {
            fn accepts_material3d(m: &dyn Material3D) -> &str {
                return &m.material3d_fields().kind;
            }
            let mat = create_material3d("Test".to_string(), None);
            assert_eq!(accepts_material3d(&mat), "Test");
            let phong = crate::classic_materials::create_phong_material(None);
            assert_eq!(accepts_material3d(&phong), PHONG_MATERIAL_KIND);
        }
    }

    mod standard_material {
        use crate::standard_material::*;
        use crate::*;
        use flight_entity::allocate_entity;

        #[test]
        fn sugar_new_matches_free_function() {
            let opts = StandardMaterialOptions {
                name: Some("Sugar".to_string()),
            };
            let free = create_standard_material(Some(&opts));
            let sugar = StandardMaterial::new(Some(&opts));
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.name, sugar.name);
        }

        #[test]
        fn sugar_initialize_matches_free_function() {
            let opts = StandardMaterialOptions {
                name: Some("Init".to_string()),
            };
            let mut free_out: StandardMaterial = allocate_entity();
            let mut sugar_out: StandardMaterial = allocate_entity();
            initialize_standard_material(&mut free_out, Some(&opts));
            sugar_out.initialize(Some(&opts));
            assert_eq!(free_out.kind, sugar_out.kind);
            assert_eq!(free_out.name, sugar_out.name);
        }
    }

    mod classic_materials {
        use crate::classic_materials::*;
        use crate::*;

        #[test]
        fn blinn_phong_sugar_new_matches_free_function() {
            let free = create_blinn_phong_material(None);
            let sugar = BlinnPhongMaterial::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.diffuse, sugar.diffuse);
            assert_eq!(free.shininess, sugar.shininess);
        }

        #[test]
        fn lambert_sugar_new_matches_free_function() {
            let free = create_lambert_material(None);
            let sugar = LambertMaterial::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.diffuse, sugar.diffuse);
            assert_eq!(free.emissive, sugar.emissive);
        }

        #[test]
        fn phong_sugar_new_matches_free_function() {
            let free = create_phong_material(None);
            let sugar = PhongMaterial::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.diffuse, sugar.diffuse);
            assert_eq!(free.shininess, sugar.shininess);
        }
    }

    mod unlit_materials {
        use crate::unlit_materials::*;
        use crate::*;

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

    mod pbr_materials {
        use crate::pbr_materials::*;
        use crate::*;

        #[test]
        fn standard_pbr_sugar_new_matches_free_function() {
            let free = create_standard_pbr_material(None);
            let sugar = StandardPbrMaterial::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.base_color, sugar.base_color);
            assert_eq!(free.metallic, sugar.metallic);
            assert_eq!(free.roughness, sugar.roughness);
        }

        #[test]
        fn specular_glossiness_sugar_new_matches_free_function() {
            let free = create_specular_glossiness_pbr_material(None);
            let sugar = SpecularGlossinessPbrMaterial::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.diffuse, sugar.diffuse);
            assert_eq!(free.glossiness, sugar.glossiness);
        }

        #[test]
        fn standard_pbr_properties_sugar_new_matches_free_function() {
            let free = create_standard_pbr_material_properties(None);
            let sugar = StandardPbrMaterialProperties::new(None);
            assert_eq!(free.base_color, sugar.base_color);
            assert_eq!(free.metallic, sugar.metallic);
            assert_eq!(free.roughness, sugar.roughness);
        }

        #[test]
        fn specular_glossiness_sugar_convert_matches_free_function() {
            let source = create_specular_glossiness_pbr_material(None);
            let mut free_out = create_standard_pbr_material_properties(None);
            let mut sugar_out = create_standard_pbr_material_properties(None);
            convert_specular_glossiness_to_standard_pbr(&mut free_out, &source, None);
            source.convert_to_standard_pbr(&mut sugar_out, None);
            assert_eq!(free_out.roughness, sugar_out.roughness);
            assert_eq!(free_out.metallic, sugar_out.metallic);
            assert_eq!(free_out.base_color, sugar_out.base_color);
        }
    }

    mod extended_pbr {
        use crate::extended_pbr_material::*;
        use crate::*;

        #[test]
        fn sugar_new_matches_free_function() {
            let free = create_extended_pbr_material(None);
            let sugar = ExtendedPbrMaterial::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.standard.base_color, sugar.standard.base_color);
            assert_eq!(free.standard.roughness, sugar.standard.roughness);
        }
    }

    mod custom_shader {
        use crate::custom_shader_material::*;
        use crate::*;

        #[test]
        fn sugar_new_matches_free_function() {
            let free = create_custom_shader_material(None);
            let sugar = CustomShaderMaterial::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.alpha_cutoff, sugar.alpha_cutoff);
            assert_eq!(free.alpha_mode, sugar.alpha_mode);
        }
    }

    mod pbr_extensions {
        use crate::anisotropy_pbr_extension::*;
        use crate::clearcoat_pbr_extension::*;
        use crate::iridescence_pbr_extension::*;
        use crate::sheen_pbr_extension::*;
        use crate::specular_pbr_extension::*;
        use crate::transmission_volume_pbr_extension::*;
        use crate::wrapped_diffuse_pbr_extension::*;
        use crate::*;

        #[test]
        fn anisotropy_sugar_new_matches_free_function() {
            let free = create_anisotropy_pbr_extension(None);
            let sugar = AnisotropyPbrExtension::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.anisotropy_strength, sugar.anisotropy_strength);
        }

        #[test]
        fn anisotropy_sugar_is_valid_matches_free_function() {
            let ext = create_anisotropy_pbr_extension(None);
            assert_eq!(is_valid_anisotropy_pbr_extension(&ext), ext.is_valid());
        }

        #[test]
        fn clearcoat_sugar_new_matches_free_function() {
            let free = create_clearcoat_pbr_extension(None);
            let sugar = ClearcoatPbrExtension::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.clearcoat, sugar.clearcoat);
        }

        #[test]
        fn clearcoat_sugar_is_valid_matches_free_function() {
            let ext = create_clearcoat_pbr_extension(None);
            assert_eq!(is_valid_clearcoat_pbr_extension(&ext), ext.is_valid());
        }

        #[test]
        fn iridescence_sugar_new_matches_free_function() {
            let free = create_iridescence_pbr_extension(None);
            let sugar = IridescencePbrExtension::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.iridescence, sugar.iridescence);
        }

        #[test]
        fn iridescence_sugar_is_valid_matches_free_function() {
            let ext = create_iridescence_pbr_extension(None);
            assert_eq!(is_valid_iridescence_pbr_extension(&ext), ext.is_valid());
        }

        #[test]
        fn sheen_sugar_new_matches_free_function() {
            let free = create_sheen_pbr_extension(None);
            let sugar = SheenPbrExtension::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.sheen_color, sugar.sheen_color);
        }

        #[test]
        fn sheen_sugar_is_valid_matches_free_function() {
            let ext = create_sheen_pbr_extension(None);
            assert_eq!(is_valid_sheen_pbr_extension(&ext), ext.is_valid());
        }

        #[test]
        fn specular_sugar_new_matches_free_function() {
            let free = create_specular_pbr_extension(None);
            let sugar = SpecularPbrExtension::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.specular, sugar.specular);
        }

        #[test]
        fn specular_sugar_is_valid_matches_free_function() {
            let ext = create_specular_pbr_extension(None);
            assert_eq!(is_valid_specular_pbr_extension(&ext), ext.is_valid());
        }

        #[test]
        fn transmission_volume_sugar_new_matches_free_function() {
            let free = create_transmission_volume_pbr_extension(None);
            let sugar = TransmissionVolumePbrExtension::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.transmission, sugar.transmission);
        }

        #[test]
        fn transmission_volume_sugar_is_valid_matches_free_function() {
            let ext = create_transmission_volume_pbr_extension(None);
            assert_eq!(
                is_valid_transmission_volume_pbr_extension(&ext),
                ext.is_valid(),
            );
        }

        #[test]
        fn wrapped_diffuse_sugar_new_matches_free_function() {
            let free = create_wrapped_diffuse_pbr_extension(None);
            let sugar = WrappedDiffusePbrExtension::new(None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(
                free.wrapped_diffuse_strength,
                sugar.wrapped_diffuse_strength
            );
        }

        #[test]
        fn wrapped_diffuse_sugar_is_valid_matches_free_function() {
            let ext = create_wrapped_diffuse_pbr_extension(None);
            assert_eq!(is_valid_wrapped_diffuse_pbr_extension(&ext), ext.is_valid(),);
        }

        #[test]
        fn sugar_kind_returns_wrapped_extension_kind() {
            let aniso = PbrExtension::Anisotropy(create_anisotropy_pbr_extension(None));
            assert_eq!(aniso.kind(), ANISOTROPY_PBR_EXTENSION_KIND);
            let clearcoat = PbrExtension::Clearcoat(create_clearcoat_pbr_extension(None));
            assert_eq!(clearcoat.kind(), CLEARCOAT_PBR_EXTENSION_KIND);
        }
    }

    mod conversions {
        use crate::classic_materials::create_phong_material;
        use crate::explain_material_conversion::*;
        use crate::pbr_materials::*;
        use crate::phong_to_pbr::*;
        use crate::*;

        #[test]
        fn sugar_convert_phong_to_standard_pbr_matches_free_function() {
            let phong = create_phong_material(None);
            let free = convert_phong_to_standard_pbr_material(&phong, None, None);
            let sugar = phong.convert_to_standard_pbr(None, None);
            assert_eq!(free.kind, sugar.kind);
            assert_eq!(free.base_color, sugar.base_color);
            assert_eq!(free.roughness, sugar.roughness);
            assert_eq!(free.metallic, sugar.metallic);
        }

        #[test]
        fn sugar_explain_phong_matches_free_function() {
            let phong = create_phong_material(None);
            let free = explain_phong_conversion(&phong);
            let sugar = phong.explain_conversion();
            assert_eq!(free.dropped_maps, sugar.dropped_maps);
            assert_eq!(free.reason, sugar.reason);
        }

        #[test]
        fn sugar_explain_specular_glossiness_matches_free_function() {
            let mat = create_specular_glossiness_pbr_material(None);
            let free = explain_specular_glossiness_conversion(&mat);
            let sugar = mat.explain_conversion();
            assert_eq!(free.dropped_maps, sugar.dropped_maps);
            assert_eq!(free.reason, sugar.reason);
        }

        #[test]
        fn sugar_new_material_conversion_context_matches_free_function() {
            use std::sync::{Arc, Mutex};

            let free_called = Arc::new(Mutex::new(false));
            let sugar_called = Arc::new(Mutex::new(false));
            let fc = free_called.clone();
            let sc = sugar_called.clone();
            let free_guard: MaterialConversionGuard = Arc::new(move |_, _| {
                *fc.lock().unwrap() = true;
            });
            let sugar_guard: MaterialConversionGuard = Arc::new(move |_, _| {
                *sc.lock().unwrap() = true;
            });
            let free_ctx = create_material_conversion_context(free_guard);
            let sugar_ctx = MaterialConversionContext::new(sugar_guard);
            let explanation = MaterialConversionExplanation {
                dropped_maps: vec!["map".to_string()],
                reason: None,
            };
            report_material_conversion_drop(Some(&free_ctx), &explanation, "test");
            report_material_conversion_drop(Some(&sugar_ctx), &explanation, "test");
            assert!(*free_called.lock().unwrap());
            assert!(*sugar_called.lock().unwrap());
        }
    }

    mod material_validation {
        use crate::material_validation::*;
        use crate::pbr_materials::create_standard_pbr_material_properties;
        use crate::*;

        #[test]
        fn sugar_clamp_matches_free_function() {
            let mut free_props = create_standard_pbr_material_properties(None);
            free_props.metallic = 1.5;
            free_props.roughness = -0.5;
            let mut sugar_props = create_standard_pbr_material_properties(None);
            sugar_props.metallic = 1.5;
            sugar_props.roughness = -0.5;
            clamp_standard_pbr_material_properties(&mut free_props);
            sugar_props.clamp();
            assert_eq!(free_props.metallic, sugar_props.metallic);
            assert_eq!(free_props.roughness, sugar_props.roughness);
        }
    }
}

// ── Texture reference alias ──────────────────────────────────────────────────

pub type TextureSlot = Option<Ref<Texture>>;

// ── Alpha mode ───────────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum MaterialAlphaMode {
    Blend,
    Mask,
    #[default]
    Opaque,
}

// ── Blend mode ───────────────────────────────────────────────────────────────

pub const BLEND_MODE_ADD: &str = "Add";
pub const BLEND_MODE_DARKEN: &str = "Darken";
pub const BLEND_MODE_LIGHTEN: &str = "Lighten";
pub const BLEND_MODE_MULTIPLY: &str = "Multiply";
pub const BLEND_MODE_NORMAL: &str = "Normal";
pub const BLEND_MODE_SCREEN: &str = "Screen";

pub type BlendMode = String;

// ── PBR UV set ───────────────────────────────────────────────────────────────

pub type PbrUvSet = u32;

// ── Material conversion ──────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MaterialConversionDropReason {
    IncompatibleChannelSemantics,
    UnsupportedByTargetModel,
}

#[derive(Clone, Debug, PartialEq)]
pub struct MaterialConversionExplanation {
    pub dropped_maps: Vec<String>,
    pub reason: Option<MaterialConversionDropReason>,
}

pub type MaterialConversionGuard = Arc<dyn Fn(&MaterialConversionExplanation, &str) + Send + Sync>;

pub struct MaterialConversionContext {
    pub(crate) guard: MaterialConversionGuard,
}

// ── Material base ────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct Material {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub name: Option<String>,
}

// ── Material2D (open family) ────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct Material2DFields {
    material: Material,
}

pub trait Material2D: flight_entity::Entity + Send + Sync {
    fn material2d_fields(&self) -> &Material2DFields;
    fn material2d_fields_mut(&mut self) -> &mut Material2DFields;
}

// ── MaterialData (open family) ──────────────────────────────────────────────

#[derive(Clone, Debug, Default)]
pub struct MaterialDataFields {
    runtime: EntityRuntimeSlot,
}

pub trait MaterialData: flight_entity::Entity + Send + Sync {
    fn material_data_fields(&self) -> &MaterialDataFields;
    fn material_data_fields_mut(&mut self) -> &mut MaterialDataFields;
}

// ── TintMaterialData ────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct TintMaterialData {
    fields: MaterialDataFields,
    pub tint: u32,
}

// ── Material3D (open family) ────────────────────────────────────────────────

/// The base fields every 3D material has (TS `Material3D`): the shared `Material` (kind, name and
/// the one entity runtime) plus the alpha/blend/sidedness trailer. A kind struct composes it as
/// `fields` and dereferences to it, so `material.alpha_mode` and `material.kind` read flat (D16).
#[derive(Clone, Debug)]
pub struct Material3DFields {
    material: Material,
    pub alpha_cutoff: f32,
    pub alpha_mode: MaterialAlphaMode,
    pub blend_mode: BlendMode,
    pub double_sided: bool,
}

/// Any 3D material (TS `Material3D`, an open base contract): built-in kinds, shading's
/// `ShadedMaterial` and caller kinds. Held as `Material3DRef` so a mesh keeps the caller's original
/// allocation. Implement it for a kind struct with `impl_material3d!`.
pub trait Material3D: flight_entity::Entity + std::any::Any + Send + Sync {
    fn material3d_fields(&self) -> &Material3DFields;
    fn material3d_fields_mut(&mut self) -> &mut Material3DFields;
    fn as_any(&self) -> &dyn std::any::Any;
    fn as_any_mut(&mut self) -> &mut dyn std::any::Any;
}

/// A shared 3D material of any kind (TS `Material3D` object identity).
// flight-lint: allow(contract-vocabulary) D16 open Material3D family handle, as Ref<dyn Material2D> for the 2D family
pub type Material3DRef = Ref<dyn Material3D>;

/// Implements the Material3D family plumbing for a kind struct with a `fields: Material3DFields`
/// field: `Entity` (the one runtime inside the shared `Material`), `Material3D`, and
/// `Deref`/`DerefMut` to `Material3DFields`.
#[macro_export]
macro_rules! impl_material3d {
    ($t:ty) => {
        impl flight_entity::Entity for $t {
            fn entity_runtime(&self) -> &flight_entity::EntityRuntimeSlot {
                return flight_entity::Entity::entity_runtime(&self.fields);
            }

            fn entity_runtime_mut(&mut self) -> &mut flight_entity::EntityRuntimeSlot {
                return flight_entity::Entity::entity_runtime_mut(&mut self.fields);
            }
        }

        impl $crate::Material3D for $t {
            fn material3d_fields(&self) -> &$crate::Material3DFields {
                return &self.fields;
            }

            fn material3d_fields_mut(&mut self) -> &mut $crate::Material3DFields {
                return &mut self.fields;
            }

            fn as_any(&self) -> &dyn std::any::Any {
                return self;
            }

            fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
                return self;
            }
        }

        impl std::ops::Deref for $t {
            type Target = $crate::Material3DFields;

            fn deref(&self) -> &$crate::Material3DFields {
                return &self.fields;
            }
        }

        impl std::ops::DerefMut for $t {
            fn deref_mut(&mut self) -> &mut $crate::Material3DFields {
                return &mut self.fields;
            }
        }
    };
}

// ── Standard material (2D) ───────────────────────────────────────────────────

pub const STANDARD_MATERIAL_KIND: &str = "StandardMaterial";

#[derive(Clone, Debug)]
pub struct StandardMaterial {
    fields: Material2DFields,
}

// ── Classic materials ────────────────────────────────────────────────────────

pub const BLINN_PHONG_MATERIAL_KIND: &str = "BlinnPhongMaterial";

#[derive(Clone, Debug)]
pub struct BlinnPhongMaterial {
    fields: Material3DFields,
    pub alpha_map: TextureSlot,
    pub diffuse: u32,
    pub diffuse_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub shininess: f32,
    pub specular: u32,
    pub specular_map: TextureSlot,
}

pub const LAMBERT_MATERIAL_KIND: &str = "LambertMaterial";

#[derive(Clone, Debug)]
pub struct LambertMaterial {
    fields: Material3DFields,
    pub diffuse: u32,
    pub diffuse_map: TextureSlot,
    pub emissive: u32,
    pub emissive_map: TextureSlot,
}

pub const PHONG_MATERIAL_KIND: &str = "PhongMaterial";

#[derive(Clone, Debug)]
pub struct PhongMaterial {
    fields: Material3DFields,
    pub diffuse: u32,
    pub diffuse_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub shininess: f32,
    pub specular: u32,
    pub specular_map: TextureSlot,
}

// ── Unlit materials ──────────────────────────────────────────────────────────

pub const DEPTH_MATERIAL_KIND: &str = "DepthMaterial";

#[derive(Clone, Debug)]
pub struct DepthMaterial {
    fields: Material3DFields,
    pub far: f32,
    pub near: f32,
}

pub const EMISSIVE_MATERIAL_KIND: &str = "EmissiveMaterial";

#[derive(Clone, Debug)]
pub struct EmissiveMaterial {
    fields: Material3DFields,
    pub emissive: u32,
    pub emissive_map: TextureSlot,
    pub emissive_strength: f32,
}

pub const MATCAP_MATERIAL_KIND: &str = "MatcapMaterial";

#[derive(Clone, Debug)]
pub struct MatcapMaterial {
    fields: Material3DFields,
    pub matcap: TextureSlot,
    pub tint: u32,
}

pub const NORMAL_MATERIAL_KIND: &str = "NormalMaterial";

#[derive(Clone, Debug)]
pub struct NormalMaterial {
    fields: Material3DFields,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
}

pub const TOON_MATERIAL_KIND: &str = "ToonMaterial";

#[derive(Clone, Debug)]
pub struct ToonMaterial {
    fields: Material3DFields,
    pub base_color: u32,
    pub base_color_map: TextureSlot,
    pub ramp: TextureSlot,
    pub steps: u32,
}

pub const UNLIT_MATERIAL_KIND: &str = "UnlitMaterial";

#[derive(Clone, Debug)]
pub struct UnlitMaterial {
    fields: Material3DFields,
    pub base_color: u32,
    pub base_color_map: TextureSlot,
}

pub const VERTEX_COLOR_MATERIAL_KIND: &str = "VertexColorMaterial";

#[derive(Clone, Debug)]
pub struct VertexColorMaterial {
    fields: Material3DFields,
    pub tint: u32,
}

pub const WIREFRAME_MATERIAL_KIND: &str = "WireframeMaterial";

#[derive(Clone, Debug)]
pub struct WireframeMaterial {
    fields: Material3DFields,
    pub color: u32,
    pub thickness: f32,
}

// ── PBR materials ────────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct StandardPbrMaterialProperties {
    pub alpha_map: TextureSlot,
    pub base_color: u32,
    pub base_color_map: TextureSlot,
    pub emissive: u32,
    pub emissive_map: TextureSlot,
    pub emissive_strength: f32,
    pub metallic: f32,
    pub metallic_roughness_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: f32,
    pub roughness: f32,
}

pub const STANDARD_PBR_MATERIAL_KIND: &str = "StandardPbrMaterial";

#[derive(Clone, Debug)]
pub struct StandardPbrMaterial {
    fields: Material3DFields,
    pub alpha_map: TextureSlot,
    pub base_color: u32,
    pub base_color_map: TextureSlot,
    pub emissive: u32,
    pub emissive_map: TextureSlot,
    pub emissive_strength: f32,
    pub metallic: f32,
    pub metallic_roughness_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: f32,
    pub roughness: f32,
}

pub const SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND: &str = "SpecularGlossinessPbrMaterial";

#[derive(Clone, Debug)]
pub struct SpecularGlossinessPbrMaterial {
    fields: Material3DFields,
    pub diffuse: u32,
    pub diffuse_map: TextureSlot,
    pub emissive: u32,
    pub emissive_map: TextureSlot,
    pub emissive_strength: f32,
    pub glossiness: f32,
    pub normal_map: TextureSlot,
    pub normal_scale: f32,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: f32,
    pub specular: u32,
    pub specular_glossiness_map: TextureSlot,
}

// ── Extended PBR material ────────────────────────────────────────────────────

pub const EXTENDED_PBR_MATERIAL_KIND: &str = "ExtendedPbrMaterial";

#[derive(Clone, Debug)]
pub struct ExtendedPbrMaterial {
    fields: Material3DFields,
    pub extensions: Vec<PbrExtension>,
    pub standard: StandardPbrMaterialProperties,
}

// ── Custom shader material ───────────────────────────────────────────────────

pub const CUSTOM_SHADER_MATERIAL_KIND: &str = "CustomShaderMaterial";

// flight-lint: allow(contract-vocabulary) D16 uniforms/textures are open bags per TS CustomShaderMaterial.textures: Record<string, Texture> | null and uniforms: Record<string, number | number[]> | null
#[derive(Clone, Debug)]
pub struct CustomShaderMaterial {
    fields: Material3DFields,
    pub shader_key: String,
    // flight-lint: allow(contract-vocabulary) open bag of named texture bindings per TS Record<string, Texture> | null
    pub textures: Option<std::collections::HashMap<String, Ref<Texture>>>,
    // flight-lint: allow(contract-vocabulary) open bag of scalar/vector uniforms per TS Record<string, number | number[]> | null
    pub uniforms: Option<std::collections::HashMap<String, UniformValue>>,
}

#[derive(Clone, Debug)]
pub enum UniformValue {
    Scalar(f32),
    // flight-lint: allow(contract-vocabulary) TS number[] uniform arrays
    // flight-lint: allow(enum-payload-named) TS number[] maps directly to Vec<f32>; a wrapper struct adds no semantic value
    Array(Vec<f32>),
}

// ── PBR extensions ───────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub enum PbrExtension {
    Anisotropy(AnisotropyPbrExtension),
    Clearcoat(ClearcoatPbrExtension),
    Iridescence(IridescencePbrExtension),
    Sheen(SheenPbrExtension),
    Specular(SpecularPbrExtension),
    TransmissionVolume(TransmissionVolumePbrExtension),
    WrappedDiffuse(WrappedDiffusePbrExtension),
}

pub const ANISOTROPY_PBR_EXTENSION_KIND: &str = "AnisotropyPbrExtension";

#[derive(Clone, Debug)]
pub struct AnisotropyPbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub anisotropy_map: TextureSlot,
    pub anisotropy_map_uv_set: PbrUvSet,
    pub anisotropy_rotation: f32,
    pub anisotropy_strength: f32,
}

pub const CLEARCOAT_PBR_EXTENSION_KIND: &str = "ClearcoatPbrExtension";

#[derive(Clone, Debug)]
pub struct ClearcoatPbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub clearcoat: f32,
    pub clearcoat_map: TextureSlot,
    pub clearcoat_map_uv_set: PbrUvSet,
    pub clearcoat_normal_map: TextureSlot,
    pub clearcoat_normal_map_uv_set: PbrUvSet,
    pub clearcoat_normal_scale: f32,
    pub clearcoat_roughness: f32,
    pub clearcoat_roughness_map: TextureSlot,
    pub clearcoat_roughness_map_uv_set: PbrUvSet,
}

pub const IRIDESCENCE_PBR_EXTENSION_KIND: &str = "IridescencePbrExtension";

#[derive(Clone, Debug)]
pub struct IridescencePbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub iridescence: f32,
    pub iridescence_ior: f32,
    pub iridescence_map: TextureSlot,
    pub iridescence_map_uv_set: PbrUvSet,
    pub iridescence_thickness_map: TextureSlot,
    pub iridescence_thickness_map_uv_set: PbrUvSet,
    pub iridescence_thickness_max: f32,
    pub iridescence_thickness_min: f32,
}

pub const SHEEN_PBR_EXTENSION_KIND: &str = "SheenPbrExtension";

#[derive(Clone, Debug)]
pub struct SheenPbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub sheen_color: u32,
    pub sheen_color_map: TextureSlot,
    pub sheen_color_map_uv_set: PbrUvSet,
    pub sheen_roughness: f32,
    pub sheen_roughness_map: TextureSlot,
    pub sheen_roughness_map_uv_set: PbrUvSet,
}

pub const SPECULAR_PBR_EXTENSION_KIND: &str = "SpecularPbrExtension";

#[derive(Clone, Debug)]
pub struct SpecularPbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub specular: f32,
    pub specular_color: u32,
    pub specular_color_map: TextureSlot,
    pub specular_color_map_uv_set: PbrUvSet,
    pub specular_map: TextureSlot,
    pub specular_map_uv_set: PbrUvSet,
}

pub const TRANSMISSION_VOLUME_PBR_EXTENSION_KIND: &str = "TransmissionVolumePbrExtension";

#[derive(Clone, Debug)]
pub struct TransmissionVolumePbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub attenuation_color: u32,
    pub attenuation_distance: f32,
    pub ior: f32,
    pub thickness: f32,
    pub thickness_map: TextureSlot,
    pub thickness_map_uv_set: PbrUvSet,
    pub transmission: f32,
    pub transmission_map: TextureSlot,
    pub transmission_map_uv_set: PbrUvSet,
}

pub const WRAPPED_DIFFUSE_PBR_EXTENSION_KIND: &str = "WrappedDiffusePbrExtension";

#[derive(Clone, Debug)]
pub struct WrappedDiffusePbrExtension {
    runtime: EntityRuntimeSlot,
    pub kind: Kind,
    pub thickness: f32,
    pub thickness_map: TextureSlot,
    pub thickness_map_uv_set: PbrUvSet,
    pub wrapped_diffuse_color: u32,
    pub wrapped_diffuse_map: TextureSlot,
    pub wrapped_diffuse_map_uv_set: PbrUvSet,
    pub wrapped_diffuse_strength: f32,
}

// ── ColorScaleBias ───────────────────────────────────────────────────────────

#[derive(Clone, Debug)]
pub struct ColorScaleBias {
    runtime: EntityRuntimeSlot,
    pub red_scale: f32,
    pub green_scale: f32,
    pub blue_scale: f32,
    pub alpha_scale: f32,
    pub red_bias: f32,
    pub green_bias: f32,
    pub blue_bias: f32,
    pub alpha_bias: f32,
}

// ── Options types ────────────────────────────────────────────────────────────

#[derive(Clone, Debug, Default)]
pub struct StandardMaterialOptions {
    pub name: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct ColorScaleBiasOptions {
    pub red_scale: Option<f32>,
    pub green_scale: Option<f32>,
    pub blue_scale: Option<f32>,
    pub alpha_scale: Option<f32>,
    pub red_bias: Option<f32>,
    pub green_bias: Option<f32>,
    pub blue_bias: Option<f32>,
    pub alpha_bias: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct BlinnPhongMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub alpha_map: TextureSlot,
    pub diffuse: Option<u32>,
    pub diffuse_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub shininess: Option<f32>,
    pub specular: Option<u32>,
    pub specular_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct LambertMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub diffuse: Option<u32>,
    pub diffuse_map: TextureSlot,
    pub emissive: Option<u32>,
    pub emissive_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct PhongMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub diffuse: Option<u32>,
    pub diffuse_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub shininess: Option<f32>,
    pub specular: Option<u32>,
    pub specular_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct DepthMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub far: Option<f32>,
    pub near: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct EmissiveMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub emissive: Option<u32>,
    pub emissive_map: TextureSlot,
    pub emissive_strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct MatcapMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub matcap: TextureSlot,
    pub tint: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct NormalMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct ToonMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub base_color: Option<u32>,
    pub base_color_map: TextureSlot,
    pub ramp: TextureSlot,
    pub steps: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct UnlitMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub base_color: Option<u32>,
    pub base_color_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct VertexColorMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub tint: Option<u32>,
}

#[derive(Clone, Debug, Default)]
pub struct WireframeMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub color: Option<u32>,
    pub thickness: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct StandardPbrMaterialPropertiesOptions {
    pub alpha_map: TextureSlot,
    pub base_color: Option<u32>,
    pub base_color_map: TextureSlot,
    pub emissive: Option<u32>,
    pub emissive_map: TextureSlot,
    pub emissive_strength: Option<f32>,
    pub metallic: Option<f32>,
    pub metallic_roughness_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: Option<f32>,
    pub roughness: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct StandardPbrMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub alpha_map: TextureSlot,
    pub base_color: Option<u32>,
    pub base_color_map: TextureSlot,
    pub emissive: Option<u32>,
    pub emissive_map: TextureSlot,
    pub emissive_strength: Option<f32>,
    pub metallic: Option<f32>,
    pub metallic_roughness_map: TextureSlot,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: Option<f32>,
    pub roughness: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct SpecularGlossinessPbrMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub diffuse: Option<u32>,
    pub diffuse_map: TextureSlot,
    pub emissive: Option<u32>,
    pub emissive_map: TextureSlot,
    pub emissive_strength: Option<f32>,
    pub glossiness: Option<f32>,
    pub normal_map: TextureSlot,
    pub normal_scale: Option<f32>,
    pub occlusion_map: TextureSlot,
    pub occlusion_strength: Option<f32>,
    pub specular: Option<u32>,
    pub specular_glossiness_map: TextureSlot,
}

#[derive(Clone, Debug, Default)]
pub struct ExtendedPbrMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub extensions: Option<Vec<PbrExtension>>,
    pub standard: Option<StandardPbrMaterialProperties>,
}

#[derive(Clone, Debug, Default)]
pub struct CustomShaderMaterialOptions {
    pub name: Option<String>,
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub shader_key: Option<String>,
    pub textures: Option<std::collections::HashMap<String, Ref<Texture>>>,
    pub uniforms: Option<std::collections::HashMap<String, UniformValue>>,
}

#[derive(Clone, Debug, Default)]
pub struct AnisotropyPbrExtensionOptions {
    pub anisotropy_map: TextureSlot,
    pub anisotropy_map_uv_set: Option<PbrUvSet>,
    pub anisotropy_rotation: Option<f32>,
    pub anisotropy_strength: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct ClearcoatPbrExtensionOptions {
    pub clearcoat: Option<f32>,
    pub clearcoat_map: TextureSlot,
    pub clearcoat_map_uv_set: Option<PbrUvSet>,
    pub clearcoat_normal_map: TextureSlot,
    pub clearcoat_normal_map_uv_set: Option<PbrUvSet>,
    pub clearcoat_normal_scale: Option<f32>,
    pub clearcoat_roughness: Option<f32>,
    pub clearcoat_roughness_map: TextureSlot,
    pub clearcoat_roughness_map_uv_set: Option<PbrUvSet>,
}

#[derive(Clone, Debug, Default)]
pub struct IridescencePbrExtensionOptions {
    pub iridescence: Option<f32>,
    pub iridescence_ior: Option<f32>,
    pub iridescence_map: TextureSlot,
    pub iridescence_map_uv_set: Option<PbrUvSet>,
    pub iridescence_thickness_map: TextureSlot,
    pub iridescence_thickness_map_uv_set: Option<PbrUvSet>,
    pub iridescence_thickness_max: Option<f32>,
    pub iridescence_thickness_min: Option<f32>,
}

#[derive(Clone, Debug, Default)]
pub struct SheenPbrExtensionOptions {
    pub sheen_color: Option<u32>,
    pub sheen_color_map: TextureSlot,
    pub sheen_color_map_uv_set: Option<PbrUvSet>,
    pub sheen_roughness: Option<f32>,
    pub sheen_roughness_map: TextureSlot,
    pub sheen_roughness_map_uv_set: Option<PbrUvSet>,
}

#[derive(Clone, Debug, Default)]
pub struct SpecularPbrExtensionOptions {
    pub specular: Option<f32>,
    pub specular_color: Option<u32>,
    pub specular_color_map: TextureSlot,
    pub specular_color_map_uv_set: Option<PbrUvSet>,
    pub specular_map: TextureSlot,
    pub specular_map_uv_set: Option<PbrUvSet>,
}

#[derive(Clone, Debug, Default)]
pub struct TransmissionVolumePbrExtensionOptions {
    pub attenuation_color: Option<u32>,
    pub attenuation_distance: Option<f32>,
    pub ior: Option<f32>,
    pub thickness: Option<f32>,
    pub thickness_map: TextureSlot,
    pub thickness_map_uv_set: Option<PbrUvSet>,
    pub transmission: Option<f32>,
    pub transmission_map: TextureSlot,
    pub transmission_map_uv_set: Option<PbrUvSet>,
}

#[derive(Clone, Debug, Default)]
pub struct WrappedDiffusePbrExtensionOptions {
    pub thickness: Option<f32>,
    pub thickness_map: TextureSlot,
    pub thickness_map_uv_set: Option<PbrUvSet>,
    pub wrapped_diffuse_color: Option<u32>,
    pub wrapped_diffuse_map: TextureSlot,
    pub wrapped_diffuse_map_uv_set: Option<PbrUvSet>,
    pub wrapped_diffuse_strength: Option<f32>,
}

pub struct GlassExtendedPbrMaterialOptions {
    pub alpha_cutoff: Option<f32>,
    pub alpha_mode: Option<MaterialAlphaMode>,
    pub blend_mode: Option<BlendMode>,
    pub double_sided: Option<bool>,
    pub standard: Option<StandardPbrMaterialPropertiesOptions>,
    pub transmission_volume: Option<TransmissionVolumePbrExtensionOptions>,
}

// ── Free functions ──────────────────────────────────────────────────────────

// flight-lint: allow(conform-extra) D5: Rust free-function constructor for caller-owned context; TS uses module-scoped state via set/enable
pub fn create_material_conversion_context(
    guard: MaterialConversionGuard,
) -> MaterialConversionContext {
    return MaterialConversionContext { guard };
}

/// The base fields with `kind` and the source trailer defaults (opaque, single-sided, Normal blend,
/// 0.5 cutoff), for a kind struct's `Default`.
pub(crate) fn default_material3d_fields(kind: &str) -> Material3DFields {
    let mut material = Material::default();
    material.kind = kind.to_string();
    return Material3DFields {
        material,
        alpha_cutoff: 0.5,
        alpha_mode: MaterialAlphaMode::Opaque,
        blend_mode: BLEND_MODE_NORMAL.to_string(),
        double_sided: false,
    };
}

// ── Impl blocks ─────────────────────────────────────────────────────────────

// flight-lint: allow(sugar-delegates) D16 open-family: base type self-implements its own family trait
impl MaterialData for MaterialDataFields {
    fn material_data_fields(&self) -> &MaterialDataFields {
        return self;
    }
    fn material_data_fields_mut(&mut self) -> &mut MaterialDataFields {
        return self;
    }
}

impl MaterialConversionContext {
    pub fn new(guard: MaterialConversionGuard) -> Self {
        return create_material_conversion_context(guard);
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Material2DFields delegates to inner Material
impl std::ops::Deref for Material2DFields {
    type Target = Material;

    fn deref(&self) -> &Material {
        return &self.material;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Material2DFields delegates to inner Material
impl std::ops::DerefMut for Material2DFields {
    fn deref_mut(&mut self) -> &mut Material {
        return &mut self.material;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Entity runtime delegates through Material base
impl flight_entity::Entity for Material2DFields {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime(&self.material);
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime_mut(&mut self.material);
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family: Material2DFields self-implements Material2D trait
impl Material2D for Material2DFields {
    fn material2d_fields(&self) -> &Material2DFields {
        return self;
    }

    fn material2d_fields_mut(&mut self) -> &mut Material2DFields {
        return self;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: StandardMaterial delegates to inner Material2DFields
impl std::ops::Deref for StandardMaterial {
    type Target = Material2DFields;

    fn deref(&self) -> &Material2DFields {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: StandardMaterial delegates to inner Material2DFields
impl std::ops::DerefMut for StandardMaterial {
    fn deref_mut(&mut self) -> &mut Material2DFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Entity runtime delegates through Material2DFields base
impl flight_entity::Entity for StandardMaterial {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime(&self.fields);
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime_mut(&mut self.fields);
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family: StandardMaterial implements Material2D trait
impl Material2D for StandardMaterial {
    fn material2d_fields(&self) -> &Material2DFields {
        return &self.fields;
    }

    fn material2d_fields_mut(&mut self) -> &mut Material2DFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: TintMaterialData delegates to inner MaterialDataFields
impl std::ops::Deref for TintMaterialData {
    type Target = MaterialDataFields;

    fn deref(&self) -> &MaterialDataFields {
        return &self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: TintMaterialData delegates to inner MaterialDataFields
impl std::ops::DerefMut for TintMaterialData {
    fn deref_mut(&mut self) -> &mut MaterialDataFields {
        return &mut self.fields;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Entity runtime delegates through MaterialDataFields base
impl flight_entity::Entity for TintMaterialData {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime(&self.fields);
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime_mut(&mut self.fields);
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: MaterialData trait accessor for TintMaterialData
impl MaterialData for TintMaterialData {
    fn material_data_fields(&self) -> &MaterialDataFields {
        return &self.fields;
    }

    fn material_data_fields_mut(&mut self) -> &mut MaterialDataFields {
        return &mut self.fields;
    }
}

// ── D18 sugar delegates ─────────────────────────────────────────────────────

// flight-lint: allow(sugar-delegates) D18 receiver sugar: Material methods delegate to free functions
impl Material {
    pub fn new(kind: Kind) -> Self {
        return crate::material::create_material(kind);
    }

    pub fn clone_material(&self) -> Self {
        return crate::material::clone_material(self);
    }

    pub fn copy_from(&mut self, source: &Material) {
        crate::material::copy_material(self, source);
    }

    pub fn equals(&self, other: &Material) -> bool {
        return crate::material::equals_material(self, other);
    }

    pub fn initialize(&mut self, kind: Kind) {
        crate::material::initialize_material(self, kind);
    }

    pub fn of_kind<'a>(material: Option<&'a Material>, kind: &str) -> Option<&'a Material> {
        return crate::material::get_material_of_kind(material, kind);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: Material3DFields methods delegate to free functions
impl Material3DFields {
    pub fn new(kind: Kind, opts: Option<&crate::material3d::Material3DOptions>) -> Self {
        return crate::material3d::create_material3d(kind, opts);
    }

    pub fn alpha_mode(&self) -> MaterialAlphaMode {
        return crate::material3d::get_material3d_alpha_mode(self);
    }

    pub fn initialize(&mut self, kind: Kind, opts: Option<&crate::material3d::Material3DOptions>) {
        crate::material3d::initialize_material3d(self, kind, opts);
    }

    pub fn is_blended(&self) -> bool {
        return crate::material3d::is_material3d_blended(self);
    }

    pub fn is_masked(&self) -> bool {
        return crate::material3d::is_material3d_masked(self);
    }

    pub fn is_opaque(&self) -> bool {
        return crate::material3d::is_material3d_opaque(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: StandardMaterial methods delegate to free functions
impl StandardMaterial {
    pub fn new(options: Option<&StandardMaterialOptions>) -> Self {
        return crate::standard_material::create_standard_material(options);
    }

    pub fn initialize(&mut self, options: Option<&StandardMaterialOptions>) {
        crate::standard_material::initialize_standard_material(self, options);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: ColorScaleBias methods delegate to free functions
impl ColorScaleBias {
    pub fn new(opts: Option<&ColorScaleBiasOptions>) -> Self {
        return crate::color_scale_bias::create_color_scale_bias(opts);
    }

    pub fn bias_rgb(&self) -> u32 {
        return crate::color_scale_bias::get_color_scale_bias_bias_rgb(self);
    }

    pub fn bias_rgba(&self) -> u32 {
        return crate::color_scale_bias::get_color_scale_bias_bias_rgba(self);
    }

    pub fn clone_color_scale_bias(&self) -> Self {
        return crate::color_scale_bias::clone_color_scale_bias(self);
    }

    pub fn concat(&mut self, a: &ColorScaleBias, b: &ColorScaleBias) {
        crate::color_scale_bias::concat_color_scale_bias(self, a, b);
    }

    pub fn copy_from(&mut self, source: &ColorScaleBias) {
        crate::color_scale_bias::copy_color_scale_bias(self, source);
    }

    pub fn copy_to_arrays(&self, out_color_scales: &mut Vec<f32>, out_color_biases: &mut Vec<f32>) {
        crate::color_scale_bias::copy_color_scale_bias_to_arrays(
            out_color_scales,
            out_color_biases,
            self,
        );
    }

    pub fn equals(&self, other: &ColorScaleBias) -> bool {
        return crate::color_scale_bias::equals_color_scale_bias(self, other);
    }

    pub fn equals_biases(&self, other: &ColorScaleBias, compare_alpha: bool) -> bool {
        return crate::color_scale_bias::equals_color_scale_bias_biases(self, other, compare_alpha);
    }

    pub fn equals_scales(&self, other: &ColorScaleBias, compare_alpha: bool) -> bool {
        return crate::color_scale_bias::equals_color_scale_bias_scales(self, other, compare_alpha);
    }

    pub fn initialize(&mut self, opts: Option<&ColorScaleBiasOptions>) {
        crate::color_scale_bias::initialize_color_scale_bias(self, opts);
    }

    pub fn invert_from(&mut self, source: &ColorScaleBias) {
        crate::color_scale_bias::invert_color_scale_bias(self, source);
    }

    pub fn is_identity(&self, compare_alpha_scale: bool) -> bool {
        return crate::color_scale_bias::is_identity_color_scale_bias(self, compare_alpha_scale);
    }

    pub fn set_bias_rgb(&mut self, value: u32) {
        crate::color_scale_bias::set_color_scale_bias_bias_rgb(self, value);
    }

    pub fn set_bias_rgba(&mut self, value: u32) {
        crate::color_scale_bias::set_color_scale_bias_bias_rgba(self, value);
    }

    pub fn set_identity(&mut self) {
        crate::color_scale_bias::set_color_scale_bias_identity(self);
    }

    pub fn set_values(
        &mut self,
        red_scale: f32,
        green_scale: f32,
        blue_scale: f32,
        alpha_scale: f32,
        red_bias: f32,
        green_bias: f32,
        blue_bias: f32,
        alpha_bias: f32,
    ) {
        crate::color_scale_bias::set_color_scale_bias(
            self,
            red_scale,
            green_scale,
            blue_scale,
            alpha_scale,
            red_bias,
            green_bias,
            blue_bias,
            alpha_bias,
        );
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: BlinnPhongMaterial constructor delegates to free function
impl BlinnPhongMaterial {
    pub fn new(opts: Option<&BlinnPhongMaterialOptions>) -> Self {
        return crate::classic_materials::create_blinn_phong_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: LambertMaterial constructor delegates to free function
impl LambertMaterial {
    pub fn new(opts: Option<&LambertMaterialOptions>) -> Self {
        return crate::classic_materials::create_lambert_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: DepthMaterial constructor delegates to free function
impl DepthMaterial {
    pub fn new(opts: Option<&DepthMaterialOptions>) -> Self {
        return crate::unlit_materials::create_depth_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: EmissiveMaterial constructor delegates to free function
impl EmissiveMaterial {
    pub fn new(opts: Option<&EmissiveMaterialOptions>) -> Self {
        return crate::unlit_materials::create_emissive_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: MatcapMaterial constructor delegates to free function
impl MatcapMaterial {
    pub fn new(opts: Option<&MatcapMaterialOptions>) -> Self {
        return crate::unlit_materials::create_matcap_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: NormalMaterial constructor delegates to free function
impl NormalMaterial {
    pub fn new(opts: Option<&NormalMaterialOptions>) -> Self {
        return crate::unlit_materials::create_normal_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: ToonMaterial constructor delegates to free function
impl ToonMaterial {
    pub fn new(opts: Option<&ToonMaterialOptions>) -> Self {
        return crate::unlit_materials::create_toon_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: UnlitMaterial constructor delegates to free function
impl UnlitMaterial {
    pub fn new(opts: Option<&UnlitMaterialOptions>) -> Self {
        return crate::unlit_materials::create_unlit_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: VertexColorMaterial constructor delegates to free function
impl VertexColorMaterial {
    pub fn new(opts: Option<&VertexColorMaterialOptions>) -> Self {
        return crate::unlit_materials::create_vertex_color_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: WireframeMaterial constructor delegates to free function
impl WireframeMaterial {
    pub fn new(opts: Option<&WireframeMaterialOptions>) -> Self {
        return crate::unlit_materials::create_wireframe_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: StandardPbrMaterial constructor delegates to free function
impl StandardPbrMaterial {
    pub fn new(opts: Option<&StandardPbrMaterialOptions>) -> Self {
        return crate::pbr_materials::create_standard_pbr_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: CustomShaderMaterial constructor delegates to free function
impl CustomShaderMaterial {
    pub fn new(opts: Option<&CustomShaderMaterialOptions>) -> Self {
        return crate::custom_shader_material::create_custom_shader_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: AnisotropyPbrExtension methods delegate to free functions
impl AnisotropyPbrExtension {
    pub fn new(opts: Option<&AnisotropyPbrExtensionOptions>) -> Self {
        return crate::anisotropy_pbr_extension::create_anisotropy_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::anisotropy_pbr_extension::is_valid_anisotropy_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: ClearcoatPbrExtension methods delegate to free functions
impl ClearcoatPbrExtension {
    pub fn new(opts: Option<&ClearcoatPbrExtensionOptions>) -> Self {
        return crate::clearcoat_pbr_extension::create_clearcoat_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::clearcoat_pbr_extension::is_valid_clearcoat_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: IridescencePbrExtension methods delegate to free functions
impl IridescencePbrExtension {
    pub fn new(opts: Option<&IridescencePbrExtensionOptions>) -> Self {
        return crate::iridescence_pbr_extension::create_iridescence_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::iridescence_pbr_extension::is_valid_iridescence_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: SheenPbrExtension methods delegate to free functions
impl SheenPbrExtension {
    pub fn new(opts: Option<&SheenPbrExtensionOptions>) -> Self {
        return crate::sheen_pbr_extension::create_sheen_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::sheen_pbr_extension::is_valid_sheen_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: SpecularPbrExtension methods delegate to free functions
impl SpecularPbrExtension {
    pub fn new(opts: Option<&SpecularPbrExtensionOptions>) -> Self {
        return crate::specular_pbr_extension::create_specular_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::specular_pbr_extension::is_valid_specular_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: TransmissionVolumePbrExtension methods delegate to free functions
impl TransmissionVolumePbrExtension {
    pub fn new(opts: Option<&TransmissionVolumePbrExtensionOptions>) -> Self {
        return crate::transmission_volume_pbr_extension::create_transmission_volume_pbr_extension(
            opts,
        );
    }

    pub fn is_valid(&self) -> bool {
        return crate::transmission_volume_pbr_extension::is_valid_transmission_volume_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: WrappedDiffusePbrExtension methods delegate to free functions
impl WrappedDiffusePbrExtension {
    pub fn new(opts: Option<&WrappedDiffusePbrExtensionOptions>) -> Self {
        return crate::wrapped_diffuse_pbr_extension::create_wrapped_diffuse_pbr_extension(opts);
    }

    pub fn is_valid(&self) -> bool {
        return crate::wrapped_diffuse_pbr_extension::is_valid_wrapped_diffuse_pbr_extension(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: ExtendedPbrMaterial constructor delegates to free function
impl ExtendedPbrMaterial {
    pub fn new(opts: Option<&ExtendedPbrMaterialOptions>) -> Self {
        return crate::extended_pbr_material::create_extended_pbr_material(opts);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: PhongMaterial methods delegate to free functions
impl PhongMaterial {
    pub fn new(opts: Option<&PhongMaterialOptions>) -> Self {
        return crate::classic_materials::create_phong_material(opts);
    }

    pub fn convert_to_standard_pbr(
        &self,
        opts: Option<&StandardPbrMaterialOptions>,
        ctx: Option<&MaterialConversionContext>,
    ) -> StandardPbrMaterial {
        return crate::phong_to_pbr::convert_phong_to_standard_pbr_material(self, opts, ctx);
    }

    pub fn explain_conversion(&self) -> MaterialConversionExplanation {
        return crate::explain_material_conversion::explain_phong_conversion(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: SpecularGlossinessPbrMaterial methods delegate to free functions
impl SpecularGlossinessPbrMaterial {
    pub fn new(opts: Option<&SpecularGlossinessPbrMaterialOptions>) -> Self {
        return crate::pbr_materials::create_specular_glossiness_pbr_material(opts);
    }

    pub fn convert_to_standard_pbr(
        &self,
        out: &mut StandardPbrMaterialProperties,
        ctx: Option<&MaterialConversionContext>,
    ) {
        crate::pbr_materials::convert_specular_glossiness_to_standard_pbr(out, self, ctx);
    }

    pub fn explain_conversion(&self) -> MaterialConversionExplanation {
        return crate::explain_material_conversion::explain_specular_glossiness_conversion(self);
    }
}

// flight-lint: allow(sugar-delegates) D18 receiver sugar: StandardPbrMaterialProperties methods delegate to free functions
impl StandardPbrMaterialProperties {
    pub fn new(opts: Option<&StandardPbrMaterialPropertiesOptions>) -> Self {
        return crate::pbr_materials::create_standard_pbr_material_properties(opts);
    }

    pub fn clamp(&mut self) -> &mut Self {
        return crate::material_validation::clamp_standard_pbr_material_properties(self);
    }
}

// ── Default impls & entity registrations ─────────────────────────────────────

impl Default for Material {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: String::new(),
            name: None,
        };
    }
}

flight_entity::impl_entity!(Material);

impl Default for Material2DFields {
    fn default() -> Self {
        return Self {
            material: Material::default(),
        };
    }
}

flight_entity::impl_entity!(MaterialDataFields);

impl Default for TintMaterialData {
    fn default() -> Self {
        return Self {
            fields: MaterialDataFields::default(),
            tint: 0,
        };
    }
}

impl Default for Material3DFields {
    fn default() -> Self {
        return default_material3d_fields("");
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Material3DFields extends the Material base
impl std::ops::Deref for Material3DFields {
    type Target = Material;

    fn deref(&self) -> &Material {
        return &self.material;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Material3DFields extends the Material base
impl std::ops::DerefMut for Material3DFields {
    fn deref_mut(&mut self) -> &mut Material {
        return &mut self.material;
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family composition: Entity runtime delegates through Material base
impl flight_entity::Entity for Material3DFields {
    fn entity_runtime(&self) -> &EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime(&self.material);
    }

    fn entity_runtime_mut(&mut self) -> &mut EntityRuntimeSlot {
        return flight_entity::Entity::entity_runtime_mut(&mut self.material);
    }
}

// flight-lint: allow(sugar-delegates) D16 open-family: Material3DFields self-implements Material3D (the plain base kind)
impl Material3D for Material3DFields {
    fn as_any(&self) -> &dyn std::any::Any {
        return self;
    }

    fn as_any_mut(&mut self) -> &mut dyn std::any::Any {
        return self;
    }

    fn material3d_fields(&self) -> &Material3DFields {
        return self;
    }

    fn material3d_fields_mut(&mut self) -> &mut Material3DFields {
        return self;
    }
}

impl Default for StandardMaterial {
    fn default() -> Self {
        let mut fields = Material2DFields::default();
        fields.kind = STANDARD_MATERIAL_KIND.to_string();
        return Self { fields };
    }
}

impl Default for BlinnPhongMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(BLINN_PHONG_MATERIAL_KIND),
            alpha_map: None,
            diffuse: 0xffffffff,
            diffuse_map: None,
            normal_map: None,
            normal_scale: 1.0,
            shininess: 32.0,
            specular: 0xffffffff,
            specular_map: None,
        };
    }
}

impl_material3d!(BlinnPhongMaterial);

impl Default for LambertMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(LAMBERT_MATERIAL_KIND),
            diffuse: 0xffffffff,
            diffuse_map: None,
            emissive: 0x000000ff,
            emissive_map: None,
        };
    }
}

impl_material3d!(LambertMaterial);

impl Default for PhongMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(PHONG_MATERIAL_KIND),
            diffuse: 0xffffffff,
            diffuse_map: None,
            normal_map: None,
            normal_scale: 1.0,
            shininess: 32.0,
            specular: 0xffffffff,
            specular_map: None,
        };
    }
}

impl_material3d!(PhongMaterial);

impl Default for DepthMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(DEPTH_MATERIAL_KIND),
            far: 1.0,
            near: 0.0,
        };
    }
}

impl_material3d!(DepthMaterial);

impl Default for EmissiveMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(EMISSIVE_MATERIAL_KIND),
            emissive: 0xffffffff,
            emissive_map: None,
            emissive_strength: 1.0,
        };
    }
}

impl_material3d!(EmissiveMaterial);

impl Default for MatcapMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(MATCAP_MATERIAL_KIND),
            matcap: None,
            tint: 0xffffffff,
        };
    }
}

impl_material3d!(MatcapMaterial);

impl Default for NormalMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(NORMAL_MATERIAL_KIND),
            normal_map: None,
            normal_scale: 1.0,
        };
    }
}

impl_material3d!(NormalMaterial);

impl Default for ToonMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(TOON_MATERIAL_KIND),
            base_color: 0xffffffff,
            base_color_map: None,
            ramp: None,
            steps: 3,
        };
    }
}

impl_material3d!(ToonMaterial);

impl Default for UnlitMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(UNLIT_MATERIAL_KIND),
            base_color: 0xffffffff,
            base_color_map: None,
        };
    }
}

impl_material3d!(UnlitMaterial);

impl Default for VertexColorMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(VERTEX_COLOR_MATERIAL_KIND),
            tint: 0xffffffff,
        };
    }
}

impl_material3d!(VertexColorMaterial);

impl Default for WireframeMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(WIREFRAME_MATERIAL_KIND),
            color: 0xffffffff,
            thickness: 1.0,
        };
    }
}

impl_material3d!(WireframeMaterial);

impl Default for StandardPbrMaterialProperties {
    fn default() -> Self {
        return Self {
            alpha_map: None,
            base_color: 0xffffffff,
            base_color_map: None,
            emissive: 0x000000ff,
            emissive_map: None,
            emissive_strength: 1.0,
            metallic: 0.0,
            metallic_roughness_map: None,
            normal_map: None,
            normal_scale: 1.0,
            occlusion_map: None,
            occlusion_strength: 1.0,
            roughness: 1.0,
        };
    }
}

impl Default for StandardPbrMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(STANDARD_PBR_MATERIAL_KIND),
            alpha_map: None,
            base_color: 0xffffffff,
            base_color_map: None,
            emissive: 0x000000ff,
            emissive_map: None,
            emissive_strength: 1.0,
            metallic: 0.0,
            metallic_roughness_map: None,
            normal_map: None,
            normal_scale: 1.0,
            occlusion_map: None,
            occlusion_strength: 1.0,
            roughness: 1.0,
        };
    }
}

impl_material3d!(StandardPbrMaterial);

impl Default for SpecularGlossinessPbrMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(SPECULAR_GLOSSINESS_PBR_MATERIAL_KIND),
            diffuse: 0xffffffff,
            diffuse_map: None,
            emissive: 0x000000ff,
            emissive_map: None,
            emissive_strength: 1.0,
            glossiness: 1.0,
            normal_map: None,
            normal_scale: 1.0,
            occlusion_map: None,
            occlusion_strength: 1.0,
            specular: 0xffffffff,
            specular_glossiness_map: None,
        };
    }
}

impl_material3d!(SpecularGlossinessPbrMaterial);

impl Default for ExtendedPbrMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(EXTENDED_PBR_MATERIAL_KIND),
            extensions: Vec::new(),
            standard: StandardPbrMaterialProperties::default(),
        };
    }
}

impl_material3d!(ExtendedPbrMaterial);

impl Default for CustomShaderMaterial {
    fn default() -> Self {
        return Self {
            fields: default_material3d_fields(CUSTOM_SHADER_MATERIAL_KIND),
            shader_key: String::new(),
            textures: None,
            uniforms: None,
        };
    }
}

impl_material3d!(CustomShaderMaterial);

impl PbrExtension {
    pub fn kind(&self) -> &str {
        return crate::pbr_extension::get_pbr_extension_kind(self);
    }
}

impl Default for AnisotropyPbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: ANISOTROPY_PBR_EXTENSION_KIND.to_string(),
            anisotropy_map: None,
            anisotropy_map_uv_set: 0,
            anisotropy_rotation: 0.0,
            anisotropy_strength: 0.0,
        };
    }
}

flight_entity::impl_entity!(AnisotropyPbrExtension);

impl Default for ClearcoatPbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: CLEARCOAT_PBR_EXTENSION_KIND.to_string(),
            clearcoat: 0.0,
            clearcoat_map: None,
            clearcoat_map_uv_set: 0,
            clearcoat_normal_map: None,
            clearcoat_normal_map_uv_set: 0,
            clearcoat_normal_scale: 1.0,
            clearcoat_roughness: 0.0,
            clearcoat_roughness_map: None,
            clearcoat_roughness_map_uv_set: 0,
        };
    }
}

flight_entity::impl_entity!(ClearcoatPbrExtension);

impl Default for IridescencePbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: IRIDESCENCE_PBR_EXTENSION_KIND.to_string(),
            iridescence: 0.0,
            iridescence_ior: 1.3,
            iridescence_map: None,
            iridescence_map_uv_set: 0,
            iridescence_thickness_map: None,
            iridescence_thickness_map_uv_set: 0,
            iridescence_thickness_max: 400.0,
            iridescence_thickness_min: 100.0,
        };
    }
}

flight_entity::impl_entity!(IridescencePbrExtension);

impl Default for SheenPbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: SHEEN_PBR_EXTENSION_KIND.to_string(),
            sheen_color: 0x000000ff,
            sheen_color_map: None,
            sheen_color_map_uv_set: 0,
            sheen_roughness: 0.0,
            sheen_roughness_map: None,
            sheen_roughness_map_uv_set: 0,
        };
    }
}

flight_entity::impl_entity!(SheenPbrExtension);

impl Default for SpecularPbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: SPECULAR_PBR_EXTENSION_KIND.to_string(),
            specular: 1.0,
            specular_color: 0xffffffff,
            specular_color_map: None,
            specular_color_map_uv_set: 0,
            specular_map: None,
            specular_map_uv_set: 0,
        };
    }
}

flight_entity::impl_entity!(SpecularPbrExtension);

impl Default for TransmissionVolumePbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: TRANSMISSION_VOLUME_PBR_EXTENSION_KIND.to_string(),
            attenuation_color: 0xffffffff,
            attenuation_distance: f32::INFINITY,
            ior: 1.5,
            thickness: 0.0,
            thickness_map: None,
            thickness_map_uv_set: 0,
            transmission: 0.0,
            transmission_map: None,
            transmission_map_uv_set: 0,
        };
    }
}

flight_entity::impl_entity!(TransmissionVolumePbrExtension);

impl Default for WrappedDiffusePbrExtension {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            kind: WRAPPED_DIFFUSE_PBR_EXTENSION_KIND.to_string(),
            thickness: 0.0,
            thickness_map: None,
            thickness_map_uv_set: 0,
            wrapped_diffuse_color: 0xffffffff,
            wrapped_diffuse_map: None,
            wrapped_diffuse_map_uv_set: 0,
            wrapped_diffuse_strength: 0.0,
        };
    }
}

flight_entity::impl_entity!(WrappedDiffusePbrExtension);

impl Default for ColorScaleBias {
    fn default() -> Self {
        return Self {
            runtime: EntityRuntimeSlot::default(),
            red_scale: 1.0,
            green_scale: 1.0,
            blue_scale: 1.0,
            alpha_scale: 1.0,
            red_bias: 0.0,
            green_bias: 0.0,
            blue_bias: 0.0,
            alpha_bias: 0.0,
        };
    }
}

flight_entity::impl_entity!(ColorScaleBias);
