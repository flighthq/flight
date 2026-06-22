//! Runner for the Flight Rust functional/visual harness.
//!
//! Renders every registered scene and prints a table of regression (vs the
//! committed `baselines/<name>.fp`) and, with `--parity`, parity (vs the TS
//! functional baseline a scene maps to). Flags:
//!
//! - `--bless`   write each scene's fresh fingerprint to its regression baseline
//! - `--parity`  also run the TS-baseline parity comparison per scene
//!
//! When no wgpu adapter is available the runner prints a clear notice and exits
//! `0`, so a GPU-less CI box does not fail.

use flighthq_functional::{
    DEFAULT_PARITY_TOLERANCE, DEFAULT_REGRESSION_TOLERANCE, check_parity, check_regression,
    render_scene_fingerprint, render_scene_to_rgba, scenes, write_regression_baseline,
};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let bless = args.iter().any(|a| a == "--bless");
    let parity = args.iter().any(|a| a == "--parity");

    let scenes = scenes();

    // Probe once: if the first scene cannot render, no adapter is present.
    if render_scene_to_rgba(&scenes[0]).is_none() {
        println!("no adapter — skipped (install mesa-vulkan-drivers for llvmpipe)");
        std::process::exit(0);
    }

    if bless {
        println!("blessing regression baselines:");
        for scene in &scenes {
            match write_regression_baseline(scene) {
                Some(fp) => println!(
                    "  {:<16} {}x{}  {}",
                    scene.name, scene.width, scene.height, fp
                ),
                None => println!("  {:<16} (no fingerprint)", scene.name),
            }
        }
        println!();
    }

    println!(
        "{:<16} {:>9}  {:<24}  {:<28}",
        "scene", "size", "regression", "parity"
    );
    println!("{}", "-".repeat(82));

    let mut any_fail = false;
    for scene in &scenes {
        let size = format!("{}x{}", scene.width, scene.height);

        let regression = match check_regression(scene, DEFAULT_REGRESSION_TOLERANCE) {
            Some(result) => {
                if !result.pass {
                    any_fail = true;
                }
                format!(
                    "{} {:.2} (<= {:.1})",
                    if result.pass { "PASS" } else { "FAIL" },
                    result.diff,
                    result.tolerance
                )
            }
            None => {
                if render_scene_fingerprint(scene).is_some() {
                    // Rendered, but no committed baseline yet.
                    "no baseline (bless)".to_string()
                } else {
                    "no fingerprint".to_string()
                }
            }
        };

        let parity_cell = if parity {
            match check_parity(scene, DEFAULT_PARITY_TOLERANCE) {
                Some(result) => {
                    if !result.pass {
                        any_fail = true;
                    }
                    format!(
                        "{} {:.2} (<= {:.1})",
                        if result.pass { "PASS" } else { "FAIL" },
                        result.diff,
                        result.tolerance
                    )
                }
                None => {
                    // A scene that maps a TS baseline and rendered, yet has no
                    // parity result, lacks a TS *webgpu* fingerprint to compare
                    // against (the JSON node carries only a sha256). That is a
                    // deferred reference, not a pass or fail: comparing wgpu
                    // output to the canvas/webgl baselines would measure a
                    // different effect algorithm, not a port regression.
                    if scene.ts_baseline.is_some() && render_scene_fingerprint(scene).is_some() {
                        "deferred (no wgpu baseline)".to_string()
                    } else {
                        "n/a".to_string()
                    }
                }
            }
        } else {
            "-".to_string()
        };

        println!(
            "{:<16} {:>9}  {:<24}  {:<28}",
            scene.name, size, regression, parity_cell
        );
    }

    if any_fail {
        std::process::exit(1);
    }
}
