use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use example_common::{ExampleScene, ExampleSceneBehavior};
use flighthq_displayobject::{
    DisplayObjectArena, add_display_object_child, create_bitmap, create_display_object,
    create_stage, get_bitmap_image, get_display_object_alpha, get_display_object_blend_mode,
    get_display_object_children, get_display_object_kind, get_display_object_local_bounds_revision,
    get_display_object_local_content_revision, get_display_object_parent,
    get_display_object_rotation, get_display_object_scale_x, get_display_object_scale_y,
    get_display_object_visible, get_display_object_x, get_display_object_y,
    invalidate_display_object_local_content,
    prepare_display_object_render as prepare_display_object_bounds, set_bitmap_image,
    set_display_object_scale_x, set_display_object_scale_y, set_display_object_x,
    set_display_object_y, set_stage_color, set_stage_size,
};
use flighthq_displayobject_wgpu::{
    WgpuBitmapTexture, WgpuQuadBatchSource, WgpuSpriteSource, WgpuTilemapSource,
    render_wgpu_display_object,
};
use flighthq_host_winit::{InputManager, WgpuRenderState, WinitAppConfig, run_winit_app};
use flighthq_image::load_image_resource_from_url;
use flighthq_render::{
    RenderStateStore, create_render_state, get_render_proxy_2d, get_render_state,
    prepare_display_object_render,
};
use flighthq_signals::{SignalConnectOptions, connect_signal};
use flighthq_sprite::{
    create_quad_batch, create_sprite, create_tilemap, get_quad_batch_atlas,
    get_quad_batch_instance_count, get_quad_batch_transform_stride, get_sprite_atlas,
    get_sprite_region, get_tilemap_columns, get_tilemap_rows, get_tilemap_tile,
    get_tilemap_tileset, iterate_quad_batch_instances, resize_quad_batch, set_quad_batch_atlas,
    set_quad_batch_instance, set_sprite_atlas, set_sprite_id, set_tilemap_tile,
    set_tilemap_tileset,
};
use flighthq_textureatlas::{add_texture_atlas_region, create_texture_atlas};
use flighthq_tileset::load_tileset_from_url;
use flighthq_types::QuadTransformType;
use flighthq_types::RenderProxy2D;
use flighthq_types::display::display_object_kind;
use flighthq_types::geometry::Matrix;
use flighthq_types::input::InputPointerData;

const BUNNY_STAGE_ID: u64 = 1;
const BUNNY_BATCH_ID: u64 = 2;

fn main() {
    let requested = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "drawingshapes".to_string());
    let scene = scene_for(&requested).unwrap_or_else(|| {
        let available = EXAMPLE_IDS.join(", ");
        panic!("unknown example '{requested}'. Available examples: {available}");
    });
    match scene.id {
        example_bunnymark::ID => run_bunnymark(scene),
        "displayingabitmap" => run_displaying_bitmap(scene),
        "renderview" => run_render_view(scene),
        "usingtilemap" => run_using_tilemap(scene),
        unsupported => {
            panic!("native example '{unsupported}' is not wired to the matching Rust API path yet")
        }
    }
}

fn run_bunnymark(scene: ExampleScene) {
    let ExampleSceneBehavior::BunnyMark {
        image_path,
        initial_count,
        add_count,
        gravity,
    } = scene.behavior
    else {
        panic!("bunnymark scene must use BunnyMark behavior");
    };
    let mut state = BunnyMarkNativeState::new(&scene, image_path, initial_count);
    let adding = Arc::new(AtomicBool::new(false));

    let mut config = WinitAppConfig {
        title: format!("Flight Examples - {}", scene.title),
        width: scene.width,
        height: scene.height,
        ..Default::default()
    };
    config.render_options.background_color = Some(scene.background);

    let setup_adding = Arc::clone(&adding);
    let mut setup = move |_state: &mut WgpuRenderState, input: &mut InputManager| {
        let down_flag = Arc::clone(&setup_adding);
        let down = connect_signal(
            &input.signals.on_pointer_down,
            Arc::new(move |_event: &InputPointerData| {
                down_flag.store(true, Ordering::Relaxed);
            }),
            SignalConnectOptions::default(),
        );
        let up_flag = Arc::clone(&setup_adding);
        let up = connect_signal(
            &input.signals.on_pointer_up,
            Arc::new(move |_event: &InputPointerData| {
                up_flag.store(false, Ordering::Relaxed);
            }),
            SignalConnectOptions::default(),
        );
        std::mem::forget(down);
        std::mem::forget(up);
        BUNNY_STAGE_ID
    };
    let update_adding = Arc::clone(&adding);
    let mut update =
        move |_dt: f32, render_state: &mut WgpuRenderState, _input: &mut InputManager| {
            if update_adding.load(Ordering::Relaxed) {
                state.add_bunnies(add_count);
            }
            state.update(gravity);
            state.draw(render_state);
        };
    run_winit_app(config, &mut setup, &mut update);
}

fn run_displaying_bitmap(scene: ExampleScene) {
    let mut state = NativeDisplayScene::new(scene.width, scene.height, scene.background);
    let image_url = resolve_native_asset_path_for("bunnymark", "assets/wabbit_alpha.png");
    let image = load_image_resource_from_url(&image_url)
        .unwrap_or_else(|err| panic!("load displayingabitmap image '{image_url}': {err}"));
    let x = (scene.width as f32 - image.width as f32) / 2.0;
    let y = (scene.height as f32 - image.height as f32) / 2.0;

    let bitmap = create_bitmap(&mut state.arena);
    set_bitmap_image(&mut state.arena, bitmap, Some(image));
    set_display_object_x(&mut state.arena, bitmap, x);
    set_display_object_y(&mut state.arena, bitmap, y);
    add_display_object_child(&mut state.arena, state.root, bitmap);
    state.refresh_ids();
    run_native_display_scene(scene, state, false);
}

fn run_render_view(scene: ExampleScene) {
    const TILE_SIZE: f32 = 32.0;
    const SCALE: f32 = 4.0;

    let mut state = NativeDisplayScene::new(scene.width, scene.height, scene.background);
    let image_url = resolve_native_asset_path_for("renderview", "assets/tileset.png");
    let image = load_image_resource_from_url(&image_url)
        .unwrap_or_else(|err| panic!("load renderview image '{image_url}': {err}"));
    let mut atlas = create_texture_atlas(Some(image), Vec::new());
    add_texture_atlas_region(&mut atlas, 0.0, 0.0, TILE_SIZE, TILE_SIZE, None, None, None);

    let sprite = create_sprite(&mut state.arena);
    set_sprite_atlas(&mut state.arena, sprite, Some(atlas));
    set_sprite_id(&mut state.arena, sprite, 0);
    set_display_object_scale_x(&mut state.arena, sprite, SCALE);
    set_display_object_scale_y(&mut state.arena, sprite, SCALE);
    set_display_object_x(
        &mut state.arena,
        sprite,
        (scene.width as f32 - TILE_SIZE * SCALE) / 2.0,
    );
    set_display_object_y(
        &mut state.arena,
        sprite,
        (scene.height as f32 - TILE_SIZE * SCALE) / 2.0,
    );
    add_display_object_child(&mut state.arena, state.root, sprite);
    state.refresh_ids();
    run_native_display_scene(scene, state, true);
}

fn run_using_tilemap(scene: ExampleScene) {
    const TILE_W: f32 = 32.0;
    const TILE_H: f32 = 32.0;
    const COLS: u32 = 8;
    const ROWS: u32 = 8;
    const SCALE: f32 = 2.0;
    const PAD: f32 = 40.0;

    let mut state = NativeDisplayScene::new(scene.width, scene.height, scene.background);
    let tileset_url = resolve_native_asset_path_for("usingtilemap", "assets/tileset.png");
    let tileset = load_tileset_from_url(&tileset_url, TILE_W, TILE_H)
        .unwrap_or_else(|err| panic!("load usingtilemap tileset '{tileset_url}': {err}"));
    let stride = tileset.columns;

    let tilemap = create_tilemap(&mut state.arena);
    flighthq_sprite::resize_tilemap(&mut state.arena, tilemap, COLS, ROWS);
    set_tilemap_tileset(&mut state.arena, tilemap, Some(tileset));
    set_display_object_scale_x(&mut state.arena, tilemap, SCALE);
    set_display_object_scale_y(&mut state.arena, tilemap, SCALE);
    set_display_object_x(&mut state.arena, tilemap, PAD);
    set_display_object_y(&mut state.arena, tilemap, PAD);
    for row in 0..ROWS {
        for column in 0..COLS {
            set_tilemap_tile(
                &mut state.arena,
                tilemap,
                column,
                row,
                (row * stride) as i16,
            );
        }
    }
    add_display_object_child(&mut state.arena, state.root, tilemap);
    state.refresh_ids();
    run_native_display_scene(scene, state, true);
}

fn run_native_display_scene(
    scene: ExampleScene,
    mut display_scene: NativeDisplayScene,
    nearest_neighbor: bool,
) {
    let mut config = WinitAppConfig {
        title: format!("Flight Examples - {}", scene.title),
        width: scene.width,
        height: scene.height,
        ..Default::default()
    };
    config.render_options.background_color = Some(scene.background);
    config.render_options.image_smoothing_enabled = !nearest_neighbor;

    let root_source_id = display_scene.root_source_id();
    let mut setup = move |_state: &mut WgpuRenderState, _input: &mut InputManager| root_source_id;
    let mut update = move |_dt: f32, state: &mut WgpuRenderState, _input: &mut InputManager| {
        display_scene.draw(state);
    };
    run_winit_app(config, &mut setup, &mut update);
}

struct NativeDisplayScene {
    arena: DisplayObjectArena,
    root: flighthq_node::NodeId,
    source_ids: HashMap<flighthq_node::NodeId, u64>,
    nodes: HashMap<u64, flighthq_node::NodeId>,
}

impl NativeDisplayScene {
    fn new(width: u32, height: u32, background: u32) -> Self {
        let mut arena = DisplayObjectArena::default();
        let root = create_display_object(&mut arena);
        set_display_object_scale_x(&mut arena, root, 1.0);
        set_display_object_scale_y(&mut arena, root, 1.0);

        let stage = create_stage(&mut arena);
        set_stage_size(&mut arena, stage, width as f32, height as f32);
        set_stage_color(&mut arena, stage, Some(background));
        add_display_object_child(&mut arena, stage, root);

        let mut scene = Self {
            arena,
            root,
            source_ids: HashMap::new(),
            nodes: HashMap::new(),
        };
        scene.refresh_ids();
        scene
    }

    fn refresh_ids(&mut self) {
        self.source_ids.clear();
        self.nodes.clear();
        let mut next_id = 1;
        for node in self.arena.keys() {
            self.source_ids.insert(node, next_id);
            self.nodes.insert(next_id, node);
            next_id += 1;
        }
    }

    fn root_source_id(&self) -> u64 {
        self.id_for(self.root)
    }

    fn draw(&mut self, state: &mut WgpuRenderState) {
        prepare_display_object_bounds(&mut self.arena, self.root);
        let root_id = self.root_source_id();
        let mut store = RenderStateStore::new();
        let render_id = create_render_state(&mut store, None);
        let render_state = get_render_state(&store, render_id).clone();
        prepare_display_object_render(
            &mut store,
            render_id,
            &render_state,
            root_id,
            &|id| self.children_for(id),
            &|_| true,
            &|id| self.parent_for(id),
            &|id| self.revisions_for(id),
            &|id| self.kind_for(id),
            &|id| self.local_transform_for(id),
            &|id| self.alpha_for(id),
            &|id| self.visible_for(id),
            &|id| self.blend_mode_for(id),
            &|_| false,
        );

        let proxies: HashMap<u64, RenderProxy2D> = self
            .nodes
            .keys()
            .filter_map(|id| {
                get_render_proxy_2d(&store, render_id, *id)
                    .cloned()
                    .map(|proxy| (*id, proxy))
            })
            .collect();
        render_wgpu_display_object(
            state,
            root_id,
            &|id| self.children_for(id),
            &|id| self.kind_for(id),
            &|id| proxies.get(&id).cloned(),
            &|_| None,
            &|id| self.bitmap_source_for(id),
            &|_| None,
            &|id| self.sprite_source_for(id),
            &|id| self.tilemap_source_for(id),
            &|_| None,
        );
    }

    fn id_for(&self, node: flighthq_node::NodeId) -> u64 {
        *self
            .source_ids
            .get(&node)
            .expect("node id assigned by refresh_ids")
    }

    fn node_for(&self, id: u64) -> Option<flighthq_node::NodeId> {
        self.nodes.get(&id).copied()
    }

    fn children_for(&self, id: u64) -> Vec<u64> {
        let Some(node) = self.node_for(id) else {
            return Vec::new();
        };
        get_display_object_children(&self.arena, node)
            .into_iter()
            .map(|child| self.id_for(child))
            .collect()
    }

    fn parent_for(&self, id: u64) -> Option<u64> {
        let node = self.node_for(id)?;
        get_display_object_parent(&self.arena, node).map(|parent| self.id_for(parent))
    }

    fn kind_for(&self, id: u64) -> flighthq_types::KindId {
        self.node_for(id)
            .map(|node| get_display_object_kind(&self.arena, node))
            .unwrap_or_else(display_object_kind)
    }

    fn revisions_for(&self, id: u64) -> (u32, u32, u32) {
        let Some(node) = self.node_for(id) else {
            return (0, 0, 0);
        };
        (
            get_display_object_local_bounds_revision(&self.arena, node),
            1,
            get_display_object_local_content_revision(&self.arena, node),
        )
    }

    fn local_transform_for(&self, id: u64) -> Matrix {
        let Some(node) = self.node_for(id) else {
            return Matrix::default();
        };
        let rotation = get_display_object_rotation(&self.arena, node).to_radians();
        let (sin, cos) = rotation.sin_cos();
        let scale_x = get_display_object_scale_x(&self.arena, node);
        let scale_y = get_display_object_scale_y(&self.arena, node);
        Matrix {
            a: cos * scale_x,
            b: sin * scale_x,
            c: -sin * scale_y,
            d: cos * scale_y,
            tx: get_display_object_x(&self.arena, node),
            ty: get_display_object_y(&self.arena, node),
        }
    }

    fn alpha_for(&self, id: u64) -> f32 {
        self.node_for(id)
            .map(|node| get_display_object_alpha(&self.arena, node))
            .unwrap_or(1.0)
    }

    fn visible_for(&self, id: u64) -> bool {
        self.node_for(id)
            .map(|node| get_display_object_visible(&self.arena, node))
            .unwrap_or(true)
    }

    fn blend_mode_for(&self, id: u64) -> Option<flighthq_types::BlendMode> {
        self.node_for(id)
            .and_then(|node| get_display_object_blend_mode(&self.arena, node))
    }

    fn bitmap_source_for(&self, id: u64) -> Option<WgpuBitmapTexture> {
        let node = self.node_for(id)?;
        let image = get_bitmap_image(&self.arena, node)?;
        Some(WgpuBitmapTexture {
            image_id: id,
            version: image.version as u64,
            pixels: image.data.clone()?,
            width: image.width,
            height: image.height,
            draw_width: image.width as f32,
            draw_height: image.height as f32,
        })
    }

    fn sprite_source_for(&self, id: u64) -> Option<WgpuSpriteSource> {
        let node = self.node_for(id)?;
        let atlas = get_sprite_atlas(&self.arena, node)?;
        let image = atlas.image.as_ref()?;
        Some(WgpuSpriteSource {
            image_id: id,
            version: image.version as u64,
            pixels: image.data.clone()?,
            width: image.width,
            height: image.height,
            region: get_sprite_region(&self.arena, node)?.clone(),
        })
    }

    fn tilemap_source_for(&self, id: u64) -> Option<WgpuTilemapSource> {
        let node = self.node_for(id)?;
        let tileset = get_tilemap_tileset(&self.arena, node)?;
        let atlas = tileset.atlas.as_ref()?;
        let image = atlas.image.as_ref()?;
        let columns = get_tilemap_columns(&self.arena, node);
        let rows = get_tilemap_rows(&self.arena, node);
        let mut tiles = Vec::with_capacity((columns * rows) as usize);
        for row in 0..rows {
            for column in 0..columns {
                tiles.push(get_tilemap_tile(&self.arena, node, column, row));
            }
        }
        Some(WgpuTilemapSource {
            image_id: id,
            version: image.version as u64,
            pixels: image.data.clone()?,
            width: image.width,
            height: image.height,
            atlas: atlas.clone(),
            columns,
            rows,
            tile_width: tileset.tile_width,
            tile_height: tileset.tile_height,
            tiles,
        })
    }
}

const EXAMPLE_IDS: &[&str] = &[
    "addinganimation",
    "addingtext",
    "animatedsprite",
    "batchloading",
    "bunnymark",
    "comparebitmapdata",
    "displayingabitmap",
    "drawingshapes",
    "nyancat",
    "piratepig",
    "playingsound",
    "playingvideo",
    "renderview",
    "sparktrail",
    "textmetrics",
    "tweenexample",
    "usingtilemap",
];

fn scene_for(id: &str) -> Option<ExampleScene> {
    match id {
        "addinganimation" => Some(example_addinganimation::create_scene()),
        "addingtext" => Some(example_addingtext::create_scene()),
        "animatedsprite" => Some(example_animatedsprite::create_scene()),
        "batchloading" => Some(example_batchloading::create_scene()),
        "bunnymark" => Some(example_bunnymark::create_scene()),
        "comparebitmapdata" => Some(example_comparebitmapdata::create_scene()),
        "displayingabitmap" => Some(example_displayingabitmap::create_scene()),
        "drawingshapes" => Some(example_drawingshapes::create_scene()),
        "nyancat" => Some(example_nyancat::create_scene()),
        "piratepig" => Some(example_piratepig::create_scene()),
        "playingsound" => Some(example_playingsound::create_scene()),
        "playingvideo" => Some(example_playingvideo::create_scene()),
        "renderview" => Some(example_renderview::create_scene()),
        "sparktrail" => Some(example_sparktrail::create_scene()),
        "textmetrics" => Some(example_textmetrics::create_scene()),
        "tweenexample" => Some(example_tweenexample::create_scene()),
        "usingtilemap" => Some(example_usingtilemap::create_scene()),
        _ => None,
    }
}

struct Bunny {
    x: f32,
    y: f32,
    speed_x: f32,
    speed_y: f32,
}

struct BunnyMarkNativeState {
    arena: DisplayObjectArena,
    stage: flighthq_node::NodeId,
    batch: flighthq_node::NodeId,
    bunnies: Vec<Bunny>,
    random_seed: u32,
    width: u32,
    height: u32,
    bunny_width: f32,
    bunny_height: f32,
}

impl BunnyMarkNativeState {
    fn new(scene: &ExampleScene, image_path: &str, initial_count: usize) -> Self {
        let image_url = resolve_native_asset_path(image_path);
        let image = load_image_resource_from_url(&image_url)
            .unwrap_or_else(|err| panic!("load bunnymark image '{image_url}': {err}"));
        let bunny_width = image.width as f32;
        let bunny_height = image.height as f32;

        let mut atlas = create_texture_atlas(Some(image), Vec::new());
        add_texture_atlas_region(
            &mut atlas,
            0.0,
            0.0,
            bunny_width,
            bunny_height,
            None,
            None,
            None,
        );

        let mut arena = DisplayObjectArena::default();
        let stage = create_stage(&mut arena);
        set_stage_size(&mut arena, stage, scene.width as f32, scene.height as f32);
        set_stage_color(&mut arena, stage, Some(scene.background));
        let batch = create_quad_batch(&mut arena);
        set_quad_batch_atlas(&mut arena, batch, Some(atlas));
        add_display_object_child(&mut arena, stage, batch);

        let mut state = Self {
            arena,
            stage,
            batch,
            bunnies: Vec::new(),
            random_seed: 0x12_34_56_78,
            width: scene.width,
            height: scene.height,
            bunny_width,
            bunny_height,
        };
        state.add_bunnies(initial_count);
        state
    }

    fn add_bunnies(&mut self, count: usize) {
        let start = self.bunnies.len();
        resize_quad_batch(&mut self.arena, self.batch, (start + count) as u32);
        for index in start..start + count {
            let speed_x = self.next_random() * 5.0;
            let speed_y = self.next_random() * 5.0 - 2.5;
            self.bunnies.push(Bunny {
                x: 0.0,
                y: 0.0,
                speed_x,
                speed_y,
            });
            set_quad_batch_instance(&mut self.arena, self.batch, index as u32, 0, 0.0, 0.0);
        }
        invalidate_display_object_local_content(&mut self.arena, self.batch);
    }

    fn update(&mut self, gravity: f32) {
        let max_x = self.width as f32 - self.bunny_width;
        let max_y = self.height as f32 - self.bunny_height;
        let mut bounce_seed = self.random_seed;
        for bunny in &mut self.bunnies {
            bunny.x += bunny.speed_x;
            bunny.y += bunny.speed_y;
            bunny.speed_y += gravity;

            if bunny.x > max_x {
                bunny.speed_x *= -1.0;
                bunny.x = max_x;
            } else if bunny.x < 0.0 {
                bunny.speed_x *= -1.0;
                bunny.x = 0.0;
            }

            if bunny.y > max_y {
                bunny.speed_y *= -0.8;
                bunny.y = max_y;
                if next_random_seed(&mut bounce_seed) > 0.5 {
                    bunny.speed_y -= 3.0 + next_random_seed(&mut bounce_seed) * 4.0;
                }
            } else if bunny.y < 0.0 {
                bunny.speed_y = 0.0;
                bunny.y = 0.0;
            }
        }
        self.random_seed = bounce_seed;
        for (index, bunny) in self.bunnies.iter().enumerate() {
            set_quad_batch_instance(
                &mut self.arena,
                self.batch,
                index as u32,
                0,
                bunny.x,
                bunny.y,
            );
        }
        invalidate_display_object_local_content(&mut self.arena, self.batch);
        prepare_display_object_bounds(&mut self.arena, self.stage);
    }

    fn draw(&self, state: &mut WgpuRenderState) {
        let mut store = RenderStateStore::new();
        let render_id = create_render_state(&mut store, None);
        let render_state = get_render_state(&store, render_id).clone();
        prepare_display_object_render(
            &mut store,
            render_id,
            &render_state,
            BUNNY_STAGE_ID,
            &|id| match id {
                BUNNY_STAGE_ID => vec![BUNNY_BATCH_ID],
                BUNNY_BATCH_ID => vec![],
                _ => vec![],
            },
            &|_| true,
            &|id| match id {
                BUNNY_BATCH_ID => Some(BUNNY_STAGE_ID),
                _ => None,
            },
            &|id| self.revisions_for(id),
            &|id| self.kind_for(id),
            &|_| Matrix::default(),
            &|_| 1.0,
            &|id| self.visible_for(id),
            &|_| None,
            &|_| false,
        );

        let proxies: HashMap<u64, RenderProxy2D> = [BUNNY_STAGE_ID, BUNNY_BATCH_ID]
            .into_iter()
            .filter_map(|id| {
                get_render_proxy_2d(&store, render_id, id)
                    .cloned()
                    .map(|proxy| (id, proxy))
            })
            .collect();
        render_wgpu_display_object(
            state,
            BUNNY_STAGE_ID,
            &|id| match id {
                BUNNY_STAGE_ID => vec![BUNNY_BATCH_ID],
                BUNNY_BATCH_ID => vec![],
                _ => vec![],
            },
            &|id| self.kind_for(id),
            &|id| proxies.get(&id).cloned(),
            &|_| None,
            &|_| None,
            &|id| self.quad_batch_source_for(id),
            &|_| None,
            &|_| None,
            &|_| None,
        );
    }

    fn kind_for(&self, id: u64) -> flighthq_types::KindId {
        match id {
            BUNNY_STAGE_ID => get_display_object_kind(&self.arena, self.stage),
            BUNNY_BATCH_ID => get_display_object_kind(&self.arena, self.batch),
            _ => display_object_kind(),
        }
    }

    fn next_random(&mut self) -> f32 {
        next_random_seed(&mut self.random_seed)
    }

    fn quad_batch_source_for(&self, id: u64) -> Option<WgpuQuadBatchSource> {
        if id != BUNNY_BATCH_ID {
            return None;
        }
        let atlas = get_quad_batch_atlas(&self.arena, self.batch)?.clone();
        let image = atlas.image.as_ref()?;
        let pixels = image.data.clone()?;
        let mut ids =
            Vec::with_capacity(get_quad_batch_instance_count(&self.arena, self.batch) as usize);
        let stride = get_quad_batch_transform_stride(QuadTransformType::Vector2);
        let mut transforms = Vec::with_capacity(
            get_quad_batch_instance_count(&self.arena, self.batch) as usize * stride,
        );
        iterate_quad_batch_instances(&self.arena, self.batch, |_index, id, transform| {
            ids.push(id);
            transforms.extend_from_slice(transform);
        });
        Some(WgpuQuadBatchSource {
            image_id: BUNNY_BATCH_ID,
            version: image.version as u64,
            pixels,
            width: image.width,
            height: image.height,
            atlas,
            ids,
            instance_count: get_quad_batch_instance_count(&self.arena, self.batch),
            transforms,
            transform_type: QuadTransformType::Vector2,
        })
    }

    fn revisions_for(&self, id: u64) -> (u32, u32, u32) {
        let node = match id {
            BUNNY_STAGE_ID => self.stage,
            BUNNY_BATCH_ID => self.batch,
            _ => self.stage,
        };
        (
            get_display_object_local_bounds_revision(&self.arena, node),
            1,
            get_display_object_local_content_revision(&self.arena, node),
        )
    }

    fn visible_for(&self, id: u64) -> bool {
        match id {
            BUNNY_STAGE_ID => get_display_object_visible(&self.arena, self.stage),
            BUNNY_BATCH_ID => get_display_object_visible(&self.arena, self.batch),
            _ => true,
        }
    }
}

fn next_random_seed(seed: &mut u32) -> f32 {
    let mut x = *seed;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *seed = x;
    x as f32 / u32::MAX as f32
}

fn resolve_native_asset_path(image_path: &str) -> String {
    resolve_native_asset_path_for("bunnymark", image_path)
}

fn resolve_native_asset_path_for(package: &str, image_path: &str) -> String {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidates = [
        PathBuf::from(image_path),
        manifest_dir
            .join("../../packages")
            .join(package)
            .join("public")
            .join(image_path),
    ];
    candidates
        .into_iter()
        .find(|path| path.exists())
        .unwrap_or_else(|| PathBuf::from(image_path))
        .to_string_lossy()
        .into_owned()
}
