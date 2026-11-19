// flight-bindgen is a binary crate, so its self-contained CLI module is compiled into this test
// crate directly.
#[path = "../src/cli.rs"]
mod cli;

use std::path::PathBuf;

use cli::*;

mod parse_bindgen_args {
    use super::*;

    #[test]
    fn accepts_every_known_flag() {
        let options = parse_bindgen_args(&args(&[
            "--target",
            "haxe",
            "--out",
            "out",
            "--offsets",
            "offsets.json",
            "--ffi-dir",
            "ffi",
        ]))
        .unwrap();
        assert_eq!(
            options,
            BindgenOptions {
                target: "haxe".into(),
                out_dir: PathBuf::from("out"),
                offsets: Some(PathBuf::from("offsets.json")),
                ffi_dir: Some(PathBuf::from("ffi")),
                help: false,
            }
        );
    }
    #[test]
    fn defaults_to_the_hashlink_target_and_its_output_directory() {
        let options = parse_bindgen_args(&[]).unwrap();
        assert_eq!(options.target, "haxe-hl");
        assert_eq!(options.out_dir, PathBuf::from("generated").join("haxe-hl"));
        assert_eq!(options.ffi_dir, None);
    }
    #[test]
    fn rejects_the_retired_ffi_names_flag() {
        assert_eq!(
            parse_bindgen_args(&args(&["--ffi-names", "names.txt"])),
            Err("unknown argument `--ffi-names`".to_string())
        );
    }
    #[test]
    fn rejects_unknown_flags_positionals_duplicates_and_missing_values() {
        assert!(parse_bindgen_args(&args(&["--verbose"])).is_err());
        assert!(parse_bindgen_args(&args(&["haxe"])).is_err());
        assert_eq!(
            parse_bindgen_args(&args(&["--out", "a", "--out", "b"])),
            Err("`--out` given more than once".to_string())
        );
        assert_eq!(
            parse_bindgen_args(&args(&["--ffi-dir"])),
            Err("`--ffi-dir` requires a value".to_string())
        );
        assert_eq!(
            parse_bindgen_args(&args(&["--ffi-dir", "--target", "haxe"])),
            Err("`--ffi-dir` requires a value, got option `--target`".to_string())
        );
    }
    #[test]
    fn rejects_a_repeated_help_flag_in_either_spelling() {
        for repeated in [
            ["--help", "--help"],
            ["-h", "--help"],
            ["--help", "-h"],
            ["-h", "-h"],
        ] {
            let error = parse_bindgen_args(&args(&repeated)).unwrap_err();
            assert!(
                error.contains("given more than once"),
                "{repeated:?}: {error}"
            );
        }
    }
    #[test]
    fn rejects_every_option_token_used_as_a_value() {
        for flag in ["--target", "--out", "--offsets", "--ffi-dir"] {
            for token in ["-h", "--help", "--out", "--ffi-names", "-x"] {
                assert_eq!(
                    parse_bindgen_args(&args(&[flag, token])),
                    Err(format!("`{flag}` requires a value, got option `{token}`")),
                    "{flag} {token}"
                );
            }
        }
    }
    #[test]
    fn accepts_a_lone_help_in_either_spelling() {
        assert!(parse_bindgen_args(&args(&["-h"])).unwrap().help);
        assert!(parse_bindgen_args(&args(&["--help"])).unwrap().help);
    }
    #[test]
    fn rejects_an_unknown_target() {
        let error = parse_bindgen_args(&args(&["--target", "haxe-lua"])).unwrap_err();
        assert!(error.starts_with("unknown target `haxe-lua`"), "{error}");
    }
    #[test]
    fn help_is_reported_and_usage_names_every_flag() {
        assert!(parse_bindgen_args(&args(&["--help"])).unwrap().help);
        for flag in ["--target", "--out", "--offsets", "--ffi-dir", "--help"] {
            assert!(BINDGEN_USAGE.contains(flag), "{flag}");
        }
        assert!(!BINDGEN_USAGE.contains("--ffi-names"));
        assert_eq!(BINDGEN_TARGETS, ["haxe-hl", "haxe-cpp", "haxe-js", "haxe"]);
    }
}

fn args(values: &[&str]) -> Vec<String> {
    return values.iter().map(|value| value.to_string()).collect();
}
