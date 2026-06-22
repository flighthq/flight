//! Headless capture smoke test.
//!
//! Builds a real `Stage` display object, runs the display-object pre-render
//! update pass over it, then captures a 16x16 frame cleared to a known solid
//! color and verifies the center pixel matches. Exits 0 on success, 2 when no
//! wgpu adapter (hardware or software) is available in this environment, and 1
//! on a genuine mismatch.
//!
//! Run: `cargo run -p flighthq-capture --example smoke`

use flighthq_capture::{capture_scene_to_png, capture_scene_to_rgba, request_wgpu_capture_device};
use flighthq_displayobject::{
    DisplayObjectArena, create_stage, prepare_display_object_render, set_stage_color,
};
use flighthq_displayobject_wgpu::register_wgpu_display_object_renderer;

fn main() {
    const SIZE: u32 = 16;
    // Opaque red in 0xRRGGBBAA. Rgba8UnormSrgb readback is the same packed order.
    const BACKGROUND: u32 = 0xff_00_00_ff;

    if request_wgpu_capture_device().is_none() {
        eprintln!(
            "no wgpu adapter (hardware or software) available in this environment — skipping capture"
        );
        std::process::exit(2);
    }

    // Build a real scene: a Stage colored to match the capture background, with the
    // display-object update pass run over it (refreshes cached bounds).
    let mut arena = DisplayObjectArena::default();
    let stage = create_stage(&mut arena);
    set_stage_color(&mut arena, stage, Some(BACKGROUND));
    prepare_display_object_render(&mut arena, stage);

    // The background-clear path does not consult the proxy graph, so the stage source
    // id is a pass-through here (0). A proxy-backed scene would map `stage` into the
    // render store and pass its real source id.
    let stage_source_id = 0u64;
    let _ = stage;

    let pixels = capture_scene_to_rgba(
        SIZE,
        SIZE,
        BACKGROUND,
        stage_source_id,
        Box::new(|state, _stage_source_id| {
            register_wgpu_display_object_renderer(state);
            Box::new(|_state| {})
        }),
    )
    .expect("adapter was present, capture should succeed");

    assert_eq!(
        pixels.len(),
        (SIZE * SIZE * 4) as usize,
        "tightly packed RGBA"
    );

    // Center pixel of the cleared frame must be the background color.
    let center = ((SIZE / 2) * SIZE + (SIZE / 2)) as usize * 4;
    let (r, g, b, a) = (
        pixels[center],
        pixels[center + 1],
        pixels[center + 2],
        pixels[center + 3],
    );
    println!("center pixel = ({r}, {g}, {b}, {a})");

    // sRGB rounding can shift a fully saturated channel by at most a couple of LSBs.
    let near = |value: u8, target: u8| (value as i32 - target as i32).abs() <= 2;
    if !(near(r, 0xff) && near(g, 0x00) && near(b, 0x00) && near(a, 0xff)) {
        eprintln!("center pixel did not match the red background clear");
        std::process::exit(1);
    }

    let out_path = std::env::temp_dir().join("flighthq-capture-smoke.png");
    let wrote = capture_scene_to_png(
        SIZE,
        SIZE,
        BACKGROUND,
        stage_source_id,
        Box::new(|state, _stage_source_id| {
            register_wgpu_display_object_renderer(state);
            Box::new(|_state| {})
        }),
        &out_path,
    );
    if !wrote {
        eprintln!("failed to encode/write capture PNG");
        std::process::exit(1);
    }
    println!("wrote {}", out_path.display());
    println!("capture smoke OK");
}
