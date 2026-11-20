use std::collections::BTreeSet;
use std::path::Path;

#[allow(dead_code)]
#[path = "../host_seam.rs"]
mod host_seam;

const HEADER: &str = include_str!(concat!(env!("OUT_DIR"), "/flight_ffi.h"));
const HL: &str = include_str!(concat!(env!("OUT_DIR"), "/flight_hl.c"));
const GENERATED: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_generated.rs"));
const STATS: &str = include_str!(concat!(env!("OUT_DIR"), "/ffi_stats.txt"));

mod check_host_scan_membership {
    use super::*;

    #[test]
    fn accepts_exactly_the_public_functions_of_the_headless_crate() {
        let feature = headless_feature();
        let exports = headless_exports();
        assert_eq!(exports.len(), feature.lowerings.len());
        assert_eq!(
            host_seam::check_host_scan_membership(feature, &exports),
            Ok(())
        );
    }

    #[test]
    fn rejects_an_unlowered_export_and_a_lowering_no_export_backs() {
        let feature = headless_feature();
        let mut gained = headless_exports();
        gained.insert("resize_headless_host_surface".to_string());
        let error = host_seam::check_host_scan_membership(feature, &gained).unwrap_err();
        assert!(
            error.contains("unlowered [\"resize_headless_host_surface\"]"),
            "{error}"
        );
        let mut lost = headless_exports();
        lost.remove("create_headless_host_render_target");
        let error = host_seam::check_host_scan_membership(feature, &lost).unwrap_err();
        assert!(
            error.contains("unbacked [\"create_headless_host_render_target\"]"),
            "{error}"
        );
    }
}

mod collect_host_exports {
    use super::*;

    #[test]
    fn reads_module_level_public_functions_only() {
        let exports = host_seam::collect_host_exports(&[
            "pub fn exported() {}\npub(crate) fn crate_only() {}\nfn private() {}\nmod nested { pub fn inner() {} }\n"
                .to_string(),
        ]);
        assert_eq!(exports, BTreeSet::from(["exported".to_string()]));
    }
}

mod generate_host_section {
    use super::*;

    #[test]
    fn tags_every_wrapper_with_the_section_and_emits_every_lowering() {
        let feature = headless_feature();
        let section = host_seam::generate_host_section(feature);
        let tag = format!("#[doc = \"flight-ffi section|{}\"]", feature.guard);
        let wrappers = section
            .output
            .matches("pub unsafe extern \"C\" fn ")
            .count();
        assert_eq!(section.output.matches(&tag).count(), wrappers);
        for (_, name) in feature.lowerings {
            assert!(section.surface.contains(&name.to_string()), "{name}");
            assert_eq!(
                section
                    .output
                    .matches(&format!("pub unsafe extern \"C\" fn {name}("))
                    .count(),
                1,
                "{name}"
            );
        }
        assert!(
            section
                .surface
                .iter()
                .all(|name| !name.starts_with("flight_free_"))
        );
        assert_eq!(section.report.len(), feature.lowerings.len());
    }

    // Carriers passed back are looked up by address among the boxes live hosts lent before any
    // dereference, and host handles are registry keys, never pointers that are read.
    #[test]
    fn validates_every_handle_and_carrier_before_using_it() {
        let section = host_seam::generate_host_section(headless_feature()).output;
        assert!(section.contains("registry.hosts.get_mut(&host.addr())"));
        assert!(section.contains("std::ptr::eq(&**lent, target)"));
        assert!(!section.contains("unsafe { &*host"));
        assert!(!section.contains("unsafe { &*target"));
        assert!(section.contains(
            "FFI_HEADLESS_HOSTS.lock().unwrap_or_else(std::sync::PoisonError::into_inner)"
        ));
        assert!(section.contains("std::ptr::without_provenance_mut(token)"));
    }
}

#[cfg(not(feature = "host-headless"))]
mod default_build_isolation {
    use super::*;

    #[test]
    fn leaves_every_artifact_free_of_the_host_section() {
        for (name, artifact) in [
            ("header", HEADER),
            ("HashLink shim", HL),
            ("generated Rust", GENERATED),
            ("stats", STATS),
        ] {
            assert!(!artifact.contains("headless"), "{name}");
            assert!(!artifact.contains("FLIGHT_HOST_"), "{name}");
            assert!(!artifact.contains("flight-ffi section|"), "{name}");
        }
    }
}

#[cfg(feature = "host-headless")]
mod headless_build_section {
    use super::*;

    #[test]
    fn wraps_every_host_declaration_in_one_guarded_section() {
        for artifact in [HEADER, HL] {
            assert_eq!(artifact.matches("#ifdef FLIGHT_HOST_HEADLESS\n").count(), 1);
            assert_eq!(
                artifact
                    .matches("#endif /* FLIGHT_HOST_HEADLESS */\n")
                    .count(),
                1
            );
            let open = artifact.find("#ifdef FLIGHT_HOST_HEADLESS\n").unwrap();
            let close = artifact
                .find("#endif /* FLIGHT_HOST_HEADLESS */\n")
                .unwrap();
            for (index, _) in artifact.match_indices("headless") {
                assert!(
                    open < index && index < close,
                    "a host name outside the section"
                );
            }
        }
        let open = HEADER.find("#ifdef FLIGHT_HOST_HEADLESS\n").unwrap();
        assert!(HEADER[open..].starts_with(
            "#ifdef FLIGHT_HOST_HEADLESS\ntypedef struct FlightHeadlessHost FlightHeadlessHost;\n"
        ));
        assert!(HEADER.contains("FlightHeadlessHost * flight_create_headless_host(void * arg0);"));
        assert!(HEADER.contains("void flight_destroy_headless_host(FlightHeadlessHost * arg0);"));
        assert!(HEADER.contains(
            "/* Borrowed return; do not free; valid while the host is not destroyed. */\nvoid * flight_get_headless_host_wgpu_device(FlightHeadlessHost * arg0);"
        ));
    }

    #[test]
    fn records_every_lowering_in_the_census() {
        let feature = headless_feature();
        assert!(STATS.contains(&format!(
            "FFI host feature host-headless: {} crate functions lowered from flight-host-headless\n",
            feature.lowerings.len()
        )));
        for (source, name) in feature.lowerings {
            assert!(
                STATS.contains(&format!("  host: host-headless {name} <- {source}\n")),
                "{name}"
            );
        }
    }
}

fn headless_exports() -> BTreeSet<String> {
    let src = Path::new(env!("CARGO_MANIFEST_DIR")).join("../flight-host-headless/src");
    let mut sources = Vec::new();
    for entry in std::fs::read_dir(src).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|extension| extension == "rs") {
            sources.push(std::fs::read_to_string(path).unwrap());
        }
    }
    return host_seam::collect_host_exports(&sources);
}

fn headless_feature() -> &'static host_seam::HostFeature {
    return host_seam::HOST_FEATURES
        .iter()
        .find(|feature| feature.feature == "host-headless")
        .unwrap();
}
