use std::fs;
use std::path::{Path, PathBuf};

use crate::opentype_backend;

pub(crate) fn find_font_bytes(
    directories: &[String],
    family: &str,
    max_files: usize,
    max_bytes: usize,
) -> Option<Box<[u8]>> {
    let mut pending: Vec<PathBuf> = directories.iter().map(PathBuf::from).collect();
    pending.sort();
    pending.reverse();
    let mut seen_files = 0_usize;
    while let Some(path) = pending.pop() {
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            let Ok(entries) = fs::read_dir(&path) else {
                continue;
            };
            let mut children: Vec<PathBuf> = entries
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .collect();
            children.sort();
            children.reverse();
            pending.extend(children);
            continue;
        }
        if !is_font_path(&path) {
            continue;
        }
        seen_files = seen_files.saturating_add(1);
        if seen_files > max_files || metadata.len() > max_bytes as u64 {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        if opentype_backend::matches_family(&bytes, 0, family) {
            return Some(bytes.into_boxed_slice());
        }
    }
    return None;
}

fn is_font_path(path: &Path) -> bool {
    return path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(extension.to_ascii_lowercase().as_str(), "otf" | "ttc" | "ttf" | "woff")
        });
}
