//! XML front-end of the Tiled codec: TMX maps and standalone TSX tilesets
//! (TS `tiledXmlParse.ts`).

use flight_importdiagnostics::{
    ImportDiagnostic, ImportDiagnosticDetailValue, ImportDiagnosticSeverity, report_import_diagnostic,
};
use flight_xml::{
    XmlElement, get_xml_element_attribute, get_xml_element_child_by_name,
    get_xml_element_children_by_name, parse_xml_document,
};

use crate::tiled_color::parse_tiled_color;
use crate::tiled_layer_data::{decode_tiled_base64_layer, decode_tiled_csv_layer};
use crate::types::*;

fn as_compression(value: Option<&str>) -> Option<TiledCompression> {
    return match value {
        Some("gzip") => Some(TiledCompression::Gzip),
        Some("zlib") => Some(TiledCompression::Zlib),
        Some("zstd") => Some(TiledCompression::Zstd),
        _ => None,
    };
}

fn as_object_alignment(value: Option<&str>) -> TiledObjectAlignment {
    return match value {
        Some("topleft") => TiledObjectAlignment::TopLeft,
        Some("top") => TiledObjectAlignment::Top,
        Some("topright") => TiledObjectAlignment::TopRight,
        Some("left") => TiledObjectAlignment::Left,
        Some("center") => TiledObjectAlignment::Center,
        Some("right") => TiledObjectAlignment::Right,
        Some("bottomleft") => TiledObjectAlignment::BottomLeft,
        Some("bottom") => TiledObjectAlignment::Bottom,
        Some("bottomright") => TiledObjectAlignment::BottomRight,
        _ => TiledObjectAlignment::Unspecified,
    };
}

fn as_orientation(value: Option<&str>) -> TiledOrientation {
    return match value {
        Some("isometric") => TiledOrientation::Isometric,
        Some("staggered") => TiledOrientation::Staggered,
        Some("hexagonal") => TiledOrientation::Hexagonal,
        _ => TiledOrientation::Orthogonal,
    };
}

fn as_property_type(value: Option<&str>) -> TiledPropertyType {
    return match value {
        Some("int") => TiledPropertyType::Int,
        Some("float") => TiledPropertyType::Float,
        Some("bool") => TiledPropertyType::Bool,
        Some("color") => TiledPropertyType::Color,
        Some("file") => TiledPropertyType::File,
        Some("object") => TiledPropertyType::Object,
        _ => TiledPropertyType::String,
    };
}

fn as_render_order(value: Option<&str>) -> TiledRenderOrder {
    return match value {
        Some("right-up") => TiledRenderOrder::RightUp,
        Some("left-down") => TiledRenderOrder::LeftDown,
        Some("left-up") => TiledRenderOrder::LeftUp,
        _ => TiledRenderOrder::RightDown,
    };
}

fn as_stagger_axis(value: Option<&str>) -> Option<TiledStaggerAxis> {
    return match value {
        Some("x") => Some(TiledStaggerAxis::X),
        Some("y") => Some(TiledStaggerAxis::Y),
        _ => None,
    };
}

fn as_stagger_index(value: Option<&str>) -> Option<TiledStaggerIndex> {
    return match value {
        Some("even") => Some(TiledStaggerIndex::Even),
        Some("odd") => Some(TiledStaggerIndex::Odd),
        _ => None,
    };
}

fn attr_bool(element: &XmlElement, name: &str, fallback: bool) -> bool {
    let value = get_xml_element_attribute(element, name);
    let Some(value) = value else {
        return fallback;
    };
    return value == "1" || value == "true";
}

// flight-lint: allow(f64) XML attributes parsed as f64 for Tiled coordinate and numeric values
fn attr_number(element: &XmlElement, name: &str, fallback: f64) -> f64 {
    let value = get_xml_element_attribute(element, name);
    let Some(value) = value else {
        return fallback;
    };
    if value.trim().is_empty() {
        return fallback;
    }
    let n: f64 = value.parse().unwrap_or(f64::NAN);
    if n.is_finite() {
        return n;
    }
    return fallback;
}

fn attr_string(element: &XmlElement, name: &str, fallback: &str) -> String {
    return get_xml_element_attribute(element, name)
        .map(|s| s.to_string())
        .unwrap_or_else(|| fallback.to_string());
}

fn build_tiled_layer_base_from_xml(element: &XmlElement) -> TiledLayerBase {
    let tint = get_xml_element_attribute(element, "tintcolor");
    return TiledLayerBase {
        class: attr_string(element, "class", ""),
        id: attr_number(element, "id", 0.0) as i32,
        name: attr_string(element, "name", ""),
        offset_x: attr_number(element, "offsetx", 0.0),
        offset_y: attr_number(element, "offsety", 0.0),
        opacity: attr_number(element, "opacity", 1.0),
        parallax_x: attr_number(element, "parallaxx", 1.0),
        parallax_y: attr_number(element, "parallaxy", 1.0),
        properties: build_tiled_properties_from_xml(element),
        tint_color: tint.and_then(|t| parse_tiled_color(t)),
        visible: attr_bool(element, "visible", true),
    };
}

fn build_tiled_layer_data_from_xml(
    element: &XmlElement,
    width: i32,
    height: i32,
    options: Option<&TiledParseOptions>,
    diagnostics: &mut Vec<ImportDiagnostic>,
    use_diag: bool,
    path: &str,
) -> Vec<u32> {
    let grid_size = (width * height) as usize;
    let mut grid = vec![0u32; grid_size];
    let data_ref = get_xml_element_child_by_name(element, "data");
    let Some(data_ref) = data_ref else {
        if use_diag {
            report_missing_required_field(diagnostics, "buildTiledLayerDataFromXml", path, None);
        }
        return grid;
    };
    let data = data_ref.read().unwrap();

    let encoding = get_xml_element_attribute(&data, "encoding");
    let decoded: Option<Vec<u32>>;
    if encoding == Some("csv") {
        decoded = Some(decode_tiled_csv_layer(&data.text));
    } else if encoding == Some("base64") {
        let compression = as_compression(get_xml_element_attribute(&data, "compression"));
        if compression.is_some() && options.and_then(|o| o.inflate.as_ref()).is_none() && use_diag {
            report_import_diagnostic(
                Some(diagnostics),
                ImportDiagnosticSeverity::Recover,
                "tiled.layer-inflate-unavailable",
                "buildTiledLayerDataFromXml",
                detail_map(&[
                    ("compression", ImportDiagnosticDetailValue::String(compression.unwrap().as_str().to_string())),
                    ("path", ImportDiagnosticDetailValue::String(path.to_string())),
                ]),
            );
        }
        decoded = decode_tiled_base64_layer(&data.text, compression, options.and_then(|o| o.inflate.as_ref()));
    } else {
        if encoding.is_some() && use_diag {
            report_import_diagnostic(
                Some(diagnostics),
                ImportDiagnosticSeverity::Recover,
                "tiled.layer-encoding-invalid",
                "buildTiledLayerDataFromXml",
                detail_map(&[
                    ("encoding", ImportDiagnosticDetailValue::String(encoding.unwrap().to_string())),
                    ("path", ImportDiagnosticDetailValue::String(format!("{}.encoding", path))),
                ]),
            );
        }
        let tiles = get_xml_element_children_by_name(&data, "tile");
        decoded = Some(
            tiles
                .iter()
                .map(|tile| attr_number(&tile.read().unwrap(), "gid", 0.0) as u32)
                .collect(),
        );
    }
    if let Some(decoded) = decoded {
        let copy_len = decoded.len().min(grid_size);
        grid[..copy_len].copy_from_slice(&decoded[..copy_len]);
    }
    return grid;
}

fn build_tiled_layer_from_xml(
    element: &XmlElement,
    options: Option<&TiledParseOptions>,
    diagnostics: &mut Vec<ImportDiagnostic>,
    use_diag: bool,
    path: &str,
) -> Option<TiledLayer> {
    let base = build_tiled_layer_base_from_xml(element);
    if element.name == "layer" {
        if use_diag {
            report_missing_xml_attribute(element, "height", diagnostics, "buildTiledLayerFromXml", path);
            report_missing_xml_attribute(element, "width", diagnostics, "buildTiledLayerFromXml", path);
        }
        let width = attr_number(element, "width", 0.0) as i32;
        let height = attr_number(element, "height", 0.0) as i32;
        let data_path = if use_diag {
            format!("{}.data", path)
        } else {
            String::new()
        };
        let data = build_tiled_layer_data_from_xml(element, width, height, options, diagnostics, use_diag, &data_path);
        return Some(TiledLayer::TileLayer(TiledTileLayerData {
            base,
            data,
            height,
            width,
        }));
    }
    if element.name == "objectgroup" {
        let objects = get_xml_element_children_by_name(element, "object")
            .iter()
            .map(|el| build_tiled_object_from_xml(&el.read().unwrap()))
            .collect();
        return Some(TiledLayer::ObjectGroup(TiledObjectGroupData { base, objects }));
    }
    if element.name == "imagelayer" {
        let image = get_xml_element_child_by_name(element, "image");
        let image_source = image
            .as_ref()
            .map(|i| attr_string(&i.read().unwrap(), "source", ""))
            .unwrap_or_default();
        return Some(TiledLayer::ImageLayer(TiledImageLayerData {
            base,
            image: image_source,
            repeat_x: attr_bool(element, "repeatx", false),
            repeat_y: attr_bool(element, "repeaty", false),
        }));
    }
    if element.name == "group" {
        let mut sub_layers: Vec<TiledLayer> = Vec::new();
        for child_ref in &element.children {
            let child = child_ref.read().unwrap();
            let sub_path = if use_diag {
                format!("{}.layers[{}]", path, sub_layers.len())
            } else {
                String::new()
            };
            let layer = build_tiled_layer_from_xml(&child, options, diagnostics, use_diag, &sub_path);
            if let Some(layer) = layer {
                sub_layers.push(layer);
            }
        }
        return Some(TiledLayer::Group(TiledGroupData {
            base,
            layers: sub_layers,
        }));
    }
    return None;
}

// flight-lint: allow(f64) Tiled object x/y/width/height/rotation are fractional coordinates
fn build_tiled_object_from_xml(element: &XmlElement) -> TiledObject {
    let gid = get_xml_element_attribute(element, "gid");
    let polygon = get_xml_element_child_by_name(element, "polygon");
    let polyline = get_xml_element_child_by_name(element, "polyline");
    return TiledObject {
        ellipse: get_xml_element_child_by_name(element, "ellipse").is_some(),
        gid: gid.and_then(|g| g.parse::<f64>().ok()).map(|g| g as u32),
        height: attr_number(element, "height", 0.0),
        id: attr_number(element, "id", 0.0) as i32,
        name: attr_string(element, "name", ""),
        point: get_xml_element_child_by_name(element, "point").is_some(),
        polygon: polygon.map(|p| parse_tiled_points(&attr_string(&p.read().unwrap(), "points", ""))),
        polyline: polyline.map(|p| parse_tiled_points(&attr_string(&p.read().unwrap(), "points", ""))),
        properties: build_tiled_properties_from_xml(element),
        rotation: attr_number(element, "rotation", 0.0),
        object_type: attr_string(
            element,
            "type",
            &attr_string(element, "class", ""),
        ),
        visible: attr_bool(element, "visible", true),
        width: attr_number(element, "width", 0.0),
        x: attr_number(element, "x", 0.0),
        y: attr_number(element, "y", 0.0),
    };
}

fn build_tiled_properties_from_xml(element: &XmlElement) -> Vec<TiledProperty> {
    let container = get_xml_element_child_by_name(element, "properties");
    let Some(container) = container else {
        return Vec::new();
    };
    let container_guard = container.read().unwrap();
    return get_xml_element_children_by_name(&container_guard, "property")
        .iter()
        .map(|prop_ref| {
            let property = prop_ref.read().unwrap();
            let prop_type = as_property_type(get_xml_element_attribute(&property, "type"));
            let raw = get_xml_element_attribute(&property, "value")
                .map(|s| s.to_string())
                .unwrap_or_else(|| property.text.clone());
            return TiledProperty {
                name: attr_string(&property, "name", ""),
                value: parse_property_value(&prop_type, &raw),
                property_type: prop_type,
            };
        })
        .collect();
}

fn build_tiled_tileset_from_xml(
    element: &XmlElement,
    diagnostics: &mut Vec<ImportDiagnostic>,
    use_diag: bool,
    path: &str,
) -> TiledTileset {
    if use_diag {
        report_missing_xml_attribute(element, "name", diagnostics, "buildTiledTilesetFromXml", path);
        report_missing_xml_attribute(element, "tileheight", diagnostics, "buildTiledTilesetFromXml", path);
        report_missing_xml_attribute(element, "tilewidth", diagnostics, "buildTiledTilesetFromXml", path);
    }
    let image = get_xml_element_child_by_name(element, "image");
    let tile_offset = get_xml_element_child_by_name(element, "tileoffset");
    return TiledTileset {
        columns: attr_number(element, "columns", 0.0) as i32,
        image: image.as_ref().map(|i| attr_string(&i.read().unwrap(), "source", "")),
        image_height: image
            .as_ref()
            .map(|i| attr_number(&i.read().unwrap(), "height", 0.0) as i32)
            .unwrap_or(0),
        image_width: image
            .as_ref()
            .map(|i| attr_number(&i.read().unwrap(), "width", 0.0) as i32)
            .unwrap_or(0),
        margin: attr_number(element, "margin", 0.0) as i32,
        name: attr_string(element, "name", ""),
        object_alignment: as_object_alignment(get_xml_element_attribute(element, "objectalignment")),
        properties: build_tiled_properties_from_xml(element),
        spacing: attr_number(element, "spacing", 0.0) as i32,
        tile_offset_x: tile_offset
            .as_ref()
            .map(|o| attr_number(&o.read().unwrap(), "x", 0.0) as i32)
            .unwrap_or(0),
        tile_offset_y: tile_offset
            .as_ref()
            .map(|o| attr_number(&o.read().unwrap(), "y", 0.0) as i32)
            .unwrap_or(0),
        tile_count: attr_number(element, "tilecount", 0.0) as i32,
        tile_height: attr_number(element, "tileheight", 0.0) as i32,
        tile_width: attr_number(element, "tilewidth", 0.0) as i32,
        tiles: get_xml_element_children_by_name(element, "tile")
            .iter()
            .map(|el| build_tiled_tileset_tile_from_xml(&el.read().unwrap()))
            .collect(),
    };
}

fn build_tiled_tileset_ref_from_xml(
    element: &XmlElement,
    diagnostics: &mut Vec<ImportDiagnostic>,
    use_diag: bool,
    path: &str,
) -> TiledTilesetRef {
    let source = get_xml_element_attribute(element, "source").map(|s| s.to_string());
    return TiledTilesetRef {
        first_gid: attr_number(element, "firstgid", 1.0) as i32,
        tileset: if source.is_some() {
            None
        } else {
            Some(build_tiled_tileset_from_xml(element, diagnostics, use_diag, path))
        },
        source,
    };
}

fn build_tiled_tileset_tile_from_xml(element: &XmlElement) -> TiledTilesetTile {
    let animation = get_xml_element_child_by_name(element, "animation");
    let object_group = get_xml_element_child_by_name(element, "objectgroup");
    let image = get_xml_element_child_by_name(element, "image");
    let frames: Option<Vec<TiledTilesetTileFrame>> = animation.map(|anim| {
        let anim_guard = anim.read().unwrap();
        get_xml_element_children_by_name(&anim_guard, "frame")
            .iter()
            .map(|frame| {
                let f = frame.read().unwrap();
                TiledTilesetTileFrame {
                    duration: attr_number(&f, "duration", 0.0) as i32,
                    tile_id: attr_number(&f, "tileid", 0.0) as i32,
                }
            })
            .collect()
    });
    return TiledTilesetTile {
        animation: frames,
        id: attr_number(element, "id", 0.0) as i32,
        image: image.map(|i| attr_string(&i.read().unwrap(), "source", "")),
        objects: object_group.map(|og| {
            let og_guard = og.read().unwrap();
            get_xml_element_children_by_name(&og_guard, "object")
                .iter()
                .map(|el| build_tiled_object_from_xml(&el.read().unwrap()))
                .collect()
        }),
        properties: build_tiled_properties_from_xml(element),
        tile_type: attr_string(element, "type", &attr_string(element, "class", "")),
    };
}

// flight-lint: allow(f64) Tiled property values store f64 for int/float types per the TMX spec
fn parse_property_value(prop_type: &TiledPropertyType, raw: &str) -> TiledPropertyValue {
    return match prop_type {
        TiledPropertyType::Bool => TiledPropertyValue::Bool(raw == "true"),
        TiledPropertyType::Int | TiledPropertyType::Float => {
            let n: f64 = raw.parse().unwrap_or(f64::NAN);
            TiledPropertyValue::Number(if n.is_finite() { n } else { 0.0 })
        }
        _ => TiledPropertyValue::String(raw.to_string()),
    };
}

fn parse_tiled_points(text: &str) -> Vec<flight_geometry::Vector2> {
    let mut points = Vec::new();
    for pair in text.trim().split_whitespace() {
        if pair.is_empty() {
            continue;
        }
        let parts: Vec<&str> = pair.split(',').collect();
        let x: f32 = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0.0);
        let y: f32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0.0);
        points.push(flight_geometry::create_vector2(x, y));
    }
    return points;
}

pub fn parse_tiled_tileset(
    text: &str,
    _options: Option<&TiledParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<TiledTileset> {
    let root = parse_xml_document(text);
    let Some(root) = root else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "tiled.xml-malformed",
            "parseTiledTileset",
            detail_map(&[("path", ImportDiagnosticDetailValue::String("tileset".to_string()))]),
        );
        return None;
    };
    if root.name != "tileset" {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "tiled.root-unexpected",
            "parseTiledTileset",
            detail_map(&[
                ("actual", ImportDiagnosticDetailValue::String(root.name.clone())),
                ("path", ImportDiagnosticDetailValue::String("tileset".to_string())),
            ]),
        );
        return None;
    }
    let mut diag_vec: Vec<ImportDiagnostic> = Vec::new();
    let use_diag = diagnostics.is_some();
    let result = build_tiled_tileset_from_xml(&root, &mut diag_vec, use_diag, "tileset");
    if let Some(diagnostics) = diagnostics {
        diagnostics.extend(diag_vec);
    }
    return Some(result);
}

// flight-lint: allow(f64) hex_side_length is parsed as f64 from the XML attribute value
pub fn parse_tiled_tmx(
    text: &str,
    options: Option<&TiledParseOptions>,
    diagnostics: Option<&mut Vec<ImportDiagnostic>>,
) -> Option<TiledMap> {
    let root = parse_xml_document(text);
    let Some(root) = root else {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "tiled.xml-malformed",
            "parseTiledTmx",
            detail_map(&[("path", ImportDiagnosticDetailValue::String("map".to_string()))]),
        );
        return None;
    };
    if root.name != "map" {
        report_import_diagnostic(
            diagnostics,
            ImportDiagnosticSeverity::Reject,
            "tiled.root-unexpected",
            "parseTiledTmx",
            detail_map(&[
                ("actual", ImportDiagnosticDetailValue::String(root.name.clone())),
                ("path", ImportDiagnosticDetailValue::String("map".to_string())),
            ]),
        );
        return None;
    }

    let mut diag_vec: Vec<ImportDiagnostic> = Vec::new();
    let use_diag = diagnostics.is_some();

    if use_diag {
        report_missing_xml_attribute(&root, "height", &mut diag_vec, "parseTiledTmx", "map");
        report_missing_xml_attribute(&root, "tileheight", &mut diag_vec, "parseTiledTmx", "map");
        report_missing_xml_attribute(&root, "tilewidth", &mut diag_vec, "parseTiledTmx", "map");
        report_missing_xml_attribute(&root, "width", &mut diag_vec, "parseTiledTmx", "map");
    }

    let tileset_elements = get_xml_element_children_by_name(&root, "tileset");
    let tilesets: Vec<TiledTilesetRef> = tileset_elements
        .iter()
        .enumerate()
        .map(|(index, element)| {
            let el = element.read().unwrap();
            let path = if use_diag {
                format!("map.tilesets[{}]", index)
            } else {
                String::new()
            };
            build_tiled_tileset_ref_from_xml(&el, &mut diag_vec, use_diag, &path)
        })
        .collect();

    let mut layers: Vec<TiledLayer> = Vec::new();
    for child_ref in &root.children {
        let child = child_ref.read().unwrap();
        let path = if use_diag {
            format!("map.layers[{}]", layers.len())
        } else {
            String::new()
        };
        let layer = build_tiled_layer_from_xml(&child, options, &mut diag_vec, use_diag, &path);
        if let Some(layer) = layer {
            layers.push(layer);
        }
    }

    let background = get_xml_element_attribute(&root, "backgroundcolor");
    let hex_side = get_xml_element_attribute(&root, "hexsidelength");

    let map = TiledMap {
        background_color: background.and_then(|b| parse_tiled_color(b)),
        height: attr_number(&root, "height", 0.0) as i32,
        infinite: attr_bool(&root, "infinite", false),
        layers,
        orientation: as_orientation(get_xml_element_attribute(&root, "orientation")),
        properties: build_tiled_properties_from_xml(&root),
        render_order: as_render_order(get_xml_element_attribute(&root, "renderorder")),
        tile_height: attr_number(&root, "tileheight", 0.0) as i32,
        tile_width: attr_number(&root, "tilewidth", 0.0) as i32,
        hex_side_length: hex_side.map(|h| h.parse::<f64>().unwrap_or(0.0) as i32),
        stagger_axis: as_stagger_axis(get_xml_element_attribute(&root, "staggeraxis")),
        stagger_index: as_stagger_index(get_xml_element_attribute(&root, "staggerindex")),
        tiled_version: get_xml_element_attribute(&root, "tiledversion").map(|s| s.to_string()),
        tilesets,
        version: attr_string(&root, "version", "1.0"),
        width: attr_number(&root, "width", 0.0) as i32,
    };

    if let Some(diagnostics) = diagnostics {
        diagnostics.extend(diag_vec);
    }

    return Some(map);
}

fn report_missing_required_field(
    diagnostics: &mut Vec<ImportDiagnostic>,
    origin: &str,
    path: &str,
    field: Option<&str>,
) {
    let full_path = match field {
        Some(f) => format!("{}.{}", path, f),
        None => path.to_string(),
    };
    report_import_diagnostic(
        Some(diagnostics),
        ImportDiagnosticSeverity::Recover,
        "tiled.required-field-missing",
        origin,
        detail_map(&[("path", ImportDiagnosticDetailValue::String(full_path))]),
    );
}

fn report_missing_xml_attribute(
    element: &XmlElement,
    name: &str,
    diagnostics: &mut Vec<ImportDiagnostic>,
    origin: &str,
    path: &str,
) {
    if get_xml_element_attribute(element, name).is_some() {
        return;
    }
    report_missing_required_field(diagnostics, origin, path, Some(name));
}
