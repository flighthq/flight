import type {
  TiledLayer,
  TiledMap,
  TiledObject,
  TiledProperty,
  TiledTileset,
  TiledTilesetRef,
  TiledTilesetTile,
} from '@flighthq/types';

import { formatTiledColor } from './tiledColor';

// Re-emits a `TiledMap` as TMX XML, lossless for the modeled fields so that
// `parseTiledTmx(formatTiledTmx(map))` reproduces `map`. Tile layers are written as CSV `<data>`
// (the raw GIDs, flip bits intact). Fields the document does not model — Tiled editor chrome, wang
// sets, per-map render settings beyond orientation/renderorder — are not emitted.
export function formatTiledTmx(map: Readonly<TiledMap>): string {
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];

  let open = `<map${attr('version', map.version)}`;
  if (map.tiledVersion !== null) open += attr('tiledversion', map.tiledVersion);
  open += attr('orientation', map.orientation);
  open += attr('renderorder', map.renderOrder);
  open += attr('width', map.width) + attr('height', map.height);
  open += attr('tilewidth', map.tileWidth) + attr('tileheight', map.tileHeight);
  open += attr('infinite', map.infinite ? 1 : 0);
  if (map.backgroundColor !== null) open += attr('backgroundcolor', formatTiledColor(map.backgroundColor));
  lines.push(`${open}>`);

  for (const ref of map.tilesets) writeTilesetRef(lines, ref);
  for (const layer of map.layers) writeLayer(lines, layer);
  writeProperties(lines, map.properties);

  lines.push('</map>');
  return lines.join('\n');
}

function attr(name: string, value: string | number): string {
  return ` ${name}="${escapeXml(String(value))}"`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatLayerBaseAttrs(layer: Readonly<TiledLayer>): string {
  let out = attr('id', layer.id) + attr('name', layer.name);
  if (layer.opacity !== 1) out += attr('opacity', layer.opacity);
  if (!layer.visible) out += attr('visible', 0);
  if (layer.offsetX !== 0) out += attr('offsetx', layer.offsetX);
  if (layer.offsetY !== 0) out += attr('offsety', layer.offsetY);
  return out;
}

function formatPoints(points: readonly { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

function writeLayer(lines: string[], layer: Readonly<TiledLayer>): void {
  const base = formatLayerBaseAttrs(layer);
  if (layer.type === 'tilelayer') {
    lines.push(`<layer${base}${attr('width', layer.width)}${attr('height', layer.height)}>`);
    lines.push('<data encoding="csv">');
    lines.push(Array.from(layer.data).join(','));
    lines.push('</data>');
    lines.push('</layer>');
    return;
  }
  if (layer.type === 'objectgroup') {
    lines.push(`<objectgroup${base}>`);
    for (const object of layer.objects) writeObject(lines, object);
    writeProperties(lines, layer.properties);
    lines.push('</objectgroup>');
    return;
  }
  if (layer.type === 'imagelayer') {
    lines.push(`<imagelayer${base}>`);
    lines.push(`<image${attr('source', layer.image)}/>`);
    writeProperties(lines, layer.properties);
    lines.push('</imagelayer>');
    return;
  }
  lines.push(`<group${base}>`);
  for (const child of layer.layers) writeLayer(lines, child);
  writeProperties(lines, layer.properties);
  lines.push('</group>');
}

function writeObject(lines: string[], object: Readonly<TiledObject>): void {
  let open = `<object${attr('id', object.id)}`;
  if (object.name !== '') open += attr('name', object.name);
  if (object.type !== '') open += attr('type', object.type);
  if (object.gid !== null) open += attr('gid', object.gid);
  open += attr('x', object.x) + attr('y', object.y);
  if (object.width !== 0) open += attr('width', object.width);
  if (object.height !== 0) open += attr('height', object.height);

  const hasBody =
    object.point ||
    object.ellipse ||
    object.polygon !== null ||
    object.polyline !== null ||
    object.properties.length > 0;
  if (!hasBody) {
    lines.push(`${open}/>`);
    return;
  }
  lines.push(`${open}>`);
  if (object.point) lines.push('<point/>');
  if (object.ellipse) lines.push('<ellipse/>');
  if (object.polygon !== null) lines.push(`<polygon${attr('points', formatPoints(object.polygon))}/>`);
  if (object.polyline !== null) lines.push(`<polyline${attr('points', formatPoints(object.polyline))}/>`);
  writeProperties(lines, object.properties);
  lines.push('</object>');
}

function writeProperties(lines: string[], properties: readonly TiledProperty[]): void {
  if (properties.length === 0) return;
  lines.push('<properties>');
  for (const property of properties) {
    let out = `<property${attr('name', property.name)}`;
    if (property.type !== 'string') out += attr('type', property.type);
    out += attr('value', String(property.value));
    lines.push(`${out}/>`);
  }
  lines.push('</properties>');
}

function writeTileset(lines: string[], tileset: Readonly<TiledTileset>, firstGid: number): void {
  let open = `<tileset${attr('firstgid', firstGid)}${attr('name', tileset.name)}`;
  open += attr('tilewidth', tileset.tileWidth) + attr('tileheight', tileset.tileHeight);
  open += attr('tilecount', tileset.tileCount) + attr('columns', tileset.columns);
  if (tileset.margin !== 0) open += attr('margin', tileset.margin);
  if (tileset.spacing !== 0) open += attr('spacing', tileset.spacing);
  lines.push(`${open}>`);
  if (tileset.image !== null) {
    lines.push(
      `<image${attr('source', tileset.image)}${attr('width', tileset.imageWidth)}${attr('height', tileset.imageHeight)}/>`,
    );
  }
  for (const tile of tileset.tiles) writeTilesetTile(lines, tile);
  writeProperties(lines, tileset.properties);
  lines.push('</tileset>');
}

function writeTilesetRef(lines: string[], ref: Readonly<TiledTilesetRef>): void {
  if (ref.source !== null) {
    lines.push(`<tileset${attr('firstgid', ref.firstGid)}${attr('source', ref.source)}/>`);
    return;
  }
  if (ref.tileset !== null) writeTileset(lines, ref.tileset, ref.firstGid);
}

function writeTilesetTile(lines: string[], tile: Readonly<TiledTilesetTile>): void {
  let open = `<tile${attr('id', tile.id)}`;
  if (tile.type !== '') open += attr('type', tile.type);
  const hasBody = tile.image !== null || tile.animation !== null || tile.objects !== null || tile.properties.length > 0;
  if (!hasBody) {
    lines.push(`${open}/>`);
    return;
  }
  lines.push(`${open}>`);
  if (tile.image !== null) lines.push(`<image${attr('source', tile.image)}/>`);
  if (tile.animation !== null) {
    lines.push('<animation>');
    for (const frame of tile.animation)
      lines.push(`<frame${attr('tileid', frame.tileId)}${attr('duration', frame.duration)}/>`);
    lines.push('</animation>');
  }
  if (tile.objects !== null) {
    lines.push('<objectgroup>');
    for (const object of tile.objects) writeObject(lines, object);
    lines.push('</objectgroup>');
  }
  writeProperties(lines, tile.properties);
  lines.push('</tile>');
}
