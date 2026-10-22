//! Ratchet baselines: a recorded multiset of known violations. With a baseline, only
//! violations beyond it are reported, so existing debt does not block gating new work.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use crate::model::Violation;

pub fn read(path: &Path) -> Result<HashMap<String, usize>, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("{}: {}", path.display(), e))?;
    let mut counts = HashMap::new();
    for line in text.lines() {
        if line.trim().is_empty() || line.starts_with('#') {
            continue;
        }
        *counts.entry(line.to_string()).or_insert(0) += 1;
    }
    return Ok(counts);
}

pub fn write(path: &Path, violations: &[Violation], header: &str) -> Result<(), String> {
    let mut keys: Vec<String> = violations.iter().map(|v| v.key()).collect();
    keys.sort();
    let mut text = format!(
        "# {}\n# Regenerate with --write-baseline; entries are rule<TAB>file<TAB>message.\n",
        header
    );
    for k in keys {
        text.push_str(&k);
        text.push('\n');
    }
    if let Some(parent) = path.parent()
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    return fs::write(path, text).map_err(|e| e.to_string());
}

/// Splits violations into (new, baselined count). Also returns stale entries: baseline
/// lines no longer produced, which the ratchet should drop.
pub fn filter(
    violations: Vec<Violation>,
    baseline: &HashMap<String, usize>,
) -> (Vec<Violation>, usize, usize) {
    let mut remaining = baseline.clone();
    let mut fresh = Vec::new();
    let mut known = 0;
    for v in violations {
        let key = v.key();
        match remaining.get_mut(&key) {
            Some(n) if *n > 0 => {
                *n -= 1;
                known += 1;
            }
            _ => fresh.push(v),
        }
    }
    let stale = remaining.values().sum();
    return (fresh, known, stale);
}
