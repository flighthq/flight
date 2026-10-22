use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity,
};
use flight_scene3d_formats::*;

fn material<'a>(library: &'a ObjMaterialLibrary, name: &str) -> &'a ObjMaterial {
    return &library
        .materials
        .iter()
        .find(|entry| entry.key == name)
        .unwrap()
        .value;
}

fn one_crumb<'a>(diagnostics: &'a [ImportDiagnostic], kind: &str) -> &'a ImportDiagnostic {
    let matching: Vec<_> = diagnostics
        .iter()
        .filter(|crumb| crumb.kind == kind)
        .collect();
    assert_eq!(matching.len(), 1);
    return matching[0];
}

fn number(crumb: &ImportDiagnostic, key: &str) -> f32 {
    let ImportDiagnosticDetailValue::Number(value) = crumb.detail.as_ref().unwrap()[key] else {
        panic!("number detail");
    };
    return value;
}

fn text<'a>(crumb: &'a ImportDiagnostic, key: &str) -> &'a str {
    let ImportDiagnosticDetailValue::String(value) = &crumb.detail.as_ref().unwrap()[key] else {
        panic!("string detail");
    };
    return value;
}

mod parse_obj_material_library {
    use super::*;

    #[test]
    fn keeps_each_materials_values_and_applies_the_source_transparency_complement() {
        let library =
            parse_obj_material_library("newmtl MatA\nKd 1 0 0\n\nnewmtl MatB\nKd 0 1 0\n", None);
        assert_eq!(library.materials.len(), 2);
        assert_eq!(material(&library, "MatA").diffuse, [1.0, 0.0, 0.0]);
        assert_eq!(material(&library, "MatB").diffuse, [0.0, 1.0, 0.0]);
        let library = parse_obj_material_library("newmtl M\nTr 0.3\n", None);
        assert_eq!(material(&library, "M").dissolve, 0.7);
        for (source, kind, directive) in [
            ("Kd 1 0 0\n", "mtl.directive-before-material", Some("Kd")),
            ("Kd\n", "mtl.directive-before-material", Some("Kd")),
            ("newmtl\n", "mtl.newmtl-no-name", None),
        ] {
            let mut diagnostics = Vec::new();
            assert!(
                parse_obj_material_library(source, Some(&mut diagnostics))
                    .materials
                    .is_empty()
            );
            let crumb = one_crumb(&diagnostics, kind);
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "parseObjMaterialLibrary");
            assert_eq!(number(crumb, "firstLine"), 1.0);
            assert_eq!(number(crumb, "count"), 1.0);
            if let Some(directive) = directive {
                assert_eq!(text(crumb, "firstDirective"), directive);
            }
        }
    }

    #[test]
    fn parses_classic_properties_aliases_all_maps_and_quiet_defaults_without_material_runtime() {
        let source = "newmtl TestMat\nKa 0.1 0.2 0.3\nKd 0.4 0.5 0.6\nKs 0.7 0.8 0.9\nNs 100\nd 0.75\nillum 2\nmap_Kd diffuse.png\nmap_Ka ambient.png\nmap_Ks specular.png\nmap_Bump height.png\nmap_d alpha.png\n";
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(source, Some(&mut diagnostics));
        assert!(diagnostics.is_empty());
        assert_eq!(library.materials.len(), 1);
        let mat = material(&library, "TestMat");
        assert_eq!(mat.name, "TestMat");
        assert_eq!(mat.ambient, [0.1, 0.2, 0.3]);
        assert_eq!(mat.diffuse, [0.4, 0.5, 0.6]);
        assert_eq!(mat.specular, [0.7, 0.8, 0.9]);
        assert_eq!(mat.specular_exponent, 100.0);
        assert_eq!(mat.dissolve, 0.75);
        assert_eq!(mat.illumination, 2.0);
        assert_eq!(mat.map_diffuse.as_deref(), Some("diffuse.png"));
        assert_eq!(mat.map_ambient.as_deref(), Some("ambient.png"));
        assert_eq!(mat.map_specular.as_deref(), Some("specular.png"));
        assert_eq!(mat.map_bump.as_deref(), Some("height.png"));
        assert_eq!(mat.map_dissolve.as_deref(), Some("alpha.png"));
        let library = parse_obj_material_library("newmtl M\nbump normal_map.tga\n", None);
        assert_eq!(
            material(&library, "M").map_bump.as_deref(),
            Some("normal_map.tga")
        );
        let library = parse_obj_material_library("newmtl Default\n", None);
        let mat = material(&library, "Default");
        assert_eq!(mat.ambient, [0.0; 3]);
        assert_eq!(mat.diffuse, [0.8; 3]);
        assert_eq!(mat.specular, [0.0; 3]);
        assert_eq!(mat.specular_exponent, 0.0);
        assert_eq!(mat.dissolve, 1.0);
        assert_eq!(mat.illumination, 2.0);
        assert!(mat.map_diffuse.is_none());
        assert!(mat.map_ambient.is_none());
        assert!(mat.map_specular.is_none());
        assert!(mat.map_bump.is_none());
        assert!(mat.map_dissolve.is_none());
        assert!(mat.roughness.is_none());
        assert!(mat.metallic.is_none());
        assert!(mat.sheen.is_none());
        assert!(mat.clearcoat.is_none());
        assert!(mat.clearcoat_roughness.is_none());
        assert!(mat.anisotropy.is_none());
        assert!(mat.anisotropy_rotation.is_none());
        assert!(mat.emissive.is_none());
        assert!(mat.map_roughness.is_none());
        assert!(mat.map_metallic.is_none());
        assert!(mat.map_emissive.is_none());
        assert!(mat.map_normal.is_none());
        for source in ["", "# one\n# another\n", "unknown value\n"] {
            let mut diagnostics = Vec::new();
            assert!(
                parse_obj_material_library(source, Some(&mut diagnostics))
                    .materials
                    .is_empty()
            );
            assert!(diagnostics.is_empty());
        }
        let mut diagnostics = Vec::new();
        assert_eq!(
            parse_obj_material_library(
                "newmtl M\nKd 1 1 1\nunknown value\n",
                Some(&mut diagnostics)
            )
            .materials
            .len(),
            1
        );
        assert!(diagnostics.is_empty());
    }

    #[test]
    fn preserves_pbr_absence_explicit_zero_scalar_values_emissive_and_separate_texture_filenames() {
        let source = "newmtl M\nPr 0.25\nPm 0.75\nPs 0.4\nPc 0.2\nPcr 0.15\naniso 0.3\nanisor 0.6\nKe 1 0.5 0\nmap_Ke glow.png\nmap_Pr rough.png\nmap_Pm metal.png\nnorm normal.png\n";
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(source, Some(&mut diagnostics));
        assert!(diagnostics.is_empty());
        let mat = material(&library, "M");
        assert_eq!(mat.roughness, Some(0.25));
        assert_eq!(mat.metallic, Some(0.75));
        assert_eq!(mat.sheen, Some(0.4));
        assert_eq!(mat.clearcoat, Some(0.2));
        assert_eq!(mat.clearcoat_roughness, Some(0.15));
        assert_eq!(mat.anisotropy, Some(0.3));
        assert_eq!(mat.anisotropy_rotation, Some(0.6));
        assert_eq!(mat.emissive, Some([1.0, 0.5, 0.0]));
        assert_eq!(mat.map_emissive.as_deref(), Some("glow.png"));
        assert_eq!(mat.map_roughness.as_deref(), Some("rough.png"));
        assert_eq!(mat.map_metallic.as_deref(), Some("metal.png"));
        assert_eq!(mat.map_normal.as_deref(), Some("normal.png"));
        let library = parse_obj_material_library("newmtl M\nPr 0\n", None);
        assert_eq!(material(&library, "M").roughness, Some(0.0));
        assert!(material(&library, "M").metallic.is_none());
    }

    #[test]
    fn reports_all_source_bare_color_scalar_and_map_rows_with_exact_severity_origin_first_line_and_count()
     {
        for directive in ["Ka", "Kd", "Ks", "Ke"] {
            let mut diagnostics = Vec::new();
            parse_obj_material_library(&format!("newmtl M\n{directive}\n"), Some(&mut diagnostics));
            let crumb = one_crumb(&diagnostics, "mtl.color-malformed");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
            assert_eq!(crumb.origin, "parseObjMaterialLibrary");
            assert_eq!(text(crumb, "firstDirective"), directive);
            assert_eq!(text(crumb, "reason"), "too-few-components");
            assert_eq!(number(crumb, "firstLine"), 2.0);
            assert_eq!(number(crumb, "count"), 1.0);
        }
        for directive in [
            "Ns", "d", "Tr", "illum", "Pr", "Pm", "Ps", "Pc", "Pcr", "aniso", "anisor",
        ] {
            for value in ["", " abc"] {
                let mut diagnostics = Vec::new();
                let library = parse_obj_material_library(
                    &format!("newmtl M\n{directive}{value}\n"),
                    Some(&mut diagnostics),
                );
                let crumb = one_crumb(&diagnostics, "mtl.invalid-value");
                assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
                assert_eq!(crumb.origin, "parseObjMaterialLibrary");
                assert_eq!(text(crumb, "directive"), directive);
                assert_eq!(number(crumb, "firstLine"), 2.0);
                assert_eq!(number(crumb, "count"), 1.0);
                assert!(material(&library, "M").roughness.is_none());
            }
        }
        for directive in [
            "map_Kd", "map_Ka", "map_Ks", "map_Bump", "bump", "map_d", "map_Ke", "map_Pr",
            "map_Pm", "norm",
        ] {
            let mut diagnostics = Vec::new();
            parse_obj_material_library(&format!("newmtl M\n{directive}\n"), Some(&mut diagnostics));
            let crumb = one_crumb(&diagnostics, "mtl.map-no-filename");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Drop);
            assert_eq!(crumb.origin, "parseObjMaterialLibrary");
            assert_eq!(text(crumb, "directive"), directive);
            assert_eq!(number(crumb, "firstLine"), 2.0);
            assert_eq!(number(crumb, "count"), 1.0);
        }
        for (directive, args, reason) in [
            ("Kd", "abc def ghi", "non-numeric"),
            ("Ka", "1 2", "too-few-components"),
        ] {
            let mut diagnostics = Vec::new();
            parse_obj_material_library(
                &format!("newmtl M\n{directive} {args}\n"),
                Some(&mut diagnostics),
            );
            let crumb = one_crumb(&diagnostics, "mtl.color-malformed");
            assert_eq!(crumb.severity, ImportDiagnosticSeverity::Recover);
            assert_eq!(crumb.origin, "parseObjMaterialLibrary");
            assert_eq!(text(crumb, "firstDirective"), directive);
            assert_eq!(text(crumb, "reason"), reason);
            assert_eq!(number(crumb, "firstLine"), 2.0);
            assert_eq!(number(crumb, "count"), 1.0);
        }
    }

    #[test]
    fn aggregates_missing_materials_and_names_in_first_discovery_order_without_constructing_a_material()
     {
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(
            "# comment\nKd 1 0 0\nNs\nmap_Kd tex.png\nKe\nunknown value\nnewmtl\nnewmtl\n",
            Some(&mut diagnostics),
        );
        assert!(library.materials.is_empty());
        assert_eq!(diagnostics.len(), 2);
        let before = &diagnostics[0];
        assert_eq!(before.kind, "mtl.directive-before-material");
        assert_eq!(before.severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(before.origin, "parseObjMaterialLibrary");
        assert_eq!(text(before, "firstDirective"), "Kd");
        assert_eq!(number(before, "firstLine"), 2.0);
        assert_eq!(number(before, "count"), 4.0);
        let missing = &diagnostics[1];
        assert_eq!(missing.kind, "mtl.newmtl-no-name");
        assert_eq!(missing.severity, ImportDiagnosticSeverity::Drop);
        assert_eq!(missing.origin, "parseObjMaterialLibrary");
        assert_eq!(number(missing, "firstLine"), 7.0);
        assert_eq!(number(missing, "count"), 2.0);
    }

    #[test]
    fn aggregates_failures_by_directive_or_color_reason_and_retains_previous_valid_fields() {
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(
            "newmtl M\nNs a\nNs b\nTr c\nKa 1 2\nKd 1\nKs bad x y\nKe bad b b\n",
            Some(&mut diagnostics),
        );
        assert_eq!(diagnostics.len(), 4);
        assert_eq!(
            diagnostics
                .iter()
                .map(|c| c.kind.as_str())
                .collect::<Vec<_>>(),
            [
                "mtl.invalid-value",
                "mtl.invalid-value",
                "mtl.color-malformed",
                "mtl.color-malformed"
            ]
        );
        for (index, count, line) in [(0, 2.0, 2.0), (1, 1.0, 4.0), (2, 2.0, 5.0), (3, 2.0, 7.0)] {
            assert_eq!(number(&diagnostics[index], "count"), count);
            assert_eq!(number(&diagnostics[index], "firstLine"), line);
            assert_eq!(diagnostics[index].origin, "parseObjMaterialLibrary");
            assert_eq!(
                diagnostics[index].severity,
                ImportDiagnosticSeverity::Recover
            );
        }
        assert_eq!(text(&diagnostics[0], "directive"), "Ns");
        assert_eq!(text(&diagnostics[1], "directive"), "Tr");
        assert_eq!(text(&diagnostics[2], "firstDirective"), "Ka");
        assert_eq!(text(&diagnostics[2], "reason"), "too-few-components");
        assert_eq!(text(&diagnostics[3], "firstDirective"), "Ks");
        assert_eq!(text(&diagnostics[3], "reason"), "non-numeric");
        assert_eq!(material(&library, "M").diffuse, [0.8; 3]);
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(
            "newmtl M\nKa 0.1 0.2 0.3\nKa nope 1 2\nNs 12\nNs abc\nPr 0.5\nPr wrong\n",
            Some(&mut diagnostics),
        );
        let mat = material(&library, "M");
        assert_eq!(mat.ambient, [0.1, 0.2, 0.3]);
        assert_eq!(mat.specular_exponent, 12.0);
        assert_eq!(mat.roughness, Some(0.5));
    }

    #[test]
    fn splits_directives_at_literal_spaces_and_replaces_duplicate_names_at_the_original_map_position()
     {
        let source = "\u{feff}newmtl A\nPr 1\nnewmtl B\nKd 0 1 0\nnewmtl A\nKd 1 0 0\nnewmtl\nmap_Kd -s 1 2 3 tex name.png # literal\nnewmtl\tIgnored\nKd\t0\t0\t1\n";
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(source, Some(&mut diagnostics));
        assert_eq!(
            library
                .materials
                .iter()
                .map(|entry| entry.key.as_str())
                .collect::<Vec<_>>(),
            ["A", "B"]
        );
        let a = material(&library, "A");
        assert_eq!(a.diffuse, [1.0, 0.0, 0.0]);
        assert!(a.roughness.is_none());
        assert_eq!(
            a.map_diffuse.as_deref(),
            Some("-s 1 2 3 tex name.png # literal")
        );
        assert_eq!(material(&library, "B").diffuse, [0.0, 1.0, 0.0]);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "mtl.newmtl-no-name");
        assert_eq!(number(&diagnostics[0], "firstLine"), 7.0);
    }

    #[test]
    fn validates_prefix_numbers_before_narrowing_and_computes_transparency_complement_before_the_final_float32_write()
     {
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(
            "newmtl M\nNs 1e300\nKd 1.25junk .5tail -0\nillum 2.9\nPr 0\nTr 0.3333333333333333\n",
            Some(&mut diagnostics),
        );
        assert!(diagnostics.is_empty());
        let mat = material(&library, "M");
        assert_eq!(mat.specular_exponent, f32::INFINITY);
        assert_eq!(mat.diffuse[0], 1.25);
        assert_eq!(mat.diffuse[1], 0.5);
        assert_eq!(mat.diffuse[2].to_bits(), (-0.0_f32).to_bits());
        assert_eq!(mat.illumination, 2.0);
        assert_eq!(mat.roughness, Some(0.0));
        assert_eq!(mat.dissolve.to_bits(), 0x3f2aaaab);
        assert_eq!((1.0_f32 - 1.0_f32 / 3.0).to_bits(), 0x3f2aaaaa);
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(
            "newmtl M\nNs 0x10\nillum 0x10\nPr 1e+garbage\n",
            Some(&mut diagnostics),
        );
        assert!(diagnostics.is_empty());
        let mat = material(&library, "M");
        assert_eq!(mat.specular_exponent, 0.0);
        assert_eq!(mat.illumination, 0.0);
        assert_eq!(mat.roughness, Some(1.0));
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(
            "newmtl M\nNs Infinity\nNs NaN\nNs 1e400\nNs -Infinity\nKd 1e400 1 1\n",
            Some(&mut diagnostics),
        );
        assert_eq!(material(&library, "M").specular_exponent, 0.0);
        assert_eq!(diagnostics.len(), 2);
        assert_eq!(number(&diagnostics[0], "count"), 4.0);
        assert_eq!(text(&diagnostics[1], "reason"), "non-numeric");
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(
            &format!("newmtl M\nillum {}\n", "9".repeat(300)),
            Some(&mut diagnostics),
        );
        assert!(diagnostics.is_empty());
        assert_eq!(material(&library, "M").illumination, f32::INFINITY);
        let mut diagnostics = Vec::new();
        let library = parse_obj_material_library(
            &format!("newmtl M\nillum {}\n", "9".repeat(400)),
            Some(&mut diagnostics),
        );
        assert_eq!(material(&library, "M").illumination, 2.0);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].kind, "mtl.invalid-value");
        let library = parse_obj_material_library("newmtl M\nillum 1e300\n", None);
        assert_eq!(material(&library, "M").illumination, 1.0);
    }
}
