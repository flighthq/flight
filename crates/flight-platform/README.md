# flight-platform

The running platform's identity (TS `@flighthq/platform`), read only through an explicit `HostPlatformCapability`. There is no detection, OS probe or native provider here.
- `get_platform_info` fills a caller-owned `PlatformInfo` entity.
- The convenience queries (`get_platform_kind`, `is_platform_native`, `is_platform_version_at_least`, ...) each take a fresh per-call snapshot, replacing the source module scratch object.
- `compare_platform_versions` compares dotted versions segment by segment, reading each segment exactly as JS `parseInt(s, 10)` does.
- `PlatformInfo.runtime` keeps its TS name (the host shell), so the entity slot is `entity_runtime` and the `Entity` impl is written out.

## Precision

`pointer_width` is `i32` (TS `32 | 64 | -1`). The only `f64` is the private `parse_js_int`: JS `parseInt` yields an IEEE double, so very long segments must round, and compare, exactly as the source does.
