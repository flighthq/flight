//! Host-neutral Rust implementation of the `animatedsprite` example.
//!
//! The TypeScript example loads `assets/tileset.png`, builds a spritesheet with
//! four looping animations (snail, blob, owl, bug), and plays them as four
//! animated sprites laid out in a row on an 800x400 stage.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_displayobject::{
    DisplayObjectArena, add_display_object_child, set_display_object_scale_x,
    set_display_object_scale_y, set_display_object_x, set_display_object_y,
};
use flighthq_image::load_image_resource_from_url;
use flighthq_sprite::{create_sprite, set_sprite_atlas, set_sprite_id};
use flighthq_spritesheet::spritesheet::{
    CreateSpritesheetOptions, create_spritesheet, get_spritesheet_animation,
};
use flighthq_spritesheet::spritesheet_animation::{
    CreateSpritesheetAnimationOptions, create_spritesheet_animation,
};
use flighthq_spritesheet::spritesheet_frame::{
    CreateSpritesheetFrameOptions, create_spritesheet_frame,
};
use flighthq_spritesheet::spritesheet_player::{
    CreateSpritesheetPlayerOptions, create_spritesheet_player, get_spritesheet_player_frame,
    play_spritesheet_animation, update_spritesheet_player,
};
use flighthq_textureatlas::{add_texture_atlas_region, create_texture_atlas};
use std::collections::HashMap;

const STAGE_WIDTH: f32 = 800.0;
const STAGE_HEIGHT: f32 = 400.0;
const SCALE: f32 = 4.0;
const TILE_SIZE: f32 = 32.0;
const SPRITE_COUNT: usize = 4;
const FRAME_DURATION: f32 = 150.0;

const ANIMATIONS: &[(&str, u32)] = &[("snail", 1), ("blob", 4), ("owl", 5), ("bug", 6)];

pub struct AnimatedSpriteApiScene {
    pub arena: DisplayObjectArena,
    pub root: flighthq_node::NodeId,
    pub sprites: Vec<flighthq_node::NodeId>,
    pub sheet: flighthq_spritesheet::Spritesheet,
    pub players: Vec<flighthq_spritesheet::SpritesheetPlayer>,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene().expect("animatedsprite API scene");
    ExampleScene::new("animatedsprite", "Animated sprite")
        .with_size(STAGE_WIDTH as u32, STAGE_HEIGHT as u32)
        .with_primitives(sprite_placeholders())
}

pub fn create_api_scene() -> Result<AnimatedSpriteApiScene, Box<dyn std::error::Error + Send + Sync>>
{
    let source = load_image_resource_from_url(&asset_path("assets/tileset.png"))?;
    let mut atlas = create_texture_atlas(Some(source), Vec::new());
    let mut frames = Vec::new();
    let mut animations = HashMap::new();

    for &(name, row) in ANIMATIONS {
        let mut frame_indices = Vec::new();
        for col in 0..4 {
            let atlas_id = atlas.regions.len() as u32;
            add_texture_atlas_region(
                &mut atlas,
                col as f32 * TILE_SIZE,
                row as f32 * TILE_SIZE,
                TILE_SIZE,
                TILE_SIZE,
                None,
                None,
                None,
            );
            let frame_index = frames.len() as u32;
            frames.push(create_spritesheet_frame(CreateSpritesheetFrameOptions {
                id: Some(atlas_id),
                ..Default::default()
            }));
            frame_indices.push(frame_index);
        }
        animations.insert(
            name.to_string(),
            create_spritesheet_animation(CreateSpritesheetAnimationOptions {
                frames: Some(frame_indices),
                frame_duration: Some(FRAME_DURATION),
                loop_: Some(true),
                ..Default::default()
            }),
        );
    }

    let sheet = create_spritesheet(CreateSpritesheetOptions {
        atlas: Some(atlas.clone()),
        animations: Some(animations),
        frames: Some(frames),
    });

    let mut arena = DisplayObjectArena::default();
    let root = create_sprite(&mut arena);
    set_display_object_scale_x(&mut arena, root, SCALE);
    set_display_object_scale_y(&mut arena, root, SCALE);

    let sprite_size = TILE_SIZE * SCALE;
    let total_width = ANIMATIONS.len() as f32 * sprite_size;
    let gap = (STAGE_WIDTH - total_width) / (ANIMATIONS.len() as f32 + 1.0);
    let y_local = (STAGE_HEIGHT - sprite_size) / 2.0 / SCALE;

    let mut sprites = Vec::new();
    for (index, _) in ANIMATIONS.iter().enumerate() {
        let sprite = create_sprite(&mut arena);
        set_sprite_atlas(&mut arena, sprite, Some(atlas.clone()));
        set_display_object_x(
            &mut arena,
            sprite,
            (gap + index as f32 * (sprite_size + gap)) / SCALE,
        );
        set_display_object_y(&mut arena, sprite, y_local);
        add_display_object_child(&mut arena, root, sprite);
        sprites.push(sprite);
    }

    let mut players = Vec::new();
    for (index, &(name, _)) in ANIMATIONS.iter().enumerate() {
        let mut player = create_spritesheet_player(CreateSpritesheetPlayerOptions::default());
        play_spritesheet_animation(&mut player, get_spritesheet_animation(&sheet, name), true);
        if update_spritesheet_player(&mut player, FRAME_DURATION)
            && let Some(frame) = get_spritesheet_player_frame(&player, &sheet)
        {
            set_sprite_id(&mut arena, sprites[index], frame.id);
        }
        players.push(player);
    }

    Ok(AnimatedSpriteApiScene {
        arena,
        root,
        sprites,
        sheet,
        players,
    })
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/animatedsprite/public")
        .join(path)
        .to_string_lossy()
        .into_owned()
}

/// Mirrors the TS layout math: four sprites of `TILE_SIZE * SCALE` screen size,
/// evenly gapped across the stage width and vertically centered.
fn sprite_placeholders() -> Vec<ExamplePrimitive> {
    let sprite_size = TILE_SIZE * SCALE;
    let total_width = SPRITE_COUNT as f32 * sprite_size;
    let gap = (STAGE_WIDTH - total_width) / (SPRITE_COUNT as f32 + 1.0);
    let y = (STAGE_HEIGHT - sprite_size) / 2.0;
    (0..SPRITE_COUNT)
        .map(|index| ExamplePrimitive::Rectangle {
            x: gap + index as f32 * (sprite_size + gap),
            y,
            width: sprite_size,
            height: sprite_size,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use flighthq_displayobject::get_display_object_children;
    use flighthq_sprite::get_sprite_id;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "animatedsprite");
    }

    #[test]
    fn lays_out_one_square_per_sprite() {
        assert_eq!(create_scene().primitives.len(), SPRITE_COUNT);
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene().expect("image loads");
        assert_eq!(
            get_display_object_children(&scene.arena, scene.root),
            scene.sprites
        );
        assert_eq!(scene.sheet.frames.len(), SPRITE_COUNT * 4);
        assert_eq!(scene.players.len(), SPRITE_COUNT);
        assert!(
            scene
                .sprites
                .iter()
                .all(|sprite| get_sprite_id(&scene.arena, *sprite) > 0)
        );
    }
}
