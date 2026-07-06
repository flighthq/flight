//! Runner for the Flight Rust functional/visual harness.
//!
//! Renders every registered scene across every selected Rust render target
//! (`skia`, `gl`, `wgpu`) **in parallel** and prints a matrix of regression (vs
//! the committed `baselines/[<target>/]<name>.fp`) and, with `--parity`, parity
//! (vs the TS `webgpu` baseline a scene maps to). The matrix is sparse: a cell a
//! target cannot produce (no adapter/context, or an effect the cell does not yet
//! apply) reports a clean status rather than failing the run.
//!
//! Flags:
//! - `--bless`            write each cell's fresh fingerprint to its baseline
//! - `--parity`           also run the TS-baseline parity comparison per cell
//! - `--target a,b`       restrict to these targets (default: skia,gl,wgpu)
//! - `--jobs N`           worker threads (default: available parallelism)

use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;

use flighthq_functional::{
    DEFAULT_PARITY_TOLERANCE, DEFAULT_REGRESSION_TOLERANCE, RenderTarget, Scene,
    compare_fingerprint_strings, read_regression_baseline_with, read_ts_baseline_fingerprint,
    render_scene_fingerprint_with, scenes, write_regression_baseline_with,
};

fn main() {
    configure_gl_environment();

    let args: Vec<String> = std::env::args().skip(1).collect();
    let bless = args.iter().any(|a| a == "--bless");
    let parity = args.iter().any(|a| a == "--parity");
    let targets = parse_targets(&args);
    let workers = parse_jobs(&args);

    let scenes = scenes();

    // One job per (scene, target) cell. Rendering is independent per cell — each
    // wgpu/gl cell builds its own device/context, skia is pure CPU — so the whole
    // matrix fans out across a thread pool.
    let jobs: Vec<Job> = (0..scenes.len())
        .flat_map(|scene_index| {
            targets.iter().map(move |&target| Job {
                scene_index,
                target,
            })
        })
        .collect();

    if bless {
        println!("blessing regression baselines ({} cells):", jobs.len());
        let blessed = parallel_map(&jobs, workers, |job| {
            let scene = &scenes[job.scene_index];
            (
                job.target,
                scene.name,
                write_regression_baseline_with(job.target, scene),
            )
        });
        for (target, name, fp) in &blessed {
            match fp {
                Some(fp) => println!("  {:<6} {:<26} {}", target.label(), name, fp),
                None => println!("  {:<6} {:<26} (no fingerprint)", target.label(), name),
            }
        }
        println!();
    }

    // Render each cell once; derive regression, parity, and consistency from the
    // single fingerprint rather than re-rendering per comparison.
    let cells = parallel_map(&jobs, workers, |job| {
        let scene = &scenes[job.scene_index];
        let fingerprint = render_scene_fingerprint_with(job.target, scene);
        Cell {
            scene_index: job.scene_index,
            target: job.target,
            regression: regression_status(job.target, scene, &fingerprint),
            parity: if parity {
                parity_status(job.target, scene, &fingerprint)
            } else {
                None
            },
            fingerprint,
        }
    });

    let any_fail = print_matrix(&scenes, &targets, &cells, parity);
    let inconsistent = print_consistency(&scenes, &targets, &cells);

    if any_fail || inconsistent {
        std::process::exit(1);
    }
}

/// Prepares the process environment the headless gl cell needs, once on the main
/// thread before the worker pool spawns. The gl cell renders through a headless
/// EGL context; on Mesa, `eglGetDisplay(EGL_DEFAULT_DISPLAY)` resolves to the
/// surfaceless platform only when `EGL_PLATFORM=surfaceless` is set, and a
/// scratch `XDG_RUNTIME_DIR` silences driver chatter. Setting them here (single
/// threaded, pre-pool) keeps `set_var` sound — env mutation races only matter
/// once other threads run. Pre-set values are respected.
fn configure_gl_environment() {
    if std::env::var_os("EGL_PLATFORM").is_none() {
        unsafe { std::env::set_var("EGL_PLATFORM", "surfaceless") };
    }
    if std::env::var_os("XDG_RUNTIME_DIR").is_none() {
        unsafe { std::env::set_var("XDG_RUNTIME_DIR", std::env::temp_dir()) };
    }
}

/// One matrix cell to render: a scene index paired with a render target.
#[derive(Copy, Clone)]
struct Job {
    scene_index: usize,
    target: RenderTarget,
}

/// A rendered matrix cell's fingerprint and outcome strings.
struct Cell {
    scene_index: usize,
    target: RenderTarget,
    /// The fresh fingerprint, or `None` when the target did not render the scene.
    fingerprint: Option<String>,
    regression: CellStatus,
    parity: Option<CellStatus>,
}

/// The graded outcome of one comparison in a cell.
struct CellStatus {
    text: String,
    fail: bool,
}

/// Grades a cell's regression: the precomputed `fingerprint` against the target's
/// committed baseline.
fn regression_status(
    target: RenderTarget,
    scene: &Scene,
    fingerprint: &Option<String>,
) -> CellStatus {
    let Some(fingerprint) = fingerprint else {
        return CellStatus {
            text: unavailable_reason(target, scene).to_string(),
            fail: false,
        };
    };
    match read_regression_baseline_with(target, scene) {
        Some(baseline) => {
            match compare_fingerprint_strings(fingerprint, &baseline, DEFAULT_REGRESSION_TOLERANCE)
            {
                Some(result) => CellStatus {
                    text: format!(
                        "{} {:.2}",
                        if result.pass { "PASS" } else { "FAIL" },
                        result.diff
                    ),
                    fail: !result.pass,
                },
                None => CellStatus {
                    text: "bad baseline".to_string(),
                    fail: true,
                },
            }
        }
        None => CellStatus {
            text: "no baseline".to_string(),
            fail: false,
        },
    }
}

/// Grades a cell's parity: the precomputed `fingerprint` against the TS `webgpu`
/// baseline the scene maps to. `None` when the scene maps no TS baseline.
fn parity_status(
    target: RenderTarget,
    scene: &Scene,
    fingerprint: &Option<String>,
) -> Option<CellStatus> {
    let stem = scene.ts_baseline?;
    let Some(fingerprint) = fingerprint else {
        return Some(CellStatus {
            text: unavailable_reason(target, scene).to_string(),
            fail: false,
        });
    };
    let Some(baseline) = read_ts_baseline_fingerprint(stem) else {
        return Some(CellStatus {
            text: "deferred".to_string(),
            fail: false,
        });
    };
    Some(
        match compare_fingerprint_strings(fingerprint, &baseline, DEFAULT_PARITY_TOLERANCE) {
            Some(result) => CellStatus {
                text: format!(
                    "{} {:.2}",
                    if result.pass { "PASS" } else { "FAIL" },
                    result.diff
                ),
                fail: !result.pass,
            },
            None => CellStatus {
                text: "deferred".to_string(),
                fail: false,
            },
        },
    )
}

/// Explains why a target produced no fingerprint for a scene: an effect chain the
/// non-wgpu cells do not yet apply, or no adapter/context at all.
fn unavailable_reason(target: RenderTarget, scene: &Scene) -> &'static str {
    let has_effects = !(scene.effects)().is_empty();
    if has_effects && target != RenderTarget::Wgpu {
        "unsupported"
    } else {
        "skipped"
    }
}

/// Prints the scene × target matrix and returns whether any cell failed.
fn print_matrix(scenes: &[Scene], targets: &[RenderTarget], cells: &[Cell], parity: bool) -> bool {
    // Parity appends "|P <status>" to each cell, so widen the column when shown.
    let col = if parity { 30usize } else { 22usize };
    print!("{:<24} {:>9}  ", "scene", "size");
    for target in targets {
        print!("{:<width$}", target.label(), width = col);
    }
    println!();
    println!("{}", "-".repeat(24 + 11 + col * targets.len()));

    let mut any_fail = false;
    for (scene_index, scene) in scenes.iter().enumerate() {
        print!(
            "{:<24} {:>9}  ",
            scene.name,
            format!("{}x{}", scene.width, scene.height)
        );
        for target in targets {
            let cell = cells
                .iter()
                .find(|c| c.scene_index == scene_index && c.target == *target);
            let text = match cell {
                Some(cell) => {
                    any_fail |= cell.regression.fail;
                    let mut text = cell.regression.text.clone();
                    if let Some(parity) = &cell.parity {
                        any_fail |= parity.fail;
                        text = format!("{text} |P {}", parity.text);
                    }
                    text
                }
                None => "-".to_string(),
            };
            print!("{text:<col$}");
        }
        println!();
    }
    if parity {
        println!("\n(cell = regression; |P = parity vs TS webgpu baseline)");
    }
    any_fail
}

/// Prints the cross-target consistency check: for each scene, the render targets
/// that produced a fingerprint must agree with each other (the parity-matrix
/// "consistency" strategy — no target is the authority). Scenes where fewer than
/// two targets rendered are reported as n/a. Returns whether any scene's targets
/// disagreed.
fn print_consistency(scenes: &[Scene], targets: &[RenderTarget], cells: &[Cell]) -> bool {
    if targets.len() < 2 {
        return false;
    }
    println!("\nconsistency (rendered targets must agree):");
    let mut any_diff = false;
    for (scene_index, scene) in scenes.iter().enumerate() {
        let rendered: Vec<(&str, &String)> = targets
            .iter()
            .filter_map(|target| {
                cells
                    .iter()
                    .find(|c| c.scene_index == scene_index && c.target == *target)
                    .and_then(|c| c.fingerprint.as_ref().map(|fp| (target.label(), fp)))
            })
            .collect();

        if rendered.len() < 2 {
            println!(
                "  {:<26} n/a ({} target rendered)",
                scene.name,
                rendered.len()
            );
            continue;
        }
        let reference = rendered[0].1;
        let agree = rendered.iter().all(|(_, fp)| *fp == reference);
        any_diff |= !agree;
        let names: Vec<&str> = rendered.iter().map(|(name, _)| *name).collect();
        println!(
            "  {:<26} {:<4} [{}]",
            scene.name,
            if agree { "OK" } else { "DIFF" },
            names.join(",")
        );
    }
    any_diff
}

/// Parses `--target a,b,c` into the selected targets, defaulting to all three in
/// matrix-column order. Unknown labels are ignored.
fn parse_targets(args: &[String]) -> Vec<RenderTarget> {
    let selected: Option<Vec<RenderTarget>> = args
        .iter()
        .position(|a| a == "--target")
        .and_then(|i| args.get(i + 1))
        .map(|list| {
            list.split(',')
                .filter_map(RenderTarget::from_label)
                .collect()
        });
    match selected {
        Some(targets) if !targets.is_empty() => targets,
        _ => RenderTarget::ALL.to_vec(),
    }
}

/// Parses `--jobs N`, defaulting to the machine's available parallelism (min 1).
fn parse_jobs(args: &[String]) -> usize {
    args.iter()
        .position(|a| a == "--jobs")
        .and_then(|i| args.get(i + 1))
        .and_then(|n| n.parse::<usize>().ok())
        .filter(|&n| n > 0)
        .unwrap_or_else(|| {
            thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(1)
        })
}

/// Runs `f` over `items` across `workers` scoped threads, preserving input order
/// in the returned results. Each worker pulls the next index off a shared atomic
/// cursor — a minimal work-stealing pool with no external dependency.
fn parallel_map<T, R, F>(items: &[T], workers: usize, f: F) -> Vec<R>
where
    T: Sync,
    R: Send,
    F: Fn(&T) -> R + Sync,
{
    let n = items.len();
    let cursor = AtomicUsize::new(0);
    let slots: Vec<Mutex<Option<R>>> = (0..n).map(|_| Mutex::new(None)).collect();
    let workers = workers.max(1).min(n.max(1));

    thread::scope(|scope| {
        for _ in 0..workers {
            scope.spawn(|| {
                loop {
                    let i = cursor.fetch_add(1, Ordering::Relaxed);
                    if i >= n {
                        break;
                    }
                    let result = f(&items[i]);
                    *slots[i].lock().expect("slot poisoned") = Some(result);
                }
            });
        }
    });

    slots
        .into_iter()
        .map(|slot| {
            slot.into_inner()
                .expect("slot poisoned")
                .expect("slot filled")
        })
        .collect()
}
