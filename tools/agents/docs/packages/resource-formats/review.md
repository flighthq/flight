---
package: '@flighthq/resource-formats'
status: partial
score: 58
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/resource-formats/src
  - changes.patch (packages/resource-formats slice)
  - tools/agents/docs/packages/register.md
  - tools/agents/docs/packages/structural-forks.md
---

# resource-formats — Merge Review (delta vs approved baseline)

This is a **merge-gate** review of the integration delta `b2824e3d8` against the approved baseline `origin/main (eb73c3d74)`. The baseline has **no** `packages/resource-formats/`, so the entire package is the incoming change — judged net-new, not as edits to a blessed floor.

## What the delta actually is

The head package is a **single shared XML parser** and nothing else:

- `b2824e3d8:packages/resource-formats/src/index.ts` exports exactly `parseXmlAttributes`, `parseXmlDocument`, and the type `XmlElement`.
- `b2824e3d8:packages/resource-formats/src/xmlParse.ts:1` — `// Pull-style XML parser sufficient for atlas and plist file formats.`

This is a **much thinner** shape than the worker bundle that earned the register's `resource-formats` verdict. The `register.md` redirect (`resource-formats` → `textureatlas-formats`, "real atlas formats, has a `registerTextureAtlasFormat` registry … duplicates `spritesheet-formats`") was written against `builder-67dc46d64`, whose status text describes `textureAtlasPackerParse.ts`, `textureAtlasAsepriteParse.ts`, `textureAtlasStarlingParse.ts`, `textureAtlasLibgdxParse.ts`, `textureAtlasDetect.ts` (with `registerTextureAtlasFormat`), and `textureAtlasLoad.ts`. **None of those files exist in this head** (`find packages/resource-formats -type f` returns only `xmlParse.ts`, its test, `index.ts`, and the two configs). The integration resolved the duplication by **deleting the TextureAtlas codec surface**, leaving the XML primitive that `spritesheet-formats` depends on. That is the right call for the duplication concern — but it leaves the package's name describing a thing it no longer contains.

## Standards verdict (delta only)

| Axis | Verdict | Evidence |
| --- | --- | --- |
| 1. Composition / bedrock | **PASS** | An XML parser is bedrock — irreducible, upstream-library oracle (every XML lib). Two small free functions (`parseXmlAttributes`, `parseXmlDocument`) plus private helpers at file bottom. No config-gated feature branches, no fused subjects. |
| 2. Naming clarity | **FAIL (homing)** | The exported names are XML-shaped and self-identifying (`parseXmlDocument`, `parseXmlAttributes`, `XmlElement`). But the **package name** `@flighthq/resource-formats` now contains zero resource-format codecs — only a generic XML parser (`index.ts` exports). A reader reaching for "resource formats" finds an XML utility. The honest name for this content is closer to `xml` (a parse primitive), per the register's bedrock-test rule #3 (honest naming). |
| 3. Tree-shaking / bundle | **PASS** | `package.json` `"sideEffects": false`; single `.` export; no top-level side effects, no eager registration. `sdk/src/index.ts:56 export * from '@flighthq/resource-formats'` adds 3 tree-shakable names. |
| 4. Registry vs closed union | **PASS (N/A)** | No `kind`/handler family in the head. The prior `registerTextureAtlasFormat` registry was removed with the codecs. |
| 5. Subject triad + plurality guard | **FAIL (mis-homed)** | The package is named `<subject>-formats` but holds no codec for any subject — it is a single shared parse primitive. Under the triad it is not a `-formats` cell at all; it is a bedrock utility (`xml`) that `spritesheet-formats` (and future `*-formats`) compose. The register already records this homing defect; the head's reduction sharpens it rather than fixing it. |
| 6. Contract hygiene | **PARTIAL** | Sentinels correct: `parseXmlDocument` returns `null` for no element (`xmlParse.ts:34,69`), no throws on malformed input — the unbalanced-close-tag test confirms it does not underflow. `parseXmlAttributes` returns `{}` for empty input. String-only params, so `Readonly<>` is N/A on inputs. **But types-first is violated:** `XmlElement` crosses a package boundary — `spritesheet-formats/src/cocosPlistParse.ts:1 import type { XmlElement } from '@flighthq/resource-formats'` — yet is defined in this implementation package, not in `@flighthq/types` (confirmed absent from `types/src`). The `XmlElement` fields (`children`, `attributes`) are mutable; acceptable for an owned parse-output tree, noted not failed. |
| 7. Tests & honesty | **PARTIAL** | Tests are colocated, `describe` blocks alphabetized (`parseXmlAttributes` then `parseXmlDocument`), mirror the two exports, and are thorough (entities, numeric refs, CDATA, comments, declaration, nesting, unbalanced tags). Code compiles (no imports, pure string work). **Honesty gap:** the package `description` and name advertise "atlas, plist, and similar structured formats" while the package ships only an XML parser and no format codec. |

## Grounded objections (carried to the dispatch brief)

1. **Mis-homed / dishonest package name.** `@flighthq/resource-formats` is, after the reduction, a generic XML parse primitive — `index.ts` exports only `parseXmlDocument` / `parseXmlAttributes` / `XmlElement`. A package named `*-formats` that contains no format codec is exactly the honest-naming failure the bedrock test rule #3 names. The content wants the name `xml` (or to be absorbed as a parse primitive that the real `*-formats` packages compose).

2. **Boundary-crossing type defined outside `@flighthq/types`.** `XmlElement` is consumed across packages (`spritesheet-formats/src/cocosPlistParse.ts:1`) but declared in `packages/resource-formats/src/xmlParse.ts:7`. The header-layer rule says a cross-package type belongs in `@flighthq/types`. As-is, the full API shape is not navigable from the header alone.

## What is genuinely good (approve-as-is)

- The **XML parser itself** is solid bedrock: sentinel-correct, no-throw on malformed input, alias-safe (pure string in / new tree out), well-tested, zero dependencies, tree-shakable.
- **The duplication the register flagged is resolved** — `spritesheet-formats` consumes one shared declaration (`cocosPlistParse.ts` imports the canonical parser) instead of a forked copy. The shared-primitive direction is correct; only its package home/name is wrong.

## Where the admin docs need revising

The `register.md` `resource-formats` row (and the `structural-forks.md` E lesson) describe a package that no longer exists in this head. The redirect verdict (`→ textureatlas-formats`) was about the TextureAtlas codecs, which are gone. The live question is now narrower and different: **a shared XML parse primitive needs an honest home** (rename to `xml`, or fold into `types` + a parse helper). The register should be re-baselined against `b2824e3d8` so the verdict matches the code.
