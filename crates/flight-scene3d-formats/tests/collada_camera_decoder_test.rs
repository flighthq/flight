use flight_camera::Projection;
use flight_importdiagnostics::{ImportDiagnosticDetailValue, ImportDiagnosticSeverity};
use flight_scene3d_formats::*;

const SOURCE_XML_0: &str = r##"<COLLADA><library_cameras><camera id="view" name="Main View"><optics><technique_common><perspective><yfov>45</yfov><aspect_ratio>1.5</aspect_ratio><znear>0.25</znear><zfar>400</zfar></perspective></technique_common></optics></camera></library_cameras><library_visual_scenes><visual_scene id="vs"><node id="camera-node"><translate>1 2 3</translate><instance_camera url="#view"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_1: &str = r##"<COLLADA><library_cameras><camera id="view"><optics><technique_common><orthographic><xmag>8</xmag><ymag>6</ymag><znear>0</znear><zfar>50</zfar></orthographic></technique_common></optics></camera></library_cameras><library_visual_scenes><visual_scene id="vs"><node id="camera-node"><instance_camera url="#view"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_2: &str = r##"<COLLADA><library_visual_scenes><visual_scene id="vs"><node id="camera-node"><instance_camera url="#missing"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_3: &str = r##"<COLLADA><library_cameras><camera id="view"><optics><technique_common><perspective><yfov>50</yfov><znear>0.5</znear><zfar>500</zfar></perspective></technique_common></optics></camera></library_cameras><library_visual_scenes><visual_scene id="vs"><node id="parent"><translate>2 3 4</translate><node id="camera-node"><translate>5 6 7</translate><instance_camera url="#view"/></node></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

const SOURCE_XML_4: &str = r##"<COLLADA><library_cameras><camera id="view"><optics><technique_common><perspective><znear>0.5</znear></perspective></technique_common></optics></camera></library_cameras><library_visual_scenes><visual_scene id="vs"><node id="camera-node"><instance_camera url="#view"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##;

fn parse_cameras(xml: &str) -> ColladaParseResult {
    return parse_collada(xml, None);
}

mod collada_camera_decoder {
    use super::*;

    #[test]
    fn imports_and_binds_a_perspective_camera() {
        let decoder = COLLADA_CAMERA_DECODER.read().unwrap();
        assert_eq!(decoder.build_phase, Some(10.0));
        assert!(decoder.build.is_some());
        assert_eq!(decoder.elements, ["camera"]);
        assert_eq!(
            decoder.features,
            ["Camera", "Camera.Orthographic", "Camera.Perspective"]
        );
        drop(decoder);
        let result = parse_cameras(SOURCE_XML_0);
        assert!(result.diagnostics.read().unwrap().is_empty());
        let document = result.document.read().unwrap();
        assert_eq!(document.cameras.len(), 1);
        let camera = &document.cameras[0];
        assert_eq!(
            (camera.far, camera.near, camera.node, camera.name.as_deref()),
            (400.0, 0.25, Some(0), Some("Main View"))
        );
        let Projection::Perspective(projection) = &camera.projection else {
            panic!("perspective projection");
        };
        let projection = projection.read().unwrap();
        assert_eq!(projection.aspect, 1.5);
        // D1 f32 bound (TS: 0.000005)
        assert!(((projection.fov_y as f64) - std::f64::consts::PI / 4.0).abs() < 0.000005);
        assert_eq!(
            (
                camera.transform.position.x,
                camera.transform.position.y,
                camera.transform.position.z
            ),
            (1.0, 2.0, 3.0)
        );
    }

    #[test]
    fn imports_and_binds_an_orthographic_camera() {
        let result = parse_cameras(SOURCE_XML_1);
        assert!(result.diagnostics.read().unwrap().is_empty());
        let document = result.document.read().unwrap();
        assert_eq!(document.cameras.len(), 1);
        let camera = &document.cameras[0];
        assert_eq!((camera.far, camera.near, camera.node), (50.0, 0.0, Some(0)));
        let Projection::Orthographic(projection) = &camera.projection else {
            panic!("orthographic projection");
        };
        let projection = projection.read().unwrap();
        assert_eq!((projection.half_height, projection.half_width), (6.0, 8.0));
    }

    #[test]
    fn reports_a_dropped_instance_camera_with_a_missing_definition() {
        let result = parse_cameras(SOURCE_XML_2);
        assert!(result.document.read().unwrap().cameras.is_empty());
        let diagnostics = result.diagnostics.read().unwrap();
        let diagnostic = diagnostics
            .iter()
            .find(|entry| {
                entry.kind == "collada.missing-reference"
                    && entry.severity == ImportDiagnosticSeverity::Drop
            })
            .unwrap();
        assert_eq!(diagnostic.origin, "parseCollada");
        assert_eq!(
            diagnostic.detail.as_ref().unwrap().get("element"),
            Some(&ImportDiagnosticDetailValue::String(
                "instance_camera".to_string()
            ))
        );
        assert_eq!(
            diagnostic.detail.as_ref().unwrap().get("url"),
            Some(&ImportDiagnosticDetailValue::String("#missing".to_string()))
        );
        assert_eq!(diagnostic.detail.as_ref().unwrap().len(), 2);
    }

    #[test]
    fn composes_the_camera_transform_through_its_visual_scene_hierarchy() {
        let result = parse_cameras(SOURCE_XML_3);
        assert!(result.diagnostics.read().unwrap().is_empty());
        let document = result.document.read().unwrap();
        assert_eq!(document.nodes[0].children, [1]);
        let camera = &document.cameras[0];
        assert_eq!(camera.node, Some(1));
        assert_eq!(
            (
                camera.transform.position.x,
                camera.transform.position.y,
                camera.transform.position.z
            ),
            (7.0, 9.0, 11.0)
        );
    }

    #[test]
    fn recovers_incomplete_perspective_definitions_with_documented_defaults() {
        let result = parse_cameras(SOURCE_XML_4);
        let document = result.document.read().unwrap();
        let camera = &document.cameras[0];
        assert_eq!((camera.far, camera.near), (1000.0, 0.5));
        let Projection::Perspective(projection) = &camera.projection else {
            panic!("perspective projection");
        };
        let projection = projection.read().unwrap();
        assert_eq!(projection.aspect, 1.0);
        // D1 f32 bound (TS: 0.000005)
        assert!(((projection.fov_y as f64) - std::f64::consts::PI / 3.0).abs() < 0.000005);
        let diagnostics = result.diagnostics.read().unwrap();
        let diagnostic = diagnostics
            .iter()
            .find(|entry| entry.kind == "collada.camera-incomplete")
            .unwrap();
        assert_eq!(diagnostic.origin, "parseCollada");
        assert_eq!(diagnostic.severity, ImportDiagnosticSeverity::Recover);
        let detail = diagnostic.detail.as_ref().unwrap();
        for (key, value) in [
            ("camera", "view"),
            ("fields", "yfov,zfar"),
            ("projection", "perspective"),
        ] {
            assert_eq!(
                detail.get(key),
                Some(&ImportDiagnosticDetailValue::String(value.to_string()))
            );
        }
        assert_eq!(detail.len(), 3);
    }

    #[test]
    fn preserves_present_but_invalid_definitions_without_also_reporting_them_missing() {
        let result = parse_cameras(
            r##"<COLLADA><library_cameras>
            <camera id="p"><optics><technique_common><perspective><yfov>180</yfov><znear>1</znear><zfar>2</zfar></perspective></technique_common></optics></camera>
            <camera id="o"><optics><technique_common><orthographic><xmag>-1</xmag></orthographic></technique_common></optics></camera>
            <camera id="empty"/>
            </library_cameras><library_visual_scenes><visual_scene id="vs"><node><instance_camera url="#p"/><instance_camera url="#o"/><instance_camera url="#empty"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#vs"/></scene></COLLADA>"##,
        );
        assert!(result.document.read().unwrap().cameras.is_empty());
        let diagnostics = result.diagnostics.read().unwrap();
        assert_eq!(
            diagnostics
                .iter()
                .map(|entry| entry.kind.as_str())
                .collect::<Vec<_>>(),
            [
                "collada.camera-invalid-perspective",
                "collada.camera-invalid-orthographic",
                "collada.camera-missing-descriptor"
            ]
        );
        assert!(
            diagnostics
                .iter()
                .all(|entry| entry.severity == ImportDiagnosticSeverity::Drop)
        );
    }
}
