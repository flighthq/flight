use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;

const USAGE: &str = "\
Usage: flight-compile generate --source <rust-file> --out <typescript-file> [--entity-module <specifier>] [--alias-source <rust-file> ...] [--check]
       flight-compile generate-tests --source <rust-test-file> --out <vitest-file> --contract-module <specifier> [--alias-source <rust-file> ...] [--check]
       flight-compile source-mode --source <rust-file>
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
    entity_module: Option<String>,
    out: PathBuf,
    source: PathBuf,
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
            flight_compiler::compile_typescript_with_alias_sources(
                &source,
                options.entity_module.as_deref(),
                &alias_source_refs,
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
            let alias_source_refs = alias_sources.iter().map(String::as_str).collect::<Vec<_>>();
            flight_compiler::compile_vitest_with_alias_sources(
                &source,
                options
                    .contract_module
                    .as_deref()
                    .ok_or_else(|| format!("--contract-module is required\n\n{USAGE}"))?,
                &alias_source_refs,
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

fn parse_generate_options(
    arguments: &[String],
    kind: GenerateKind,
) -> Result<GenerateOptions, String> {
    let mut check = false;
    let mut alias_sources = Vec::new();
    let mut contract_module = None;
    let mut entity_module = None;
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
            argument => return Err(format!("unknown generate option `{argument}`\n\n{USAGE}")),
        }
        index += 1;
    }
    match kind {
        GenerateKind::Source if contract_module.is_some() => {
            return Err(format!(
                "--contract-module is only valid for generate-tests\n\n{USAGE}"
            ));
        }
        GenerateKind::Tests if entity_module.is_some() => {
            return Err(format!(
                "--entity-module is only valid for generate\n\n{USAGE}"
            ));
        }
        GenerateKind::Source | GenerateKind::Tests => {}
    }
    return Ok(GenerateOptions {
        alias_sources,
        check,
        contract_module,
        entity_module,
        out: out.ok_or_else(|| format!("--out is required\n\n{USAGE}"))?,
        source: source.ok_or_else(|| format!("--source is required\n\n{USAGE}"))?,
    });
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
