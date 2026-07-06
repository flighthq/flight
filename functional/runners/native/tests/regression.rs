//! Regression gate plus a proof that the cross-format (Rust ↔ TS) fingerprint
//! compare works mechanically.
//!
//! The regression assertions skip (pass) when no wgpu adapter is available, like
//! `flighthq-capture`'s tests, so a display-less, driver-less CI box does not
//! fail. The TS-baseline-ingest test needs no adapter — it proves Rust can read
//! a real TS baseline JSON, parse its fingerprint, and compare it.

use std::path::Path;

use flighthq_functional::{
    DEFAULT_REGRESSION_TOLERANCE, check_regression, read_regression_baseline,
    render_scene_fingerprint, render_scene_to_rgba, scenes,
};
use flighthq_surface::{compare_surface_fingerprints, parse_surface_fingerprint};

#[test]
fn every_scene_matches_its_committed_regression_baseline() {
    let scenes = scenes();
    if render_scene_fingerprint(&scenes[0]).is_none() {
        eprintln!("no wgpu adapter available — skipping regression assertions");
        return;
    }

    for scene in &scenes {
        let baseline = read_regression_baseline(scene).unwrap_or_else(|| {
            panic!(
                "missing committed baseline for {} — run --bless",
                scene.name
            )
        });
        assert!(!baseline.is_empty(), "{} has an empty baseline", scene.name);

        let result = check_regression(scene, DEFAULT_REGRESSION_TOLERANCE)
            .unwrap_or_else(|| panic!("{} failed to render or parse a fingerprint", scene.name));
        assert!(
            result.pass,
            "{} regressed: diff {:.3} exceeds tolerance {:.1}\n  fresh:    {}\n  baseline: {}",
            scene.name, result.diff, result.tolerance, result.fingerprint, result.baseline
        );
    }
}

/// Proves painter (z) order: in a display list children paint back-to-front, so
/// the LAST child must be on top everywhere it overlaps an earlier one.
///
/// The `overlap-rects` scene stacks red, then green, then blue (in that child
/// order). This samples the rendered pixels at points where pairs/triples of
/// rects overlap and asserts the later child's color wins. A reversed draw walk
/// (pushing children forward instead of reversed onto the LIFO stack) would make
/// the FIRST child paint on top and fail these assertions — guarding the z-order
/// fix in `render_wgpu_display_object` against regression.
///
/// Skips (passes) when no wgpu adapter is available, like the other render tests.
#[test]
fn overlap_rects_paint_last_child_on_top() {
    let scene = scenes()
        .into_iter()
        .find(|s| s.name == "overlap-rects")
        .expect("overlap-rects scene exists");

    let Some(pixels) = render_scene_to_rgba(&scene) else {
        eprintln!("no wgpu adapter available — skipping z-order assertions");
        return;
    };

    let width = scene.width as usize;
    let sample = |x: usize, y: usize| -> (u8, u8, u8) {
        let i = (y * width + x) * 4;
        (pixels[i], pixels[i + 1], pixels[i + 2])
    };
    // Solid-fill rasterization plus sRGB round-trips can shift a channel by a few
    // units; assert the dominant channel rather than an exact match.
    let close = |got: (u8, u8, u8), want: (u8, u8, u8)| -> bool {
        let d = |a: u8, b: u8| (a as i32 - b as i32).abs();
        d(got.0, want.0) <= 8 && d(got.1, want.1) <= 8 && d(got.2, want.2) <= 8
    };

    // Scene layout (stage pixels):
    //   red   [20,80) x [20,80)   0xE0_30_30
    //   green [48,108) x [48,108) 0x30_C0_50
    //   blue  [75,110) x [20,100) 0x40_70_E0
    let red = (0xE0, 0x30, 0x30);
    let green = (0x30, 0xC0, 0x50);
    let blue = (0x40, 0x70, 0xE0);

    // red only — earliest child, no overlap.
    assert!(
        close(sample(30, 30), red),
        "red-only pixel should be red, got {:?}",
        sample(30, 30)
    );
    // red ∩ green (no blue) — green is the later child, must win.
    assert!(
        close(sample(55, 70), green),
        "red∩green pixel should be green (later child on top), got {:?}",
        sample(55, 70)
    );
    // red ∩ blue (no green) — blue is the last child, must win.
    assert!(
        close(sample(78, 30), blue),
        "red∩blue pixel should be blue (last child on top), got {:?}",
        sample(78, 30)
    );
    // red ∩ green ∩ blue — blue, the last child, must be on top.
    assert!(
        close(sample(78, 70), blue),
        "triple-overlap pixel should be blue (last child on top), got {:?}",
        sample(78, 70)
    );
}

/// Proves the cross-impl mechanism: ingest a real TS functional baseline string,
/// parse it with the same `flighthq-surface` parser the harness uses, and confirm
/// it compares cleanly to itself. This is the mechanical guarantee that a Rust
/// capture can be diffed against a TS baseline once a Rust scene reproduces a TS
/// scene — no adapter required.
#[test]
fn ts_baseline_fingerprint_ingests_and_self_compares_to_zero() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join("functional/baselines/effect-grayscale.json");
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|_| panic!("TS baseline not found at {}", path.display()));
    let json: serde_json::Value = serde_json::from_str(&text).expect("TS baseline is valid JSON");

    let fingerprint = json["canvas"]["fingerprint"]
        .as_str()
        .expect("TS baseline has canvas.fingerprint");
    assert!(
        fingerprint.starts_with("16:"),
        "TS fingerprint is the 16-grid form"
    );

    let parsed = parse_surface_fingerprint(fingerprint)
        .expect("Rust parses the TS baseline fingerprint string");
    assert_eq!(parsed.grid_size, 16);

    let diff = compare_surface_fingerprints(&parsed, &parsed);
    assert_eq!(
        diff, 0.0,
        "a TS baseline must compare to itself as identical"
    );
}
