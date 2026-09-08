import type {
  TiledLayer,
  TiledMap,
  TiledObject,
  TiledProperty,
  TiledTileset,
  TiledTilesetRef,
  TiledTilesetTile,
} from '@flighthq/types/contract';

import { formatTiledColor } from './tiledColor';

// Re-emits a standalone tileset as a TSJ document. Same body as an embedded tileset, plus the
// `type: 'tileset'` marker a standalone file carries and without the `firstgid` it has no map to be
// positioned in. Pairs with parseTiledTilesetJson.
export function formatTiledTilesetJson(tileset: Readonly<TiledTileset>): string {
  return JSON.stringify({ ...jsonTileset(tileset), type: 'tileset' }, null, 2);
}

// Re-emits a parsed map as a TMJ (Tiled JSON) document, the JSON counterpart of formatTiledTmx. Layer
// data is written as a plain GID array — the uncompressed, unencoded form — because a document the codec
// can re-read without an inflate seam is the useful default, and the encoded forms are a size
// optimisation the caller can apply. Round-trips through parseTiledTmj for every modeled field.
//
// Optional fields are emitted only when they differ from Tiled's default, so a document that declared
// none re-emits without them. That matters more in JSON than in XML: a reader cannot tell an explicit
// `"parallaxx": 1` from an absent one, but a diff of two files can.
export function formatTiledTmj(map: Readonly<TiledMap>): string {
  const out: Record<string, unknown> = {
    compressionlevel: -1,
    height: map.height,
    infinite: map.infinite,
    layers: map.layers.map(jsonLayer),
    nextlayerid: nextLayerId(map.layers),
    nextobjectid: nextObjectId(map.layers),
    orientation: map.orientation,
    renderorder: map.renderOrder,
    tiledversion: map.tiledVersion ?? undefined,
    tileheight: map.tileHeight,
    tilesets: map.tilesets.map(jsonTilesetRef),
    tilewidth: map.tileWidth,
    type: 'map',
    version: map.version,
    width: map.width,
  };
  if (map.backgroundColor !== null) out.backgroundcolor = formatTiledColor(map.backgroundColor);
  if (map.staggerAxis !== null) out.staggeraxis = map.staggerAxis;
  if (map.staggerIndex !== null) out.staggerindex = map.staggerIndex;
  if (map.hexSideLength !== null) out.hexsidelength = map.hexSideLength;
  if (map.properties.length > 0) out.properties = map.properties.map(jsonProperty);
  return JSON.stringify(out, null, 2);
}

function jsonLayer(layer: Readonly<TiledLayer>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: layer.id,
    name: layer.name,
    opacity: layer.opacity,
    type: layer.type,
    visible: layer.visible,
    x: 0,
    y: 0,
  };
  if (layer.offsetX !== 0) out.offsetx = layer.offsetX;
  if (layer.offsetY !== 0) out.offsety = layer.offsetY;
  if (layer.tintColor !== null) out.tintcolor = formatTiledColor(layer.tintColor);
  if (layer.parallaxX !== 1) out.parallaxx = layer.parallaxX;
  if (layer.parallaxY !== 1) out.parallaxy = layer.parallaxY;
  if (layer.class !== '') out.class = layer.class;
  if (layer.properties.length > 0) out.properties = layer.properties.map(jsonProperty);

  if (layer.type === 'tilelayer') {
    out.data = Array.from(layer.data);
    out.height = layer.height;
    out.width = layer.width;
    return out;
  }
  if (layer.type === 'objectgroup') {
    out.objects = layer.objects.map(jsonObject);
    return out;
  }
  if (layer.type === 'imagelayer') {
    out.image = layer.image;
    if (layer.repeatX) out.repeatx = true;
    if (layer.repeatY) out.repeaty = true;
    return out;
  }
  out.layers = layer.layers.map(jsonLayer);
  return out;
}

function jsonObject(object: Readonly<TiledObject>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    height: object.height,
    id: object.id,
    name: object.name,
    rotation: object.rotation,
    type: object.type,
    visible: object.visible,
    width: object.width,
    x: object.x,
    y: object.y,
  };
  if (object.gid !== null) out.gid = object.gid;
  if (object.point) out.point = true;
  if (object.ellipse) out.ellipse = true;
  if (object.polygon !== null) out.polygon = object.polygon.map((point) => ({ x: point.x, y: point.y }));
  if (object.polyline !== null) out.polyline = object.polyline.map((point) => ({ x: point.x, y: point.y }));
  if (object.properties.length > 0) out.properties = object.properties.map(jsonProperty);
  return out;
}

function jsonProperty(property: Readonly<TiledProperty>): Record<string, unknown> {
  return { name: property.name, type: property.type, value: property.value };
}

function jsonTileset(tileset: Readonly<TiledTileset>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    columns: tileset.columns,
    margin: tileset.margin,
    name: tileset.name,
    spacing: tileset.spacing,
    tilecount: tileset.tileCount,
    tileheight: tileset.tileHeight,
    tilewidth: tileset.tileWidth,
  };
  if (tileset.image !== null) {
    out.image = tileset.image;
    out.imageheight = tileset.imageHeight;
    out.imagewidth = tileset.imageWidth;
  }
  if (tileset.tileOffsetX !== 0 || tileset.tileOffsetY !== 0) {
    out.tileoffset = { x: tileset.tileOffsetX, y: tileset.tileOffsetY };
  }
  if (tileset.objectAlignment !== 'unspecified') out.objectalignment = tileset.objectAlignment;
  if (tileset.tiles.length > 0) out.tiles = tileset.tiles.map(jsonTilesetTile);
  if (tileset.properties.length > 0) out.properties = tileset.properties.map(jsonProperty);
  return out;
}

function jsonTilesetRef(ref: Readonly<TiledTilesetRef>): Record<string, unknown> {
  if (ref.source !== null) return { firstgid: ref.firstGid, source: ref.source };
  if (ref.tileset === null) return { firstgid: ref.firstGid };
  return { firstgid: ref.firstGid, ...jsonTileset(ref.tileset) };
}

function jsonTilesetTile(tile: Readonly<TiledTilesetTile>): Record<string, unknown> {
  const out: Record<string, unknown> = { id: tile.id };
  if (tile.type !== '') out.type = tile.type;
  if (tile.image !== null) out.image = tile.image;
  if (tile.animation !== null) {
    out.animation = tile.animation.map((frame) => ({ duration: frame.duration, tileid: frame.tileId }));
  }
  if (tile.objects !== null) {
    out.objectgroup = { draworder: 'index', objects: tile.objects.map(jsonObject), type: 'objectgroup' };
  }
  if (tile.properties.length > 0) out.properties = tile.properties.map(jsonProperty);
  return out;
}

// Tiled writes the next id it would hand out, so a re-emitted document stays editable in Tiled without
// colliding with an existing id. Derived rather than modeled: the DTO carries the ids that exist, and
// one past the maximum is the only value consistent with them.
function nextLayerId(layers: readonly TiledLayer[]): number {
  let max = 0;
  for (const layer of layers) {
    if (layer.id > max) max = layer.id;
    if (layer.type === 'group') max = Math.max(max, nextLayerId(layer.layers) - 1);
  }
  return max + 1;
}

function nextObjectId(layers: readonly TiledLayer[]): number {
  let max = 0;
  for (const layer of layers) {
    if (layer.type === 'objectgroup') {
      for (const object of layer.objects) if (object.id > max) max = object.id;
    }
    if (layer.type === 'group') max = Math.max(max, nextObjectId(layer.layers) - 1);
  }
  return max + 1;
}
