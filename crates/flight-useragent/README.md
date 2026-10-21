# flight-useragent

Pure user-agent string parsing to device and platform identity tokens (TS `@flighthq/useragent`). There are no DOM, navigator or OS queries. The platform enums come from flight-platform, and `DeviceFormFactor` is an open `String` domain with seven known constants.

The source's regular expressions are reproduced exactly by private matchers (`js_pattern`), because a Rust regex engine differs observably from JS non-unicode `/i`:
- JS folds case only between ASCII characters;
- JS `\s` is its own whitespace set;
- JS `.` stops at line terminators.

Pinned source behavior wins, including its known ceilings: frozen Windows 11 and macOS UA values, and a desktop token set that matches `winnt`/`windowsnt` with no space.

## Precision

There is no public floating point. `max_touch_points` and pointer widths are `i32`. The only `f64` is the private JS-truthiness check for a TS `number` stored in an `unknown` window property.
