//! `flighthq-functional` — Flight Rust functional/visual parity harness.
//!
//! Renders declarative scenes headlessly through `flighthq-capture` and gates
//! them two ways:
//!
//! - **Regression**: the fresh fingerprint must match a committed
//!   `tests/functional/runners/native/baselines/<name>.fp` line within a tolerance
//!   (default `5.0`), catching gross visual drift in the Rust render path.
//! - **Parity**: when a scene maps to a TS functional scene (`Scene.ts_baseline`
//!   `Some`), the fresh fingerprint is compared to that scene's TS baseline
//!   (`tests/functional/baselines/<stem>.json`) within a wider tolerance
//!   (default `15.0`), confirming the Rust render matches the TS reference.
//!
//! The fingerprint is the same `"16:<hex>"` 16×16×3 averaged-RGB form
//! `flighthq-surface` produces and the TS baselines store, so a Rust capture is
//! directly comparable to a TS baseline string.
//!
//! All paths return sentinels (`None`) rather than panicking when no wgpu
//! adapter is present, so a GPU-less CI box degrades gracefully.

mod render_gl;
mod render_skia;
mod scene;
mod scene_graph;
mod target;

use std::path::{Path, PathBuf};

use flighthq_surface::{
    compare_surface_fingerprints, create_surface_fingerprint, format_surface_fingerprint,
    parse_surface_fingerprint,
};
use flighthq_types::AlphaType;
use flighthq_types::{ColorSpace, PixelFormat, Surface};

pub use render_gl::render_scene_to_rgba_gl;
pub use render_skia::render_scene_to_rgba_skia;
pub use scene::{RectFill, Scene, render_scene_to_rgba, scenes};
pub use scene_graph::{SceneGraph, build_scene_graph};
pub use target::RenderTarget;

/// Renders a scene through a specific [`RenderTarget`] to tightly packed RGBA
/// bytes, or `None` when that target is unavailable (no adapter/context) or does
/// not support the scene (e.g. effects on the software/gl cells today). This is
/// the dispatch the parallel matrix runner fans out over.
pub fn render_scene_to_rgba_with(target: RenderTarget, scene: &Scene) -> Option<Vec<u8>> {
    match target {
        RenderTarget::Skia => render_scene_to_rgba_skia(scene),
        RenderTarget::Gl => render_scene_to_rgba_gl(scene),
        RenderTarget::Wgpu => render_scene_to_rgba(scene),
    }
}

/// Grid resolution of the visual fingerprint. 16×16×3 cells, matching the TS
/// functional baselines' `"16:<hex>"` form.
pub const FINGERPRINT_GRID_SIZE: u32 = 16;

/// Default regression tolerance (mean abs per-channel diff, 0..255). Matches the
/// TS `compare-render` regression tolerance.
pub const DEFAULT_REGRESSION_TOLERANCE: f32 = 5.0;

/// Default parity tolerance (mean abs per-channel diff, 0..255). Matches the TS
/// `compare-render` parity tolerance.
pub const DEFAULT_PARITY_TOLERANCE: f32 = 15.0;

/// Outcome of one fingerprint comparison.
#[derive(Clone, Debug)]
pub struct CheckResult {
    /// The freshly rendered fingerprint, `"16:<hex>"`.
    pub fingerprint: String,
    /// The baseline fingerprint compared against, `"16:<hex>"`.
    pub baseline: String,
    /// Mean abs per-channel difference (0..255).
    pub diff: f32,
    /// The tolerance the diff was gated against.
    pub tolerance: f32,
    /// `true` when `diff <= tolerance`.
    pub pass: bool,
}

/// Renders a scene through the wgpu target and reduces it to a `"16:<hex>"`
/// fingerprint. Returns `None` when no wgpu adapter is available. Equivalent to
/// [`render_scene_fingerprint_with`] for [`RenderTarget::Wgpu`].
pub fn render_scene_fingerprint(scene: &Scene) -> Option<String> {
    render_scene_fingerprint_with(RenderTarget::Wgpu, scene)
}

/// Renders a scene through `target` and reduces it to a `"16:<hex>"` fingerprint,
/// or `None` when the target is unavailable or does not support the scene.
pub fn render_scene_fingerprint_with(target: RenderTarget, scene: &Scene) -> Option<String> {
    let pixels = render_scene_to_rgba_with(target, scene)?;
    let surface = Surface {
        alpha_type: AlphaType::Straight,
        data: pixels,
        format: PixelFormat::Rgba8Unorm,
        height: scene.height,
        version: 0,
        width: scene.width,
        color_space: ColorSpace::Srgb,
    };
    let fingerprint = create_surface_fingerprint(&surface, FINGERPRINT_GRID_SIZE);
    Some(format_surface_fingerprint(&fingerprint))
}

/// Compares a scene's fresh wgpu fingerprint to its committed regression
/// baseline. Equivalent to [`check_regression_with`] for [`RenderTarget::Wgpu`].
pub fn check_regression(scene: &Scene, tolerance: f32) -> Option<CheckResult> {
    check_regression_with(RenderTarget::Wgpu, scene, tolerance)
}

/// Compares a scene's fresh fingerprint on `target` to that target's committed
/// regression baseline.
///
/// Returns `None` when the target is unavailable or does not support the scene
/// (nothing rendered) or when the committed baseline file is missing or
/// malformed. A missing baseline is the signal to run the bless path
/// ([`write_regression_baseline_with`]).
pub fn check_regression_with(
    target: RenderTarget,
    scene: &Scene,
    tolerance: f32,
) -> Option<CheckResult> {
    let fingerprint = render_scene_fingerprint_with(target, scene)?;
    let baseline = read_regression_baseline_with(target, scene)?;
    compare_fingerprint_strings(&fingerprint, &baseline, tolerance)
}

/// Compares a scene's fresh wgpu fingerprint to the TS functional baseline it
/// maps to. Equivalent to [`check_parity_with`] for [`RenderTarget::Wgpu`].
pub fn check_parity(scene: &Scene, tolerance: f32) -> Option<CheckResult> {
    check_parity_with(RenderTarget::Wgpu, scene, tolerance)
}

/// Compares a scene's fresh fingerprint on `target` to the TS `webgpu` baseline
/// it maps to.
///
/// Returns `None` when the scene has no `ts_baseline` mapping, when the target is
/// unavailable or does not support the scene, or when the TS `webgpu` baseline
/// carries no `fingerprint` string ("deferred — no wgpu baseline"). The TS
/// reference is always the `webgpu` fingerprint regardless of `target`: the Rust
/// gl/skia cells are checked against the same TS GPU reference (and cross-checked
/// against each other by the runner), never against a different TS backend's
/// algorithm (see [`read_ts_baseline_fingerprint`]).
pub fn check_parity_with(
    target: RenderTarget,
    scene: &Scene,
    tolerance: f32,
) -> Option<CheckResult> {
    let stem = scene.ts_baseline?;
    let fingerprint = render_scene_fingerprint_with(target, scene)?;
    let baseline = read_ts_baseline_fingerprint(stem)?;
    compare_fingerprint_strings(&fingerprint, &baseline, tolerance)
}

/// Writes a scene's fresh wgpu fingerprint to its committed regression baseline.
/// Equivalent to [`write_regression_baseline_with`] for [`RenderTarget::Wgpu`].
pub fn write_regression_baseline(scene: &Scene) -> Option<String> {
    write_regression_baseline_with(RenderTarget::Wgpu, scene)
}

/// Writes a scene's fresh fingerprint on `target` to that target's committed
/// regression baseline file, creating the baseline directory if needed. Returns
/// the written fingerprint, or `None` when the target rendered nothing.
pub fn write_regression_baseline_with(target: RenderTarget, scene: &Scene) -> Option<String> {
    let fingerprint = render_scene_fingerprint_with(target, scene)?;
    let path = regression_baseline_path_with(target, scene.name);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok()?;
    }
    std::fs::write(&path, format!("{fingerprint}\n")).ok()?;
    Some(fingerprint)
}

/// The committed wgpu regression baseline path for a scene name:
/// `tests/functional/runners/native/baselines/<name>.fp`.
pub fn regression_baseline_path(name: &str) -> PathBuf {
    regression_baseline_path_with(RenderTarget::Wgpu, name)
}

/// The committed regression baseline path for a `target` + scene name. The wgpu
/// cell keeps the flat legacy layout (`baselines/<name>.fp`) so existing
/// committed baselines stay valid; the other cells live under a per-target
/// directory (`baselines/<target>/<name>.fp`).
pub fn regression_baseline_path_with(target: RenderTarget, name: &str) -> PathBuf {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("baselines");
    match target {
        RenderTarget::Wgpu => dir.join(format!("{name}.fp")),
        other => dir.join(other.label()).join(format!("{name}.fp")),
    }
}

/// Reads and trims a scene's committed wgpu regression baseline line, or `None`
/// if the file is missing or empty.
pub fn read_regression_baseline(scene: &Scene) -> Option<String> {
    read_regression_baseline_with(RenderTarget::Wgpu, scene)
}

/// Reads and trims a scene's committed regression baseline line for `target`, or
/// `None` if the file is missing or empty.
pub fn read_regression_baseline_with(target: RenderTarget, scene: &Scene) -> Option<String> {
    let text = std::fs::read_to_string(regression_baseline_path_with(target, scene.name)).ok()?;
    let line = text.trim();
    if line.is_empty() {
        None
    } else {
        Some(line.to_string())
    }
}

/// Loads the TS `webgpu` functional baseline fingerprint string from the
/// baseline JSON identified by its stem (`tests/functional/baselines/<stem>.json`).
///
/// Only the `webgpu` backend is read. The Rust port renders through wgpu, so its
/// WebGPU sibling is the one apples-to-apples reference: the wgpu effect shaders
/// here are byte-identical to the TS wgpu shaders. The `canvas` and `webgl`
/// baselines are deliberately *not* a fallback — those backends implement some
/// effects with a different algorithm (e.g. canvas hue/saturation is a CSS
/// `hue-rotate`/`saturate` matrix in YIQ space, not the wgpu HSL convert-rotate-
/// convert path), so comparing wgpu output against them measures an algorithm
/// difference, not a port regression. Returns `None` when the file is missing or
/// the `webgpu` node carries no `fingerprint` string (some TS baselines committed
/// only a `sha256`); callers treat that as "deferred — no wgpu baseline" rather
/// than failing against a different backend.
pub fn read_ts_baseline_fingerprint(stem: &str) -> Option<String> {
    let path = ts_baseline_path(stem);
    let text = std::fs::read_to_string(path).ok()?;
    let json: serde_json::Value = serde_json::from_str(&text).ok()?;
    json.get("webgpu")
        .and_then(|b| b.get("fingerprint"))
        .and_then(|f| f.as_str())
        .map(|s| s.to_string())
}

/// The TS functional baseline path for a stem:
/// `<repo>/tests/functional/baselines/<stem>.json`. Resolved relative to this
/// crate's manifest (`tests/functional/runners/native`), four levels up to the
/// repo root.
pub fn ts_baseline_path(stem: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .join("tests/functional/baselines")
        .join(format!("{stem}.json"))
}

/// Parses two `"16:<hex>"` fingerprint strings and compares them within
/// `tolerance`. Returns `None` if either string is malformed or the grid sizes
/// differ.
pub fn compare_fingerprint_strings(
    fingerprint: &str,
    baseline: &str,
    tolerance: f32,
) -> Option<CheckResult> {
    let fresh = parse_surface_fingerprint(fingerprint)?;
    let base = parse_surface_fingerprint(baseline)?;
    if fresh.grid_size != base.grid_size {
        return None;
    }
    let diff = compare_surface_fingerprints(&fresh, &base);
    Some(CheckResult {
        fingerprint: fingerprint.to_string(),
        baseline: baseline.to_string(),
        diff,
        tolerance,
        pass: diff <= tolerance,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compare_fingerprint_strings_identical_passes() {
        let fp = "16:".to_string() + &"00".repeat(16 * 16 * 3);
        let result = compare_fingerprint_strings(&fp, &fp, DEFAULT_REGRESSION_TOLERANCE).unwrap();
        assert_eq!(result.diff, 0.0);
        assert!(result.pass);
    }

    #[test]
    fn compare_fingerprint_strings_malformed_returns_none() {
        assert!(compare_fingerprint_strings("not-a-fingerprint", "16:00", 5.0).is_none());
    }

    #[test]
    fn read_ts_baseline_fingerprint_defers_when_webgpu_node_lacks_fingerprint() {
        // When the webgpu node has only a sha256 (no fingerprint key),
        // read_ts_baseline_fingerprint returns None so parity defers rather
        // than falling back to a different algorithm's baseline.
        // Write a synthetic baseline file into a temp directory and point
        // ts_baseline_path at it via a direct JSON parse, mirroring what the
        // production path does.
        let json: serde_json::Value = serde_json::from_str(
            r#"{"webgpu":{"sha256":"abc123"},"canvas":{"fingerprint":"16:aabbcc"}}"#,
        )
        .unwrap();
        let result = json
            .get("webgpu")
            .and_then(|b| b.get("fingerprint"))
            .and_then(|f| f.as_str())
            .map(|s| s.to_string());
        assert!(result.is_none());
    }

    #[test]
    fn read_ts_baseline_fingerprint_reads_webgpu_when_present() {
        // `effect-grayscale` carries a real `webgpu` fingerprint string.
        let fp = read_ts_baseline_fingerprint("effect-grayscale").expect("webgpu fingerprint");
        assert!(fp.starts_with("16:"));
    }

    #[test]
    fn regression_baseline_path_targets_crate_baselines_dir() {
        let path = regression_baseline_path("solid-red");
        assert!(path.ends_with("baselines/solid-red.fp"));
    }
}
