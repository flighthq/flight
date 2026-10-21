//! Tiled global tile ID decoding and tileset ref lookup (TS `tiledGid.ts`).

use crate::types::{TiledGid, TiledMap, TiledTilesetRef};

const FLIP_HORIZONTAL: u32 = 0x8000_0000;
const FLIP_VERTICAL: u32 = 0x4000_0000;
const FLIP_DIAGONAL: u32 = 0x2000_0000;
const TILE_ID_MASK: u32 = 0x1fff_ffff;

pub fn decode_tiled_gid(gid: u32) -> TiledGid {
    return TiledGid {
        flip_diagonal: (gid & FLIP_DIAGONAL) != 0,
        flip_horizontal: (gid & FLIP_HORIZONTAL) != 0,
        flip_vertical: (gid & FLIP_VERTICAL) != 0,
        tile_id: gid & TILE_ID_MASK,
    };
}

pub fn get_tiled_tileset_ref_for_gid<'a>(
    map: &'a TiledMap,
    tile_id: u32,
) -> Option<&'a TiledTilesetRef> {
    if tile_id == 0 {
        return None;
    }
    let mut best: Option<&TiledTilesetRef> = None;
    for tileset_ref in &map.tilesets {
        if tileset_ref.first_gid <= tile_id as i32
            && (best.is_none() || tileset_ref.first_gid > best.unwrap().first_gid)
        {
            best = Some(tileset_ref);
        }
    }
    return best;
}
