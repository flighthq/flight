use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{self, Command};

const USAGE: &str = "\
Usage: flight-compile generate --source <rust-file> --out <typescript-file> [--entity-module <specifier>] [--alias-source <rust-file> ...] [--external-alias-source <rust-file> --external-alias-module <specifier> ...] [--visibility-source <rust-file> ...] [--crate-root <crate-name>=<rust-file> ...] [--check]
       flight-compile generate-tests --source <rust-test-file> --out <vitest-file> --contract-module <specifier> [--contract-source <rust-file>] [--alias-source <rust-file> ...] [--external-alias-source <rust-file> --external-alias-module <specifier> ...] [--check]
       flight-compile source-mode --source <rust-file>
       flight-compile root-only --source <rust-file>
";

#[derive(Clone, Copy)]
enum GenerateKind {
    Source,
    Tests,
}

struct GenerateOptions {
    alias_sources: Vec<PathBuf>,
    check: bool,
    contract_module: Option<String>,
    contract_source: Option<PathBuf>,
    crate_roots: Vec<ExplicitCrateRoot>,
    entity_module: Option<String>,
    external_alias_modules: Vec<String>,
    external_alias_sources: Vec<PathBuf>,
    out: PathBuf,
    source: PathBuf,
    visibility_sources: Vec<PathBuf>,
}

struct ExplicitCrateRoot {
    crate_name: String,
    path: PathBuf,
}

struct OwnedCrateRoot {
    crate_name: String,
    path: String,
}

fn canonical_path(path: &Path) -> Result<PathBuf, String> {
    return fs::canonicalize(path).map_err(|error| format!("{}: {error}", path.display()));
}

fn discover_crate_roots<'a>(
    sources: impl Iterator<Item = &'a PathBuf>,
    explicit: &[ExplicitCrateRoot],
) -> Result<Vec<OwnedCrateRoot>, String> {
    let sources = sources.collect::<Vec<_>>();
    let mut roots = std::collections::BTreeMap::<PathBuf, String>::new();
    let insert = |roots: &mut std::collections::BTreeMap<PathBuf, String>,
                  path: PathBuf,
                  crate_name: String|
     -> Result<(), String> {
        if let Some(existing) = roots.get(&path)
            && existing != &crate_name
        {
            return Err(format!(
                "crate root {} is designated as both `{existing}` and `{crate_name}`",
                path.display()
            ));
        }
        roots.insert(path, crate_name);
        return Ok(());
    };
    for root in explicit {
        insert(
            &mut roots,
            canonical_path(&root.path)?,
            root.crate_name.clone(),
        )?;
    }
    let manifests = sources
        .iter()
        .filter_map(|source| nearest_manifest(source))
        .collect::<std::collections::BTreeSet<_>>();
    for manifest in manifests {
        let cargo = env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
        let output = Command::new(cargo)
            .args([
                "metadata",
                "--format-version",
                "1",
                "--no-deps",
                "--manifest-path",
            ])
            .arg(&manifest)
            .output()
            .map_err(|error| {
                format!(
                    "failed to discover Cargo targets from {}: {error}",
                    manifest.display()
                )
            })?;
        if !output.status.success() {
            return Err(format!(
                "failed to discover Cargo targets from {}: {}",
                manifest.display(),
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        let metadata: serde_json::Value =
            serde_json::from_slice(&output.stdout).map_err(|error| {
                format!("invalid Cargo metadata for {}: {error}", manifest.display())
            })?;
        let manifest = canonical_path(&manifest)?;
        let Some(packages) = metadata
            .get("packages")
            .and_then(serde_json::Value::as_array)
        else {
            return Err("Cargo metadata has no packages array".to_string());
        };
        for package in packages {
            let Some(package_manifest) = package
                .get("manifest_path")
                .and_then(serde_json::Value::as_str)
            else {
                continue;
            };
            if canonical_path(Path::new(package_manifest))? != manifest {
                continue;
            }
            let Some(targets) = package.get("targets").and_then(serde_json::Value::as_array) else {
                continue;
            };
            for target in targets {
                let supported = target
                    .get("kind")
                    .and_then(serde_json::Value::as_array)
                    .is_some_and(|kinds| {
                        kinds.iter().any(|kind| {
                            matches!(
                                kind.as_str(),
                                Some(
                                    "lib"
                                        | "rlib"
                                        | "dylib"
                                        | "cdylib"
                                        | "staticlib"
                                        | "proc-macro"
                                        | "bin"
                                )
                            )
                        })
                    });
                if !supported {
                    continue;
                }
                let (Some(crate_name), Some(source_path)) = (
                    target.get("name").and_then(serde_json::Value::as_str),
                    target.get("src_path").and_then(serde_json::Value::as_str),
                ) else {
                    continue;
                };
                if !valid_crate_name(crate_name) {
                    return Err(format!(
                        "Cargo target name `{crate_name}` is not a Rust crate name"
                    ));
                }
                insert(
                    &mut roots,
                    canonical_path(Path::new(source_path))?,
                    crate_name.to_string(),
                )?;
            }
        }
    }
    return Ok(roots
        .into_iter()
        .map(|(path, crate_name)| OwnedCrateRoot {
            crate_name,
            path: path.to_string_lossy().into_owned(),
        })
        .collect());
}

fn generate(options: &GenerateOptions, kind: GenerateKind) -> Result<(), String> {
    let source = fs::read_to_string(&options.source)
        .map_err(|error| format!("{}: {error}", options.source.display()))?;
    let output = match kind {
        GenerateKind::Source => {
            let alias_sources = options
                .alias_sources
                .iter()
                .map(|path| {
                    fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let alias_source_refs = alias_sources.iter().map(String::as_str).collect::<Vec<_>>();
            let external_alias_sources = options
                .external_alias_sources
                .iter()
                .map(|path| {
                    fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let external_aliases = external_alias_sources
                .iter()
                .zip(&options.external_alias_modules)
                .map(|(source, module)| flight_compiler::ExternalAliasSource { source, module })
                .collect::<Vec<_>>();
            let source_path = options.source.to_string_lossy();
            let alias_paths = options
                .alias_sources
                .iter()
                .map(|path| path.to_string_lossy())
                .collect::<Vec<_>>();
            let alias_modules = alias_paths
                .iter()
                .zip(&alias_source_refs)
                .map(|(path, source)| flight_compiler::ModuleSource { path, source })
                .collect::<Vec<_>>();
            let visibility_sources = options
                .visibility_sources
                .iter()
                .map(|path| {
                    fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let visibility_paths = options
                .visibility_sources
                .iter()
                .map(|path| path.to_string_lossy())
                .collect::<Vec<_>>();
            let visibility_source_refs = visibility_paths
                .iter()
                .zip(&visibility_sources)
                .map(|(path, source)| flight_compiler::ModuleSource { path, source })
                .collect::<Vec<_>>();
            let crate_roots = discover_crate_roots(
                std::iter::once(&options.source)
                    .chain(&options.alias_sources)
                    .chain(&options.visibility_sources),
                &options.crate_roots,
            )?;
            let crate_root_refs = crate_roots
                .iter()
                .map(|root| flight_compiler::CrateRootSource {
                    crate_name: &root.crate_name,
                    path: &root.path,
                })
                .collect::<Vec<_>>();
            flight_compiler::compile_typescript_with_visibility_sources_and_crate_roots(
                flight_compiler::ModuleSource {
                    path: &source_path,
                    source: &source,
                },
                options.entity_module.as_deref(),
                &alias_modules,
                &external_aliases,
                &visibility_source_refs,
                &crate_root_refs,
            )
        }
        GenerateKind::Tests => {
            let alias_sources = options
                .alias_sources
                .iter()
                .map(|path| {
                    fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let alias_modules = options
                .alias_sources
                .iter()
                .map(|path| path.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            let alias_source_refs = alias_sources
                .iter()
                .zip(&alias_modules)
                .map(|(source, module)| flight_compiler::VitestAliasSource { source, module })
                .collect::<Vec<_>>();
            let contract_module = options
                .contract_module
                .as_deref()
                .ok_or_else(|| format!("--contract-module is required\n\n{USAGE}"))?;
            let contract_source = options
                .contract_source
                .as_ref()
                .map(|contract_path| {
                    fs::read_to_string(contract_path)
                        .map_err(|error| format!("{}: {error}", contract_path.display()))
                })
                .transpose()?;
            let external_alias_sources = options
                .external_alias_sources
                .iter()
                .map(|path| {
                    fs::read_to_string(path).map_err(|error| format!("{}: {error}", path.display()))
                })
                .collect::<Result<Vec<_>, _>>()?;
            let external_aliases = external_alias_sources
                .iter()
                .zip(&options.external_alias_modules)
                .map(|(source, module)| flight_compiler::ExternalAliasSource { source, module })
                .collect::<Vec<_>>();
            flight_compiler::compile_vitest_with_external_alias_sources(
                &source,
                contract_module,
                contract_source.as_deref(),
                &alias_source_refs,
                &external_aliases,
            )
        }
    }
    .map_err(|error| error.to_string())?;
    if options.check {
        let existing = fs::read_to_string(&options.out)
            .map_err(|error| format!("{}: {error}", options.out.display()))?;
        if existing != output {
            return Err(format!(
                "{} is stale; rerun flight-compile without --check",
                options.out.display()
            ));
        }
        return Ok(());
    }
    return write_atomic(&options.out, output.as_bytes());
}

fn main() {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    let result = match arguments.first().map(String::as_str) {
        Some("generate") => parse_generate_options(&arguments[1..], GenerateKind::Source)
            .and_then(|options| generate(&options, GenerateKind::Source)),
        Some("generate-tests") => parse_generate_options(&arguments[1..], GenerateKind::Tests)
            .and_then(|options| generate(&options, GenerateKind::Tests)),
        Some("source-mode") => source_mode(&arguments[1..]),
        Some("root-only") => root_only(&arguments[1..]),
        Some("help" | "--help" | "-h") => {
            print!("{USAGE}");
            return;
        }
        _ => Err(USAGE.trim_end().to_string()),
    };
    if let Err(error) = result {
        eprintln!("error: {error}");
        process::exit(2);
    }
}

fn nearest_manifest(source: &Path) -> Option<PathBuf> {
    let source = fs::canonicalize(source).ok()?;
    return source.parent()?.ancestors().find_map(|directory| {
        let manifest = directory.join("Cargo.toml");
        manifest.is_file().then_some(manifest)
    });
}

fn parse_generate_options(
    arguments: &[String],
    kind: GenerateKind,
) -> Result<GenerateOptions, String> {
    let mut check = false;
    let mut alias_sources = Vec::new();
    let mut contract_module = None;
    let mut contract_source = None;
    let mut crate_roots = Vec::new();
    let mut entity_module = None;
    let mut external_alias_modules = Vec::new();
    let mut external_alias_sources = Vec::new();
    let mut visibility_sources = Vec::new();
    let mut out = None;
    let mut source = None;
    let mut index = 0;
    while index < arguments.len() {
        match arguments[index].as_str() {
            "--check" => check = true,
            "--alias-source" => {
                index += 1;
                let path = arguments
                    .get(index)
                    .ok_or_else(|| format!("--alias-source requires a path\n\n{USAGE}"))?;
                alias_sources.push(PathBuf::from(path));
            }
            "--contract-module" => {
                index += 1;
                contract_module = arguments.get(index).cloned();
            }
            "--contract-source" => {
                index += 1;
                contract_source =
                    Some(PathBuf::from(arguments.get(index).ok_or_else(|| {
                        format!("--contract-source requires a path\n\n{USAGE}")
                    })?));
            }
            "--crate-root" => {
                index += 1;
                let designation = arguments.get(index).ok_or_else(|| {
                    format!("--crate-root requires <crate-name>=<path>\n\n{USAGE}")
                })?;
                let (crate_name, path) = designation.split_once('=').ok_or_else(|| {
                    format!("--crate-root requires <crate-name>=<path>\n\n{USAGE}")
                })?;
                if !valid_crate_name(crate_name) || path.is_empty() {
                    return Err(format!(
                        "invalid --crate-root designation `{designation}`; expected <crate-name>=<path>\n\n{USAGE}"
                    ));
                }
                crate_roots.push(ExplicitCrateRoot {
                    crate_name: crate_name.to_string(),
                    path: PathBuf::from(path),
                });
            }
            "--external-alias-module" => {
                index += 1;
                let module = arguments.get(index).cloned().ok_or_else(|| {
                    format!("--external-alias-module requires a specifier\n\n{USAGE}")
                })?;
                external_alias_modules.push(module);
            }
            "--external-alias-source" => {
                index += 1;
                let path = arguments
                    .get(index)
                    .ok_or_else(|| format!("--external-alias-source requires a path\n\n{USAGE}"))?;
                external_alias_sources.push(PathBuf::from(path));
            }
            "--entity-module" => {
                index += 1;
                entity_module = arguments.get(index).cloned();
            }
            "--out" => {
                index += 1;
                out = arguments.get(index).map(PathBuf::from);
            }
            "--source" => {
                index += 1;
                source = arguments.get(index).map(PathBuf::from);
            }
            "--visibility-source" => {
                index += 1;
                let path = arguments
                    .get(index)
                    .ok_or_else(|| format!("--visibility-source requires a path\n\n{USAGE}"))?;
                visibility_sources.push(PathBuf::from(path));
            }
            argument => return Err(format!("unknown generate option `{argument}`\n\n{USAGE}")),
        }
        index += 1;
    }
    match kind {
        GenerateKind::Source if contract_module.is_some() || contract_source.is_some() => {
            return Err(format!(
                "contract options are only valid for generate-tests\n\n{USAGE}"
            ));
        }
        GenerateKind::Tests if !visibility_sources.is_empty() => {
            return Err(format!(
                "--visibility-source is only valid for generate\n\n{USAGE}"
            ));
        }
        GenerateKind::Tests if !crate_roots.is_empty() => {
            return Err(format!(
                "--crate-root is only valid for generate\n\n{USAGE}"
            ));
        }
        GenerateKind::Tests if entity_module.is_some() => {
            return Err(format!(
                "--entity-module is only valid for generate\n\n{USAGE}"
            ));
        }
        GenerateKind::Source | GenerateKind::Tests => {}
    }
    if external_alias_sources.len() != external_alias_modules.len() {
        return Err(format!(
            "--external-alias-source and --external-alias-module must be provided the same number of times\n\n{USAGE}"
        ));
    }
    return Ok(GenerateOptions {
        alias_sources,
        check,
        contract_module,
        contract_source,
        crate_roots,
        entity_module,
        external_alias_modules,
        external_alias_sources,
        out: out.ok_or_else(|| format!("--out is required\n\n{USAGE}"))?,
        source: source.ok_or_else(|| format!("--source is required\n\n{USAGE}"))?,
        visibility_sources,
    });
}

fn root_only(arguments: &[String]) -> Result<(), String> {
    let [flag, source] = arguments else {
        return Err(format!(
            "root-only requires --source <rust-file>\n\n{USAGE}"
        ));
    };
    if flag != "--source" {
        return Err(format!("unknown root-only option `{flag}`\n\n{USAGE}"));
    }
    let source = fs::read_to_string(source).map_err(|error| format!("{source}: {error}"))?;
    let names = flight_compiler::root_only_names(&source).map_err(|error| error.to_string())?;
    for name in names {
        println!("{name}");
    }
    return Ok(());
}

fn source_mode(arguments: &[String]) -> Result<(), String> {
    let [flag, source] = arguments else {
        return Err(format!(
            "source-mode requires --source <rust-file>\n\n{USAGE}"
        ));
    };
    if flag != "--source" {
        return Err(format!("unknown source-mode option `{flag}`\n\n{USAGE}"));
    }
    let source = fs::read_to_string(source).map_err(|error| format!("{source}: {error}"))?;
    let mode = flight_compiler::source_mode(&source).map_err(|error| error.to_string())?;
    println!(
        "{}",
        match mode {
            flight_compiler::SourceMode::Generate => "generate",
            flight_compiler::SourceMode::RustOnly => "rust-only",
            flight_compiler::SourceMode::TargetNative => "target-native",
        }
    );
    return Ok(());
}

fn valid_crate_name(name: &str) -> bool {
    return !name.is_empty()
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'));
}

fn write_atomic(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent).map_err(|error| format!("{}: {error}", parent.display()))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("{} has no UTF-8 file name", path.display()))?;
    let temporary = parent.join(format!(".{file_name}.{}.tmp", process::id()));
    fs::write(&temporary, contents).map_err(|error| format!("{}: {error}", temporary.display()))?;
    fs::rename(&temporary, path).map_err(|error| format!("{}: {error}", path.display()))?;
    return Ok(());
}
