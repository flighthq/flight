mod allow;
mod baseline;
mod conform;
mod contract;
mod harness;
mod manifest;
mod model;
mod structure;
mod tests_rules;
mod vocabulary;

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;

use allow::{FileAllows, MarkerKind};
use model::{Level, RULES, Violation, crate_of, discover_crates, discover_files, display_path};

const USAGE: &str = "\
Usage: cargo flight-lint <command> [options]

Commands:
  check     [--crate C]... [--baseline F] [--write-baseline F] [--deny-warnings]
  fix       [--crate C]...                                  reorder sections, fns, impl methods, test modules; regenerate tests/main.rs
  conform   <ts-packages-dir> [--crate C]... [--baseline F] [--write-baseline F]
  manifest  (--write | --check) [--crate C]... [--dir D]     (default dir: agents/manifests)
  allows    [--crate C]... [--rule R]                         list allow markers and reasons
  rules                                                        list rules and levels
  vocabulary                                                   print the IR vocabulary table

`--crate` takes a crate directory name, e.g. `flight-geometry`. Repeatable.
";

struct Options {
    positional: Vec<String>,
    crates: Vec<String>,
    baseline: Option<PathBuf>,
    write_baseline: Option<PathBuf>,
    deny_warnings: bool,
    write: bool,
    check: bool,
    dir: PathBuf,
    rule: Option<String>,
}

fn parse_options(args: &[String]) -> Options {
    let mut o = Options {
        positional: Vec::new(),
        crates: Vec::new(),
        baseline: None,
        write_baseline: None,
        deny_warnings: false,
        write: false,
        check: false,
        dir: PathBuf::from("agents/manifests"),
        rule: None,
    };
    let mut i = 0;
    while i < args.len() {
        let a = args[i].as_str();
        let mut value = || {
            i += 1;
            match args.get(i) {
                Some(v) => v.clone(),
                None => {
                    eprintln!("{} needs a value\n\n{}", a, USAGE);
                    process::exit(2);
                }
            }
        };
        match a {
            "--crate" => {
                let v = value();
                o.crates.push(v);
            }
            "--baseline" => o.baseline = Some(PathBuf::from(value())),
            "--write-baseline" => o.write_baseline = Some(PathBuf::from(value())),
            "--dir" => o.dir = PathBuf::from(value()),
            "--rule" => o.rule = Some(value()),
            "--deny-warnings" => o.deny_warnings = true,
            "--write" => o.write = true,
            "--check" => o.check = true,
            _ if a.starts_with("--") => {
                eprintln!("unknown option {}\n\n{}", a, USAGE);
                process::exit(2);
            }
            _ => o.positional.push(a.to_string()),
        }
        i += 1;
    }
    return o;
}

fn main() {
    let raw_args: Vec<String> = env::args().collect();

    // When invoked as `cargo flight-lint`, cargo passes "flight-lint" as argv[1].
    let args: &[String] = if raw_args.get(1).map(|s| s.as_str()) == Some("flight-lint") {
        &raw_args[2..]
    } else {
        &raw_args[1..]
    };

    let command = args.first().map(|s| s.as_str()).unwrap_or("check");
    let opts = parse_options(args.get(1..).unwrap_or(&[]));

    match command {
        "check" => cmd_check(&opts),
        "fix" => cmd_fix(&opts),
        "conform" => cmd_conform(&opts),
        "manifest" => cmd_manifest(&opts),
        "allows" => cmd_allows(&opts),
        "rules" => cmd_rules(),
        "vocabulary" => vocabulary::print_table(),
        "help" | "--help" | "-h" => print!("{}", USAGE),
        _ => {
            eprintln!("{}", USAGE);
            process::exit(2);
        }
    }
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

fn cmd_check(opts: &Options) {
    let files = discover_files(&opts.crates);
    let sources: Vec<(PathBuf, String)> = files
        .iter()
        .filter_map(|f| match fs::read_to_string(f) {
            Ok(s) => Some((f.clone(), s)),
            Err(e) => {
                eprintln!("warning: {}: {}", f.display(), e);
                None
            }
        })
        .collect();

    // The free-function index spans the whole workspace so sugar may delegate across crates.
    let mut index = contract::Index::default();
    for f in discover_files(&[]) {
        if let Ok(src) = fs::read_to_string(&f)
            && let Ok(parsed) = syn::parse_file(&src)
        {
            contract::index_file(&mut index, &crate_of(&f), &parsed);
        }
    }

    let mut violations = Vec::new();
    for (path, source) in &sources {
        violations.extend(structure::check_file(path, source));
        let allows = FileAllows::new(source);
        violations.extend(allows.marker_violations(path));
        if let Ok(parsed) = syn::parse_file(source) {
            violations.extend(contract::check_contract(
                path,
                &crate_of(path),
                &parsed,
                &allows,
                &index,
            ));
        }
    }
    violations.extend(tests_rules::check_all_tests(&files));

    finish(violations, opts, "cargo flight-lint check baseline");
}

/// Prints violations, applies the baseline, and exits non-zero on errors.
fn finish(violations: Vec<Violation>, opts: &Options, header: &str) {
    if let Some(path) = &opts.write_baseline {
        match baseline::write(path, &violations, header) {
            Ok(()) => println!("Wrote {} entr(ies) to {}.", violations.len(), path.display()),
            Err(e) => {
                eprintln!("error: {}", e);
                process::exit(2);
            }
        }
        return;
    }

    let (violations, known, stale) = match &opts.baseline {
        Some(path) => match baseline::read(path) {
            Ok(mut b) => {
                // A crate-scoped run only answers for those crates' baseline entries.
                if !opts.crates.is_empty() {
                    b.retain(|key, _| {
                        let file = key.split('\t').nth(1).unwrap_or("");
                        opts.crates.iter().any(|c| {
                            let dir = format!("crates/{}", c);
                            file == dir || file.starts_with(&format!("{}/", dir))
                        })
                    });
                }
                baseline::filter(violations, &b)
            }
            Err(e) => {
                eprintln!("error: {}", e);
                process::exit(2);
            }
        },
        None => (violations, 0, 0),
    };

    let mut errors = 0;
    let mut warnings = 0;
    for v in &violations {
        let tag = match v.level() {
            Level::Error => {
                errors += 1;
                "error"
            }
            Level::Warn => {
                warnings += 1;
                "warn"
            }
        };
        eprintln!(
            "{}:{}: {} [{}] {}",
            display_path(&v.file),
            v.line,
            tag,
            v.rule,
            v.message
        );
    }

    if opts.baseline.is_some() {
        eprintln!(
            "\n{} baselined, {} new error(s), {} new warning(s).",
            known, errors, warnings
        );
        if stale > 0 {
            eprintln!(
                "{} baseline entr(ies) no longer occur; tighten the ratchet with --write-baseline.",
                stale
            );
        }
    } else if violations.is_empty() {
        println!("All checks passed.");
    } else {
        eprintln!("\n{} error(s), {} warning(s).", errors, warnings);
    }

    if errors > 0 || (opts.deny_warnings && warnings > 0) {
        process::exit(1);
    }
}

// ---------------------------------------------------------------------------
// fix
// ---------------------------------------------------------------------------

fn cmd_fix(opts: &Options) {
    let files = discover_files(&opts.crates);
    let mut count = 0;
    for file in &files {
        match fs::read_to_string(file) {
            Ok(source) => {
                if let Some(fixed) = structure::fix_file(&source)
                    && fixed != source
                {
                    fs::write(file, &fixed).expect("write failed");
                    println!("Fixed: {}", file.display());
                    count += 1;
                }
            }
            Err(e) => eprintln!("warning: {}: {}", file.display(), e),
        }
        // The paired test file: test modules in alphabetical order (`test-module-order`).
        if let Some(test_file) = tests_rules::paired_test_path(file)
            && let Ok(source) = fs::read_to_string(&test_file)
            && let Some(fixed) = tests_rules::fix_test_module_order(&source)
            && fixed != source
        {
            fs::write(&test_file, &fixed).expect("write failed");
            println!("Fixed: {}", test_file.display());
            count += 1;
        }
    }
    // Each crate's test harness: one binary and one wrapper module named after the crate.
    for name in discover_crates(&opts.crates) {
        let crate_dir = Path::new("crates").join(&name);
        if !crate_dir.join("tests").join("main.rs").exists() {
            continue;
        }
        for path in harness::fix_harness(&crate_dir) {
            println!("Fixed: {}", path.display());
            count += 1;
        }
    }
    if count == 0 {
        println!("Nothing to fix.");
    } else {
        println!("Fixed {} file(s).", count);
    }
}

// ---------------------------------------------------------------------------
// conform
// ---------------------------------------------------------------------------

fn cmd_conform(opts: &Options) {
    let Some(ts_root) = opts.positional.first() else {
        eprintln!("{}", USAGE);
        process::exit(2);
    };
    let ts_root = Path::new(ts_root);
    let crates = discover_crates(&opts.crates);
    let single = crates.len() == 1;
    let mut violations = Vec::new();
    for c in &crates {
        match conform::ts_src_for(ts_root, c, single) {
            Some(ts_src) => violations.extend(conform::conform_crate(c, &ts_src)),
            None => eprintln!("note: no TS package for `{}` under {}", c, ts_root.display()),
        }
    }
    finish(violations, opts, "cargo flight-lint conform baseline");
}

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------

fn cmd_manifest(opts: &Options) {
    if opts.write == opts.check {
        eprintln!("manifest needs exactly one of --write or --check\n\n{}", USAGE);
        process::exit(2);
    }
    let mut failed = false;
    for c in discover_crates(&opts.crates) {
        for (ext, text) in [("api", manifest::api_manifest(&c)), ("tests", manifest::test_manifest(&c))] {
            let path = opts.dir.join(format!("{}.{}", c, ext));
            if opts.write {
                if let Err(e) = fs::create_dir_all(&opts.dir).and_then(|_| fs::write(&path, &text)) {
                    eprintln!("error: {}: {}", path.display(), e);
                    process::exit(2);
                }
                println!("Wrote {}", display_path(&path));
                continue;
            }
            match manifest::compare(&path, &text) {
                manifest::ManifestStatus::Same => {}
                manifest::ManifestStatus::Missing => {
                    failed = true;
                    eprintln!("{}: missing (run `manifest --write --crate {}`)", display_path(&path), c);
                }
                manifest::ManifestStatus::Differs { added, removed } => {
                    failed = true;
                    eprintln!("{}: differs from the frozen manifest", display_path(&path));
                    for l in removed {
                        eprintln!("  - {}", l);
                    }
                    for l in added {
                        eprintln!("  + {}", l);
                    }
                }
            }
        }
    }
    if failed {
        eprintln!("\nManifest changes alter the frozen contract; they need user approval.");
        process::exit(1);
    }
    if opts.check {
        println!("Manifests match.");
    }
}

// ---------------------------------------------------------------------------
// allows / rules
// ---------------------------------------------------------------------------

fn cmd_allows(opts: &Options) {
    for f in discover_files(&opts.crates) {
        let Ok(source) = fs::read_to_string(&f) else {
            continue;
        };
        let allows = FileAllows::new(&source);
        for m in &allows.markers {
            if let Some(r) = &opts.rule
                && !m.names.iter().any(|n| n == r)
            {
                continue;
            }
            let kind = match m.kind {
                MarkerKind::Item => "allow",
                MarkerKind::File => "allow-file",
                MarkerKind::ConformSkip => "conform-skip",
            };
            let item = source
                .lines()
                .skip(m.line)
                .map(|l| l.trim())
                .find(|l| !l.starts_with("//") && !l.starts_with('#') && !l.is_empty())
                .unwrap_or("");
            println!(
                "{}:{}: {}({}) {} | {}",
                display_path(&f),
                m.line,
                kind,
                m.names.join(", "),
                m.reason,
                item
            );
        }
    }
}

fn cmd_rules() {
    println!("| Rule | Level | Scope | Description |");
    println!("|------|-------|-------|-------------|");
    for r in RULES {
        let level = match r.level {
            Level::Error => "error",
            Level::Warn => "warn",
        };
        println!("| `{}` | {} | {} | {} |", r.name, level, r.scope, r.description);
    }
}
