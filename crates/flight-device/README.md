# flight-device

Device identity, capability flags, display metrics and safe-area insets (TS `@flighthq/device`), read only through an explicit `HostDeviceCapability`. There are no native hardware, OS, locale or network probes.

Each read fills a caller-owned `out` descriptor. The `create_*` functions return the documented zeroed descriptors ("" / -1 / false); they are plain records, not entities. `refresh_device_info` calls the provider's optional `refresh`. `form_factor` uses flight-useragent's open `DeviceFormFactor` domain.

## Precision

`available_memory` and `total_memory` are `f64` byte counts: values such as 8,000,000,000 need exact integers far beyond f32's 2^24. `cpu_cores` and `color_depth` are `i32` counts. Densities, CSS sizes, pixel ratio, font scale and insets are `f32` reported values.
