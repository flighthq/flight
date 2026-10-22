use flight_image::ImageResourceReference;
use flight_importdiagnostics::ImportDiagnosticSeverity;
use flight_meshgeometry::IndexBuffer;
use flight_scene3d::NODE3D_KIND;
use flight_scene3d_formats::*;
use std::sync::Arc;

const SOURCE_XML_22_0: &str = r##"<COLLADA version="1.4.1"><asset><contributor><authoring_tool>Tool</authoring_tool></contributor><copyright>Me</copyright><up_axis>Y_UP</up_axis></asset></COLLADA>"##;

const SOURCE_XML_30_0: &str = r##"<COLLADA><library_images><image id="albedo"><init_from>albedo.png</init_from></image></library_images><library_effects><effect id="fx"><profile_COMMON><newparam sid="surface"><surface><init_from>albedo</init_from></surface></newparam><newparam sid="sampler"><sampler2D><source>surface</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="sampler"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects><library_materials><material id="mat"><instance_effect url="#fx"/></material></library_materials></COLLADA>"##;

const SOURCE_XML_39_0: &str = r##"<COLLADA><asset><up_axis>Z_UP</up_axis></asset><library_effects><effect id="custom"><profile_GLSL/></effect></library_effects></COLLADA>"##;

const SOURCE_XML_50_0: &str = r##"<not-collada/>"##;

const SOURCE_XML_50_1: &str = r##"<COLLADA><instance_geometry/></COLLADA>"##;

const SOURCE_XML_185_0: &str = r##"<COLLADA><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries></COLLADA>"##;

const SOURCE_XML_205_0: &str = r##"<COLLADA><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><source id="t"><float_array>0 0 1 0 0.5 1</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><input semantic="TEXCOORD" source="#t" offset="1"/><p>0 0 1 1 2 2</p></triangles></mesh></geometry></library_geometries></COLLADA>"##;

const SOURCE_XML_225_0: &str = r##"<COLLADA><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><source id="n"><float_array>0 0 1 0 0 1 0 0 1</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><input semantic="NORMAL" source="#n" offset="1"/><p>0 0 1 1 2 2</p></triangles></mesh></geometry></library_geometries></COLLADA>"##;

const SOURCE_XML_242_0: &str = r##"<COLLADA><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0 2 0 0</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1" material="mat0"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles><triangles count="1" material="mat1"><input semantic="VERTEX" source="#v" offset="0"/><p>1 2 3</p></triangles></mesh></geometry></library_geometries></COLLADA>"##;

const SOURCE_XML_262_0: &str = r##"<COLLADA><library_materials><material id="m"><instance_effect url="#fx"/></material></library_materials><library_effects><effect id="fx"><profile_COMMON><technique><lambert><diffuse><color>1 1 1 1</color></diffuse></lambert></technique></profile_COMMON></effect></library_effects><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1" material="Sym"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="vs"><node><instance_geometry url="#g"><bind_material><technique_common><instance_material symbol="Sym" target="#m"/></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_285_0: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs" name="Scene"><node id="A" name="NodeA"/><node id="B" name="NodeB"/></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_305_0: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs"><node id="P" name="Parent"><node id="C1" name="Child1"/><node id="C2" name="Child2"><node id="G" name="Grandchild"/></node></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_329_0: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs"><node id="n"><matrix>1 0 0 3  0 1 0 4  0 0 1 5  0 0 0 1</matrix></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_348_0: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs"><node id="n"><translate>7 -2 5</translate></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_364_0: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs"><node id="n"><rotate>0 1 0 90</rotate></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_381_0: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs"><node id="n"><scale>2 3 4</scale></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_397_0: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs"><node id="n"><translate>1 2 3</translate><scale>2 2 2</scale></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_416_0: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs"><node id="n"><lookat>0 0 10  0 0 0  0 1 0</lookat></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_432_0: &str = r##"<COLLADA><library_nodes><node id="shared" name="Shared"><translate>1 0 0</translate></node></library_nodes><library_visual_scenes><visual_scene id="vs"><node id="host" name="Host"><instance_node url="#shared"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_450_0: &str = r##"<COLLADA><library_nodes><node id="loop" name="Loop"><instance_node url="#loop"/></node></library_nodes><library_visual_scenes><visual_scene id="vs"><node id="root" name="Root"><instance_node url="#loop"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_466_0: &str = r##"<COLLADA><asset><up_axis>Z_UP</up_axis></asset><library_visual_scenes><visual_scene id="vs"><node id="n"><translate>0 0 5</translate></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_483_0: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs"/></library_visual_scenes><scene><instance_visual_scene url="#nonexistent"/></scene></COLLADA>"##;

const SOURCE_XML_494_0: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs"><node id="n"/></visual_scene></library_visual_scenes></COLLADA>"##;

const SOURCE_XML_619_0: &str = r##"<COLLADA><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="vs"><node id="n" name="MeshNode"><instance_geometry url="#g"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_854_0: &str = r##"<COLLADA><library_images><image id="tex"><init_from>tex.png</init_from></image></library_images><library_effects><effect id="fx"><profile_COMMON><newparam sid="surf"><surface><init_from>tex</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="samp"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects><library_materials><material id="MatA"><instance_effect url="#fx"/></material></library_materials><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1" material="DefaultSymbol"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="vs"><node id="n" name="N"><instance_geometry url="#g"><bind_material><technique_common><instance_material symbol="DefaultSymbol" target="#MatA"/></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_933_0: &str = r##"<COLLADA><library_images><image id="tex"><init_from>tex.png</init_from></image></library_images><library_effects><effect id="fxA"><profile_COMMON><newparam sid="surf"><surface><init_from>tex</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="samp"/></diffuse></lambert></technique></profile_COMMON></effect><effect id="fxB"><profile_COMMON><newparam sid="surf"><surface><init_from>tex</init_from></surface></newparam><newparam sid="samp"><sampler2D><source>surf</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="samp"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects><library_materials><material id="MatA"><instance_effect url="#fxA"/></material><material id="MatB"><instance_effect url="#fxB"/></material></library_materials><library_geometries><geometry id="g"><mesh><source id="p"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices><triangles count="1" material="Sym"><input semantic="VERTEX" source="#v" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_visual_scenes><visual_scene id="vs"><node id="n1" name="First"><instance_geometry url="#g"><bind_material><technique_common><instance_material symbol="Sym" target="#MatA"/></technique_common></bind_material></instance_geometry></node><node id="n2" name="Second"><instance_geometry url="#g"><bind_material><technique_common><instance_material symbol="Sym" target="#MatB"/></technique_common></bind_material></instance_geometry></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_1106_0: &str = r##"<COLLADA><library_images><image id="tex"><init_from>albedo.png</init_from></image></library_images><library_effects><effect id="fxA"><profile_COMMON><newparam sid="s"><surface><init_from>tex</init_from></surface></newparam><newparam sid="sm"><sampler2D><source>s</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="sm"/></diffuse></lambert></technique></profile_COMMON></effect><effect id="fxB"><profile_COMMON><newparam sid="s"><surface><init_from>tex</init_from></surface></newparam><newparam sid="sm"><sampler2D><source>s</source></sampler2D></newparam><technique><lambert><diffuse><texture texture="sm"/></diffuse></lambert></technique></profile_COMMON></effect></library_effects><library_materials><material id="MatA"><instance_effect url="#fxA"/></material><material id="MatB"><instance_effect url="#fxB"/></material></library_materials><library_geometries><geometry id="staticGeo"><mesh><source id="sp"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="sv"><input semantic="POSITION" source="#sp"/></vertices><triangles count="1" material="Sym"><input semantic="VERTEX" source="#sv" offset="0"/><p>0 1 2</p></triangles></mesh></geometry><geometry id="baseGeo"><mesh><source id="bp"><float_array>0 0 0 1 0 0 0 1 0</float_array></source><vertices id="bv"><input semantic="POSITION" source="#bp"/></vertices><triangles count="1" material="Sym"><input semantic="VERTEX" source="#bv" offset="0"/><p>0 1 2</p></triangles></mesh></geometry><geometry id="morphTarget"><mesh><source id="tp"><float_array>0 0 1 1 0 1 0 1 1</float_array></source><vertices id="tv"><input semantic="POSITION" source="#tp"/></vertices><triangles count="1"><input semantic="VERTEX" source="#tv" offset="0"/><p>0 1 2</p></triangles></mesh></geometry></library_geometries><library_controllers><controller id="morph1"><morph source="#baseGeo" method="NORMALIZED"><source id="mt"><IDREF_array>morphTarget</IDREF_array></source><source id="mw"><float_array>0.75</float_array></source><targets><input semantic="MORPH_TARGET" source="#mt"/><input semantic="MORPH_WEIGHT" source="#mw"/></targets></morph></controller><controller id="skin1"><skin source="#morph1"><bind_shape_matrix>1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1</bind_shape_matrix><source id="jn"><Name_array>JointA JointB</Name_array></source><source id="wt"><float_array>1 0</float_array></source><source id="ibm"><float_array>1 0 0 0  0 1 0 0  0 0 1 0  0 0 0 1 1 0 0 3  0 1 0 0  0 0 1 0  0 0 0 1</float_array></source><joints><input semantic="JOINT" source="#jn"/><input semantic="INV_BIND_MATRIX" source="#ibm"/></joints><vertex_weights count="1"><input semantic="JOINT" source="#jn" offset="0"/><input semantic="WEIGHT" source="#wt" offset="1"/><vcount>1</vcount><v>0 0</v></vertex_weights></skin></controller></library_controllers><library_cameras><camera id="cam1" name="MainCam"><optics><technique_common><perspective><yfov>60</yfov><znear>0.1</znear><zfar>100</zfar></perspective></technique_common></optics></camera></library_cameras><library_lights><light id="lamp" name="Sun"><technique_common><directional><color>1 1 1</color></directional></technique_common></light></library_lights><library_animations><animation><source id="at"><float_array>0 1</float_array></source><source id="ao"><float_array>0 0 0 5 0 0</float_array></source><source id="ai"><Name_array>LINEAR LINEAR</Name_array></source><sampler id="as"><input semantic="INPUT" source="#at"/><input semantic="OUTPUT" source="#ao"/><input semantic="INTERPOLATION" source="#ai"/></sampler><channel source="#as" target="JointA/translate"/></animation></library_animations><library_nodes><node id="shared" name="SharedProp"><translate>10 0 0</translate></node></library_nodes><library_visual_scenes><visual_scene id="vs"><node id="JointA" name="JointA"><translate>0 2 0</translate><node id="JointB" name="JointB"/></node><node id="staticNode" name="Static"><instance_geometry url="#staticGeo"><bind_material><technique_common><instance_material symbol="Sym" target="#MatA"/></technique_common></bind_material></instance_geometry></node><node id="skinnedNode" name="Skinned"><instance_controller url="#skin1"><skeleton>#JointA</skeleton><bind_material><technique_common><instance_material symbol="Sym" target="#MatB"/></technique_common></bind_material></instance_controller></node><node id="camNode" name="CamNode"><translate>0 5 10</translate><instance_camera url="#cam1"/></node><node id="lightNode" name="LightNode"><translate>0 10 0</translate><instance_light url="#lamp"/></node><node id="refHost" name="RefHost"><instance_node url="#shared"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

fn near(actual: f32, expected: f64) {
    // D1 f32 bound (TS: 0.000005)
    assert!((f64::from(actual) - expected).abs() < 0.000005);
}

mod parse_collada {
    use super::*;
    #[test]
    fn reads_asset_metadata_and_preserves_y_up_identity() {
        let result = parse_collada(SOURCE_XML_22_0, None);
        let document = result.document.read().unwrap();
        let metadata = document.metadata.as_ref().unwrap().read().unwrap();
        assert_eq!(
            (
                metadata.copyright.as_deref(),
                metadata.generator.as_deref(),
                metadata.version.as_deref()
            ),
            (Some("Me"), Some("Tool"), Some("1.4.1"))
        );
        assert_eq!(result.up_axis, ColladaUpAxis::YUp);
        assert_eq!(
            &*result.root_transform,
            &[
                1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
            ]
        );
    }

    #[test]
    fn returns_converted_materials_and_external_resources_from_the_public_parser() {
        let options = ColladaImportOptions {
            base_url: Some("/models".to_string()),
            decoders: None,
        };
        let result = parse_collada(SOURCE_XML_30_0, Some(&options));
        let document = result.document.read().unwrap();
        assert_eq!(document.materials.len(), 1);
        assert_eq!(document.resources.len(), 1);
        let ImageResourceReference::External(resource) = &document.resources[0] else {
            panic!("external image");
        };
        let resource = resource.reference.read().unwrap();
        assert_eq!(resource.base_path.as_deref(), Some("/models"));
        assert_eq!(resource.uri, "albedo.png");
    }

    #[test]
    fn reports_coordinate_conversion_and_unsupported_profiles() {
        let result = parse_collada(SOURCE_XML_39_0, None);
        assert_eq!(
            result
                .diagnostics
                .read()
                .unwrap()
                .iter()
                .map(|entry| (entry.kind.as_str(), entry.severity))
                .collect::<Vec<_>>(),
            [
                (
                    "collada.coordinate-conversion",
                    ImportDiagnosticSeverity::Recover
                ),
                (
                    "collada.unsupported-profile",
                    ImportDiagnosticSeverity::Skip
                )
            ]
        );
        assert_eq!(result.root_transform[6], -1.0);
    }

    #[test]
    fn rejects_invalid_xml_documents_and_reports_missing_instance_references() {
        let result = parse_collada(SOURCE_XML_50_0, None);
        assert_eq!(
            result.diagnostics.read().unwrap()[0].kind,
            "collada.invalid-document"
        );
        let result = parse_collada(SOURCE_XML_50_1, None);
        assert_eq!(
            result.diagnostics.read().unwrap()[0].kind,
            "collada.missing-reference"
        );
    }

    #[test]
    fn decodes_a_position_source_and_triangle_indices_into_flight_geometry() {
        let result = parse_collada(SOURCE_XML_185_0, None);
        let document = result.document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        let geometry = document.meshes[0].geometry.read().unwrap();
        let IndexBuffer::U32(indices) = &geometry.indices else {
            panic!("source Uint32 indices");
        };
        assert_eq!(&**indices.data.read().unwrap(), &[0, 1, 2]);
        assert_eq!(
            [
                geometry.vertices[0],
                geometry.vertices[1],
                geometry.vertices[2],
                geometry.vertices[12],
                geometry.vertices[13],
                geometry.vertices[14],
                geometry.vertices[24],
                geometry.vertices[25],
                geometry.vertices[26]
            ],
            [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0]
        );
    }

    #[test]
    fn reads_texcoord_data_into_uv0_when_present() {
        let result = parse_collada(SOURCE_XML_205_0, None);
        let document = result.document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        let geometry = document.meshes[0].geometry.read().unwrap();
        let v = &geometry.vertices;
        assert_eq!([v[10], v[11]], [0.0, 0.0]);
        assert_eq!([v[22], v[23]], [1.0, 0.0]);
        assert_eq!([v[34], v[35]], [0.5, 1.0]);
    }

    #[test]
    fn reads_normal_data_into_the_normal_attribute() {
        let result = parse_collada(SOURCE_XML_225_0, None);
        let document = result.document.read().unwrap();
        let geometry = document.meshes[0].geometry.read().unwrap();
        let v = &geometry.vertices;
        assert_eq!([v[3], v[4], v[5]], [0.0, 0.0, 1.0]);
    }

    #[test]
    fn imports_all_triangles_groups_from_a_multi_material_mesh() {
        let result = parse_collada(SOURCE_XML_242_0, None);
        let document = result.document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        let geometry = document.meshes[0].geometry.read().unwrap();
        let IndexBuffer::U32(indices) = &geometry.indices else {
            panic!("source Uint32 indices");
        };
        assert_eq!(&**indices.data.read().unwrap(), &[0, 1, 2, 1, 2, 3]);
        assert_eq!(
            geometry
                .subsets
                .iter()
                .map(|subset| (subset.index_count, subset.index_offset))
                .collect::<Vec<_>>(),
            [(3, 0), (3, 3)]
        );
    }

    #[test]
    fn does_not_report_missing_reference_for_instance_material_elements() {
        let result = parse_collada(SOURCE_XML_262_0, None);
        assert!(
            !result
                .diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "collada.missing-reference")
        );
    }

    #[test]
    fn builds_a_flat_node_list_from_visual_scene() {
        let result = parse_collada(SOURCE_XML_285_0, None);
        let document = result.document.read().unwrap();
        assert_eq!(document.scenes.len(), 1);
        assert_eq!(document.scenes[0].name.as_deref(), Some("Scene"));
        assert_eq!(document.scenes[0].root_nodes, [0, 1]);
        assert_eq!(document.nodes.len(), 2);
        assert_eq!(document.nodes[0].name.as_deref(), Some("NodeA"));
        assert_eq!(document.nodes[0].kind, NODE3D_KIND);
        assert_eq!(document.nodes[1].name.as_deref(), Some("NodeB"));
    }

    #[test]
    fn builds_nested_node_hierarchy_with_children_indices() {
        let result = parse_collada(SOURCE_XML_305_0, None);
        let document = result.document.read().unwrap();
        assert_eq!(document.scenes[0].root_nodes, [0]);
        assert_eq!(document.nodes.len(), 4);
        assert_eq!(
            document
                .nodes
                .iter()
                .map(|node| node.name.as_deref())
                .collect::<Vec<_>>(),
            [
                Some("Parent"),
                Some("Child1"),
                Some("Child2"),
                Some("Grandchild")
            ]
        );
        assert_eq!(document.nodes[0].children, [1, 2]);
        assert!(document.nodes[1].children.is_empty());
        assert_eq!(document.nodes[2].children, [3]);
    }

    #[test]
    fn decomposes_a_collada_row_major_matrix_into_transform3d() {
        let result = parse_collada(SOURCE_XML_329_0, None);
        let document = result.document.read().unwrap();
        let transform = &document.nodes[0].transform;
        for (actual, expected) in [
            (transform.position.x, 3.0),
            (transform.position.y, 4.0),
            (transform.position.z, 5.0),
            (transform.scale.x, 1.0),
            (transform.scale.y, 1.0),
            (transform.scale.z, 1.0),
        ] {
            near(actual, expected);
        }
    }

    #[test]
    fn applies_translate_transform_elements() {
        let result = parse_collada(SOURCE_XML_348_0, None);
        let document = result.document.read().unwrap();
        let position = &document.nodes[0].transform.position;
        near(position.x, 7.0);
        near(position.y, -2.0);
        near(position.z, 5.0);
    }

    #[test]
    fn applies_rotate_transform_elements_with_degrees_to_radians_conversion() {
        let result = parse_collada(SOURCE_XML_364_0, None);
        let document = result.document.read().unwrap();
        let rotation = &document.nodes[0].transform.rotation;
        near(rotation.x, 0.0);
        near(rotation.y.abs(), (std::f64::consts::PI / 4.0).sin());
        near(rotation.z, 0.0);
        near(rotation.w, (std::f64::consts::PI / 4.0).cos());
    }

    #[test]
    fn applies_scale_transform_elements() {
        let result = parse_collada(SOURCE_XML_381_0, None);
        let document = result.document.read().unwrap();
        let scale = &document.nodes[0].transform.scale;
        near(scale.x, 2.0);
        near(scale.y, 3.0);
        near(scale.z, 4.0);
    }

    #[test]
    fn composes_multiple_transform_elements_left_to_right() {
        let result = parse_collada(SOURCE_XML_397_0, None);
        let document = result.document.read().unwrap();
        let transform = &document.nodes[0].transform;
        near(transform.position.x, 1.0);
        near(transform.position.y, 2.0);
        near(transform.position.z, 3.0);
        near(transform.scale.x, 2.0);
        near(transform.scale.y, 2.0);
        near(transform.scale.z, 2.0);
    }

    #[test]
    fn applies_lookat_as_a_placement_matrix() {
        let result = parse_collada(SOURCE_XML_416_0, None);
        let document = result.document.read().unwrap();
        let position = &document.nodes[0].transform.position;
        near(position.x, 0.0);
        near(position.y, 0.0);
        near(position.z, 10.0);
    }

    #[test]
    fn resolves_instance_node_from_library_nodes() {
        let result = parse_collada(SOURCE_XML_432_0, None);
        let document = result.document.read().unwrap();
        assert_eq!(document.nodes.len(), 2);
        assert_eq!(document.nodes[0].name.as_deref(), Some("Host"));
        assert_eq!(document.nodes[0].children, [1]);
        assert_eq!(document.nodes[1].name.as_deref(), Some("Shared"));
        near(document.nodes[1].transform.position.x, 1.0);
    }

    #[test]
    fn detects_instance_node_cycles_and_reports_diagnostic() {
        let result = parse_collada(SOURCE_XML_450_0, None);
        assert_eq!(result.document.read().unwrap().nodes.len(), 2);
        assert!(
            result
                .diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "collada.instance-cycle")
        );
    }

    #[test]
    fn applies_z_up_root_transform_to_root_nodes() {
        let result = parse_collada(SOURCE_XML_466_0, None);
        let document = result.document.read().unwrap();
        let position = &document.nodes[0].transform.position;
        near(position.x, 0.0);
        near(position.y, 5.0);
        near(position.z, 0.0);
    }

    #[test]
    fn reports_missing_instance_visual_scene_reference() {
        let result = parse_collada(SOURCE_XML_483_0, None);
        assert!(
            result
                .diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| entry.kind == "collada.missing-reference")
        );
    }

    #[test]
    fn produces_no_scene_when_scene_element_is_absent() {
        let result = parse_collada(SOURCE_XML_494_0, None);
        let document = result.document.read().unwrap();
        assert!(document.scenes.is_empty());
        assert!(document.nodes.is_empty());
    }

    #[test]
    fn binds_instance_geometry_to_a_mesh() {
        let result = parse_collada(SOURCE_XML_619_0, None);
        let document = result.document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.nodes.len(), 1);
        assert_eq!(document.nodes[0].mesh, Some(0));
    }

    #[test]
    fn applies_bind_material_overrides_on_instance_geometry() {
        let result = parse_collada(SOURCE_XML_854_0, None);
        let document = result.document.read().unwrap();
        assert_eq!(document.meshes.len(), 1);
        assert_eq!(document.nodes[0].mesh, Some(0));
        assert_eq!(document.meshes[0].materials, [0]);
    }

    #[test]
    fn clones_mesh_when_two_instances_bind_different_materials_to_the_same_geometry() {
        let result = parse_collada(SOURCE_XML_933_0, None);
        let document = result.document.read().unwrap();
        assert_eq!(document.meshes.len(), 2);
        assert_eq!(document.nodes[0].mesh, Some(0));
        assert_eq!(document.nodes[1].mesh, Some(1));
        assert_eq!(document.meshes[0].materials, [0]);
        assert_eq!(document.meshes[1].materials, [1]);
        assert!(Arc::ptr_eq(
            &document.meshes[0].geometry,
            &document.meshes[1].geometry
        ));
    }

    #[test]
    fn exercises_all_five_instance_kinds_with_morph_skin_camera_light_material_override_and_animation()
     {
        let result = parse_collada(SOURCE_XML_1106_0, None);
        assert!(
            !result
                .diagnostics
                .read()
                .unwrap()
                .iter()
                .any(|entry| matches!(
                    entry.severity,
                    ImportDiagnosticSeverity::Reject | ImportDiagnosticSeverity::Drop
                ))
        );
        let document = result.document.read().unwrap();
        let static_index = document
            .nodes
            .iter()
            .position(|node| node.name.as_deref() == Some("Static"))
            .unwrap();
        assert_eq!(document.nodes[static_index].mesh, Some(0));
        assert_eq!(document.meshes[0].materials, [0]);
        let skinned_index = document
            .nodes
            .iter()
            .position(|node| node.name.as_deref() == Some("Skinned"))
            .unwrap();
        let mesh = &document.meshes[document.nodes[skinned_index].mesh.unwrap() as usize];
        assert_eq!(mesh.materials, [1]);
        assert_eq!(mesh.skin, Some(0));
        assert_eq!(document.skins.len(), 1);
        assert_eq!(document.skins[0].joints.len(), 2);
        let morph = mesh.morph.as_ref().unwrap().read().unwrap();
        assert_eq!(morph.targets.len(), 1);
        assert_eq!(&*morph.weights, &[0.75]);
        for index in [2, 5, 8] {
            near(morph.targets[0].position_deltas[index], 1.0);
        }
        assert_eq!(document.skins[0].inverse_bind[1].m[12], 3.0);
        assert_eq!(document.cameras.len(), 1);
        let camera = &document.cameras[0];
        assert_eq!(camera.name.as_deref(), Some("MainCam"));
        let camera_node = document
            .nodes
            .iter()
            .position(|node| node.name.as_deref() == Some("CamNode"))
            .unwrap();
        assert_eq!(camera.node, Some(camera_node as i32));
        near(camera.transform.position.y, 5.0);
        near(camera.transform.position.z, 10.0);
        assert_eq!(document.lights.len(), 1);
        let light = &document.lights[0];
        assert_eq!(light.name.as_deref(), Some("Sun"));
        let light_node = document
            .nodes
            .iter()
            .position(|node| node.name.as_deref() == Some("LightNode"))
            .unwrap();
        assert_eq!(light.node, Some(light_node as i32));
        assert_eq!(
            light.descriptor.read().unwrap().kind(),
            flight_lighting::DIRECTIONAL_LIGHT_KIND
        );
        near(light.transform.position.y, 10.0);
        let host_index = document
            .nodes
            .iter()
            .position(|node| node.name.as_deref() == Some("RefHost"))
            .unwrap();
        assert_eq!(document.nodes[host_index].children.len(), 1);
        let shared_index = document.nodes[host_index].children[0] as usize;
        assert_eq!(
            document.nodes[shared_index].name.as_deref(),
            Some("SharedProp")
        );
        near(document.nodes[shared_index].transform.position.x, 10.0);
        assert_eq!(document.animations.len(), 1);
        let animation = &document.animations[0];
        assert_eq!(animation.channels.len(), 1);
        let joint_a = document
            .nodes
            .iter()
            .position(|node| node.name.as_deref() == Some("JointA"))
            .unwrap();
        assert_eq!(animation.channels[0].node, joint_a as i32);
        assert_eq!(
            animation.channels[0].path,
            flight_scene3d::Scene3DAnimationPath::Translation
        );
        assert_eq!(animation.duration, 1.0);
    }
}
