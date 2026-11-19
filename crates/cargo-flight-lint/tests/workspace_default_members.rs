//! The root manifest's `default-members` names every crate except the native host crates, so a
//! plain `cargo build` / `cargo test` keeps covering every SDK crate as crates are added, and never
//! needs a host's platform dependencies.

use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

// A host crate (`flight-host-<platform>`) is a workspace member built only when named; the bare
// `flight-host` vocabulary crate is not a host and stays a default member.
fn is_host_crate(name: &str) -> bool {
    return name.starts_with("flight-host-");
}

fn workspace_root() -> &'static Path {
    return Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap();
}

fn read_default_members() -> Vec<String> {
    let manifest = fs::read_to_string(workspace_root().join("Cargo.toml")).unwrap();
    let start = manifest
        .find("\ndefault-members = [")
        .expect("the root manifest sets default-members");
    let list = &manifest[start..];
    let list = &list[list.find('[').unwrap() + 1..list.find(']').unwrap()];
    return list
        .split(',')
        .map(|entry| entry.trim().trim_matches('"').to_string())
        .filter(|entry| !entry.is_empty())
        .collect();
}

fn read_crate_directories() -> BTreeSet<String> {
    return fs::read_dir(workspace_root().join("crates"))
        .unwrap()
        .filter_map(|entry| {
            let entry = entry.unwrap();
            let name = entry.file_name().to_string_lossy().to_string();
            return entry.path().join("Cargo.toml").is_file().then_some(name);
        })
        .collect();
}

#[test]
fn default_members_are_every_crate_except_the_hosts_in_order() {
    let listed = read_default_members();
    let expected: Vec<String> = read_crate_directories()
        .into_iter()
        .filter(|name| !is_host_crate(name))
        .map(|name| format!("crates/{name}"))
        .collect();
    assert_eq!(listed, expected);
}

#[test]
fn host_crates_are_workspace_members_outside_the_defaults() {
    let hosts: Vec<String> = read_crate_directories()
        .into_iter()
        .filter(|name| is_host_crate(name))
        .collect();
    assert!(
        hosts.contains(&"flight-host-headless".to_string()),
        "{hosts:?}"
    );
    let listed = read_default_members();
    for host in &hosts {
        assert!(!listed.contains(&format!("crates/{host}")), "{host}");
    }
    assert!(listed.contains(&"crates/flight-host".to_string()));
}
