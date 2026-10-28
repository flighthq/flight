use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process;

const USAGE: &str = "\
Usage: flight-compile generate --source <rust-file> --out <typescript-file> [--check]
       flight-compile generate-tests --source <rust-test-file> --out <vitest-file> [--check]
";

enum GenerateKind {
    Source,
    Tests,
}

struct GenerateOptions {
    check: bool,
    out: PathBuf,
    source: PathBuf,
}

fn generate(options: &GenerateOptions, kind: GenerateKind) -> Result<(), String> {
    let source = fs::read_to_string(&options.source)
        .map_err(|error| format!("{}: {error}", options.source.display()))?;
    let output = match kind {
        GenerateKind::Source => flight_compiler::compile_typescript(&source),
        GenerateKind::Tests => flight_compiler::compile_vitest(&source),
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
        Some("generate") => parse_generate_options(&arguments[1..])
            .and_then(|options| generate(&options, GenerateKind::Source)),
        Some("generate-tests") => parse_generate_options(&arguments[1..])
            .and_then(|options| generate(&options, GenerateKind::Tests)),
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

fn parse_generate_options(arguments: &[String]) -> Result<GenerateOptions, String> {
    let mut check = false;
    let mut out = None;
    let mut source = None;
    let mut index = 0;
    while index < arguments.len() {
        match arguments[index].as_str() {
            "--check" => check = true,
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
    return Ok(GenerateOptions {
        check,
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
