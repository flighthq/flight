use std::fs;
use std::path::{Path, PathBuf};

use crate::opentype_backend::{self, BackendLimits};

pub(crate) enum DiscoveryFailure {
    LimitExceeded,
    NotFound,
}

#[cfg(test)]
#[test]
fn children_are_popped_in_lexical_order() {
    let mut pending = Vec::new();
    push_sorted_children(
        &mut pending,
        vec![PathBuf::from("c"), PathBuf::from("a"), PathBuf::from("b")],
    );
    assert_eq!(pending.pop(), Some(PathBuf::from("a")));
    assert_eq!(pending.pop(), Some(PathBuf::from("b")));
    assert_eq!(pending.pop(), Some(PathBuf::from("c")));
}

pub(crate) fn find_font_bytes(
    directories: &[String],
    family: &str,
    max_files: usize,
    max_bytes: usize,
    backend_limits: BackendLimits,
) -> Result<Box<[u8]>, DiscoveryFailure> {
    if directories.len() > max_files {
        return Err(DiscoveryFailure::LimitExceeded);
    }
    let mut pending = Vec::new();
    push_sorted_children(
        &mut pending,
        directories.iter().map(PathBuf::from).collect(),
    );
    let mut visited = 0_usize;
    while let Some(path) = pending.pop() {
        visited = visited
            .checked_add(1)
            .ok_or(DiscoveryFailure::LimitExceeded)?;
        if visited > max_files {
            return Err(DiscoveryFailure::LimitExceeded);
        }
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
            let remaining = max_files
                .saturating_sub(visited)
                .saturating_sub(pending.len());
            let mut children = Vec::new();
            for entry in entries
                .filter_map(Result::ok)
                .take(remaining.saturating_add(1))
            {
                children.push(entry.path());
            }
            if children.len() > remaining {
                return Err(DiscoveryFailure::LimitExceeded);
            }
            push_sorted_children(&mut pending, children);
            continue;
        }
        if !is_font_path(&path) {
            continue;
        }
        if metadata.len() > max_bytes as u64 {
            return Err(DiscoveryFailure::LimitExceeded);
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        if opentype_backend::matches_family(&bytes, 0, family, backend_limits) {
            return Ok(bytes.into_boxed_slice());
        }
    }
    return Err(DiscoveryFailure::NotFound);
}

fn is_font_path(path: &Path) -> bool {
    return path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "otf" | "ttc" | "ttf" | "woff"
            )
        });
}

fn push_sorted_children(pending: &mut Vec<PathBuf>, mut children: Vec<PathBuf>) {
    children.sort();
    children.reverse();
    pending.extend(children);
}
