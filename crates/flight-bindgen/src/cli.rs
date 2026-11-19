use std::path::PathBuf;

#[derive(Debug, PartialEq)]
pub struct BindgenOptions {
    pub target: String,
    pub out_dir: PathBuf,
    pub offsets: Option<PathBuf>,
    pub ffi_dir: Option<PathBuf>,
    pub help: bool,
}

// Parses the arguments after the program name. Every flag must be known and appear at most once
// (`-h` and `--help` are one flag), and every value flag must carry a value that is not itself an
// option token: a stale or misspelled flag (the retired `--ffi-names`) or a swallowed flag
// (`--out -h`) is an error instead of silently producing unfiltered or misplaced output.
pub fn parse_bindgen_args(args: &[String]) -> Result<BindgenOptions, String> {
    let mut target: Option<String> = None;
    let mut out_dir: Option<PathBuf> = None;
    let mut offsets: Option<PathBuf> = None;
    let mut ffi_dir: Option<PathBuf> = None;
    let mut help = false;
    let mut index = 0;
    while index < args.len() {
        let flag = args[index].as_str();
        if flag == "--help" || flag == "-h" {
            if help {
                return Err(format!(
                    "`{flag}` given more than once (`-h` and `--help` are one flag)"
                ));
            }
            help = true;
            index += 1;
            continue;
        }
        let slot_is_set = match flag {
            "--target" => target.is_some(),
            "--out" => out_dir.is_some(),
            "--offsets" => offsets.is_some(),
            "--ffi-dir" => ffi_dir.is_some(),
            _ => return Err(format!("unknown argument `{flag}`")),
        };
        if slot_is_set {
            return Err(format!("`{flag}` given more than once"));
        }
        let Some(value) = args.get(index + 1) else {
            return Err(format!("`{flag}` requires a value"));
        };
        if value.starts_with('-') {
            return Err(format!("`{flag}` requires a value, got option `{value}`"));
        }
        match flag {
            "--target" => target = Some(value.clone()),
            "--out" => out_dir = Some(PathBuf::from(value)),
            "--offsets" => offsets = Some(PathBuf::from(value)),
            _ => ffi_dir = Some(PathBuf::from(value)),
        }
        index += 2;
    }
    let target = target.unwrap_or_else(|| "haxe-hl".to_string());
    if !BINDGEN_TARGETS.contains(&target.as_str()) {
        return Err(format!(
            "unknown target `{target}`; available targets: {}",
            BINDGEN_TARGETS.join(", ")
        ));
    }
    let out_dir = out_dir.unwrap_or_else(|| PathBuf::from("generated").join(&target));
    return Ok(BindgenOptions {
        target,
        out_dir,
        offsets,
        ffi_dir,
        help,
    });
}

pub const BINDGEN_TARGETS: &[&str] = &["haxe-hl", "haxe-cpp", "haxe-js", "haxe"];

pub const BINDGEN_USAGE: &str = "\
usage: flight-bindgen [--target <target>] [--out <dir>] [--offsets <offsets.json>] [--ffi-dir <dir>]

  --target   haxe-hl (default), haxe-cpp, haxe-js, or haxe (all three)
  --out      output directory (default: generated/<target>)
  --offsets  struct layout JSON emitted by flight-offsets
  --ffi-dir  flight-ffi build output holding flight_ffi.h and flight_hl.c; native externs are
             filtered by, policy-checked against, and verified against that surface
  --help     print this message (also -h)

Each flag may appear once, and a value may not start with `-` (write `./-name` for such a path).";
