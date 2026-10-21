//! Re-emits parsed Tiled documents as TMX/TSX XML (TS `tiledTmxFormat.ts`).

use crate::tiled_color::format_tiled_color;
use crate::types::*;

fn attr(name: &str, value: &str) -> String {
    return format!(" {}=\"{}\"", name, escape_xml(value));
}

fn escape_xml(value: &str) -> String {
    return value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;");
}

fn format_layer_base_attrs(layer: &TiledLayer) -> String {
    let base = layer.base();
    let mut out = attr("id", &base.id.to_string()) + &attr("name", &base.name);
    if base.opacity != 1.0 {
        out += &attr("opacity", &base.opacity.to_string());
    }
    if !base.visible {
        out += &attr("visible", "0");
    }
    if base.offset_x != 0.0 {
        out += &attr("offsetx", &base.offset_x.to_string());
    }
    if base.offset_y != 0.0 {
        out += &attr("offsety", &base.offset_y.to_string());
    }
    if let Some(tint) = base.tint_color {
        out += &attr("tintcolor", &format_tiled_color(tint));
    }
    if base.parallax_x != 1.0 {
        out += &attr("parallaxx", &base.parallax_x.to_string());
    }
    if base.parallax_y != 1.0 {
        out += &attr("parallaxy", &base.parallax_y.to_string());
    }
    if !base.class.is_empty() {
        out += &attr("class", &base.class);
    }
    return out;
}

fn format_points(points: &[flight_geometry::Vector2]) -> String {
    return points
        .iter()
        .map(|p| format!("{},{}", p.x, p.y))
        .collect::<Vec<_>>()
        .join(" ");
}

pub fn format_tiled_tileset(tileset: &TiledTileset) -> String {
    let mut lines: Vec<String> = vec!["<?xml version=\"1.0\" encoding=\"UTF-8\"?>".to_string()];
    write_tileset(&mut lines, tileset, None);
    return lines.join("\n");
}

pub fn format_tiled_tmx(map: &TiledMap) -> String {
    let mut lines: Vec<String> = vec!["<?xml version=\"1.0\" encoding=\"UTF-8\"?>".to_string()];

    let mut open = format!("<map{}", attr("version", &map.version));
    if let Some(ref tv) = map.tiled_version {
        open += &attr("tiledversion", tv);
    }
    open += &attr("orientation", map.orientation.as_str());
    open += &attr("renderorder", map.render_order.as_str());
    open += &attr("width", &map.width.to_string());
    open += &attr("height", &map.height.to_string());
    open += &attr("tilewidth", &map.tile_width.to_string());
    open += &attr("tileheight", &map.tile_height.to_string());
    open += &attr("infinite", if map.infinite { "1" } else { "0" });
    if let Some(bg) = map.background_color {
        open += &attr("backgroundcolor", &format_tiled_color(bg));
    }
    if let Some(ref sa) = map.stagger_axis {
        open += &attr("staggeraxis", sa.as_str());
    }
    if let Some(ref si) = map.stagger_index {
        open += &attr("staggerindex", si.as_str());
    }
    if let Some(hex) = map.hex_side_length {
        open += &attr("hexsidelength", &hex.to_string());
    }
    lines.push(format!("{}>", open));

    for ts_ref in &map.tilesets {
        write_tileset_ref(&mut lines, ts_ref);
    }
    for layer in &map.layers {
        write_layer(&mut lines, layer);
    }
    write_properties(&mut lines, &map.properties);

    lines.push("</map>".to_string());
    return lines.join("\n");
}

fn write_layer(lines: &mut Vec<String>, layer: &TiledLayer) {
    let base_attrs = format_layer_base_attrs(layer);
    match layer {
        TiledLayer::TileLayer(d) => {
            lines.push(format!(
                "<layer{}{}{}>",
                base_attrs,
                attr("width", &d.width.to_string()),
                attr("height", &d.height.to_string()),
            ));
            lines.push("<data encoding=\"csv\">".to_string());
            let csv: String = d
                .data
                .iter()
                .map(|g| g.to_string())
                .collect::<Vec<_>>()
                .join(",");
            lines.push(csv);
            lines.push("</data>".to_string());
            write_properties(lines, &d.base.properties);
            lines.push("</layer>".to_string());
        }
        TiledLayer::ObjectGroup(d) => {
            lines.push(format!("<objectgroup{}>", base_attrs));
            for object in &d.objects {
                write_object(lines, object);
            }
            write_properties(lines, &d.base.properties);
            lines.push("</objectgroup>".to_string());
        }
        TiledLayer::ImageLayer(d) => {
            let mut image_open = format!("<imagelayer{}", base_attrs);
            if d.repeat_x {
                image_open += &attr("repeatx", "1");
            }
            if d.repeat_y {
                image_open += &attr("repeaty", "1");
            }
            lines.push(format!("{}>", image_open));
            lines.push(format!("<image{}/>", attr("source", &d.image)));
            write_properties(lines, &d.base.properties);
            lines.push("</imagelayer>".to_string());
        }
        TiledLayer::Group(d) => {
            lines.push(format!("<group{}>", base_attrs));
            for child in &d.layers {
                write_layer(lines, child);
            }
            write_properties(lines, &d.base.properties);
            lines.push("</group>".to_string());
        }
    }
}

fn write_object(lines: &mut Vec<String>, object: &TiledObject) {
    let mut open = format!("<object{}", attr("id", &object.id.to_string()));
    if !object.name.is_empty() {
        open += &attr("name", &object.name);
    }
    if !object.object_type.is_empty() {
        open += &attr("type", &object.object_type);
    }
    if let Some(gid) = object.gid {
        open += &attr("gid", &gid.to_string());
    }
    open += &attr("x", &object.x.to_string());
    open += &attr("y", &object.y.to_string());
    if object.width != 0.0 {
        open += &attr("width", &object.width.to_string());
    }
    if object.height != 0.0 {
        open += &attr("height", &object.height.to_string());
    }
    if object.rotation != 0.0 {
        open += &attr("rotation", &object.rotation.to_string());
    }
    if !object.visible {
        open += &attr("visible", "0");
    }

    let has_body = object.point
        || object.ellipse
        || object.polygon.is_some()
        || object.polyline.is_some()
        || !object.properties.is_empty();
    if !has_body {
        lines.push(format!("{}/>", open));
        return;
    }
    lines.push(format!("{}>", open));
    if object.point {
        lines.push("<point/>".to_string());
    }
    if object.ellipse {
        lines.push("<ellipse/>".to_string());
    }
    if let Some(ref polygon) = object.polygon {
        lines.push(format!(
            "<polygon{}/>",
            attr("points", &format_points(polygon))
        ));
    }
    if let Some(ref polyline) = object.polyline {
        lines.push(format!(
            "<polyline{}/>",
            attr("points", &format_points(polyline))
        ));
    }
    write_properties(lines, &object.properties);
    lines.push("</object>".to_string());
}

fn write_properties(lines: &mut Vec<String>, properties: &[TiledProperty]) {
    if properties.is_empty() {
        return;
    }
    lines.push("<properties>".to_string());
    for property in properties {
        let mut out = format!("<property{}", attr("name", &property.name));
        if property.property_type != TiledPropertyType::String {
            out += &attr("type", property.property_type.as_str());
        }
        let value_str = match &property.value {
            TiledPropertyValue::String(s) => s.clone(),
            TiledPropertyValue::Number(n) => n.to_string(),
            TiledPropertyValue::Bool(b) => b.to_string(),
        };
        out += &attr("value", &value_str);
        lines.push(format!("{}/>", out));
    }
    lines.push("</properties>".to_string());
}

fn write_tileset(lines: &mut Vec<String>, tileset: &TiledTileset, first_gid: Option<i32>) {
    let mut open = "<tileset".to_string();
    if let Some(gid) = first_gid {
        open += &attr("firstgid", &gid.to_string());
    }
    open += &attr("name", &tileset.name);
    open += &attr("tilewidth", &tileset.tile_width.to_string());
    open += &attr("tileheight", &tileset.tile_height.to_string());
    open += &attr("tilecount", &tileset.tile_count.to_string());
    open += &attr("columns", &tileset.columns.to_string());
    if tileset.margin != 0 {
        open += &attr("margin", &tileset.margin.to_string());
    }
    if tileset.spacing != 0 {
        open += &attr("spacing", &tileset.spacing.to_string());
    }
    if tileset.object_alignment != TiledObjectAlignment::Unspecified {
        open += &attr("objectalignment", tileset.object_alignment.as_str());
    }
    lines.push(format!("{}>", open));
    if tileset.tile_offset_x != 0 || tileset.tile_offset_y != 0 {
        lines.push(format!(
            "<tileoffset{}{}/>",
            attr("x", &tileset.tile_offset_x.to_string()),
            attr("y", &tileset.tile_offset_y.to_string()),
        ));
    }
    if let Some(ref img) = tileset.image {
        lines.push(format!(
            "<image{}{}{}/>",
            attr("source", img),
            attr("width", &tileset.image_width.to_string()),
            attr("height", &tileset.image_height.to_string()),
        ));
    }
    for tile in &tileset.tiles {
        write_tileset_tile(lines, tile);
    }
    write_properties(lines, &tileset.properties);
    lines.push("</tileset>".to_string());
}

fn write_tileset_ref(lines: &mut Vec<String>, ts_ref: &TiledTilesetRef) {
    if let Some(ref source) = ts_ref.source {
        lines.push(format!(
            "<tileset{}{}/>",
            attr("firstgid", &ts_ref.first_gid.to_string()),
            attr("source", source),
        ));
        return;
    }
    if let Some(ref tileset) = ts_ref.tileset {
        write_tileset(lines, tileset, Some(ts_ref.first_gid));
    }
}

fn write_tileset_tile(lines: &mut Vec<String>, tile: &TiledTilesetTile) {
    let mut open = format!("<tile{}", attr("id", &tile.id.to_string()));
    if !tile.tile_type.is_empty() {
        open += &attr("type", &tile.tile_type);
    }
    let has_body = tile.image.is_some()
        || tile.animation.is_some()
        || tile.objects.is_some()
        || !tile.properties.is_empty();
    if !has_body {
        lines.push(format!("{}/>", open));
        return;
    }
    lines.push(format!("{}>", open));
    if let Some(ref img) = tile.image {
        lines.push(format!("<image{}/>", attr("source", img)));
    }
    if let Some(ref animation) = tile.animation {
        lines.push("<animation>".to_string());
        for frame in animation {
            lines.push(format!(
                "<frame{}{}/>",
                attr("tileid", &frame.tile_id.to_string()),
                attr("duration", &frame.duration.to_string()),
            ));
        }
        lines.push("</animation>".to_string());
    }
    if let Some(ref objects) = tile.objects {
        lines.push("<objectgroup>".to_string());
        for object in objects {
            write_object(lines, object);
        }
        lines.push("</objectgroup>".to_string());
    }
    write_properties(lines, &tile.properties);
    lines.push("</tile>".to_string());
}
