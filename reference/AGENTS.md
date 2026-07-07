# Reference Frameworks

Reference cases are side-by-side ports of external framework material into Flight.

The directory shape is:

```text
reference/frameworks/<framework>/<corpus>/<case>/<implementation>/
```

For example, `reference/frameworks/openfl/functional/blend-alpha/openfl` and `reference/frameworks/openfl/functional/blend-alpha/flight` are peer implementations of the same OpenFL functional case.

External framework implementations are behavioral and visual references, not API templates. Flight ports should use idiomatic Flight public APIs and project conventions while preserving the sample's observable behavior, dimensions, assets, timing, and visual intent.

Do not add reference-local compatibility layers to imitate another framework's API. If Flight lacks a public API needed to express a reference case idiomatically, surface that as a Flight package gap.
