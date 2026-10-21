//! Full-CLI conform fixtures: the real binary over a temporary workspace and TS package.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

// The pinned textshaper `itemizeText` declaration, verbatim (textShaperItemize.ts:20-25): a `//`
// comment carrying commas and parentheses sits inside the parameter list.
const ITEMIZE_TS: &str = "export function itemizeText(
  text: string,
  // Itemization splits on Unicode script/bidi properties alone and does not consult the font; the
  // parameter is kept for call-site symmetry with shapeTextRuns (both take text, format, options).
  _format: Readonly<TextFormat>,
  options?: Readonly<TextShaperOptions>,
): readonly TextItem[] {
  return [];
}

export function fillValues(out: number[], /* count, (unused) */ count: number): void {}
";

fn workspace(name: &str, rust: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "flight-conform-cli-{}-{}",
        name,
        std::process::id()
    ));
    let _ = fs::remove_dir_all(&root);
    let src = root.join("crates/flight-fixture/src");
    fs::create_dir_all(&src).unwrap();
    fs::write(
        root.join("Cargo.toml"),
        "[workspace]\nmembers = [\"crates/*\"]\n",
    )
    .unwrap();
    fs::write(
        root.join("crates/flight-fixture/Cargo.toml"),
        "[package]\nname = \"flight-fixture\"\nversion = \"0.0.0\"\n",
    )
    .unwrap();
    fs::write(src.join("lib.rs"), rust).unwrap();
    let ts = root.join("ts/fixture/src");
    fs::create_dir_all(&ts).unwrap();
    fs::write(ts.join("textShaperItemize.ts"), ITEMIZE_TS).unwrap();
    fs::write(
        ts.join("index.ts"),
        "export * from './textShaperItemize.ts';\n",
    )
    .unwrap();
    return root;
}

fn conform(root: &Path) -> (i32, String) {
    let output = Command::new(env!("CARGO_BIN_EXE_cargo-flight-lint"))
        .args(["conform", "ts", "--crate", "flight-fixture"])
        .current_dir(root)
        .output()
        .unwrap();
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    return (output.status.code().unwrap_or(-1), text);
}

#[test]
fn the_pinned_itemize_text_comment_conforms() {
    let root = workspace(
        "pass",
        "pub fn itemize_text(text: &str, _format: &str, options: Option<&str>) -> usize {\n    return text.len() + options.map_or(0, str::len);\n}\n\npub fn fill_values(out: &mut Vec<f32>, count: usize) {\n    out.truncate(count);\n}\n",
    );
    let (code, text) = conform(&root);
    assert_eq!(code, 0, "{text}");
    assert!(
        !text.contains("unknown crate") && !text.contains("no TS package"),
        "{text}"
    );
    assert!(!text.contains("conform-params"), "{text}");
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn a_genuinely_wrong_parameter_list_still_fails() {
    let root = workspace(
        "params",
        "pub fn itemize_text(text: &str, options: Option<&str>) -> usize {\n    return text.len() + options.map_or(0, str::len);\n}\n\npub fn fill_values(out: &mut Vec<f32>, count: usize) {\n    out.truncate(count);\n}\n",
    );
    let (code, text) = conform(&root);
    assert_eq!(code, 1, "{text}");
    assert!(
        text.contains(
            "`itemize_text` params (text, options) differ from TS (text, _format, options)"
        ),
        "{text}"
    );
    fs::remove_dir_all(&root).unwrap();
}

#[test]
fn a_numeric_array_mismatch_behind_a_block_comment_still_fails() {
    let root = workspace(
        "array",
        "pub fn itemize_text(text: &str, _format: &str, options: Option<&str>) -> usize {\n    return text.len() + options.map_or(0, str::len);\n}\n\npub fn fill_values(out: &mut [f32], count: usize) {\n    out[..count].fill(0.0);\n}\n",
    );
    let (code, text) = conform(&root);
    assert_eq!(code, 1, "{text}");
    assert!(
        text.contains("conform-array") && text.contains("fill_values"),
        "{text}"
    );
    assert!(!text.contains("conform-params"), "{text}");
    fs::remove_dir_all(&root).unwrap();
}
