# Source-audited fixture diagnostic-kind dispositions

Audit target: repository source at `b8d9c121e`, covering the seven fixture adapters that can emit `Skip` diagnostics: `gltf`, `lottie`, `md5-animation`, `obj`, `skeleton2d-json`, `svg`, and `swf`. The audit follows each adapter into every diagnostic-producing parser it invokes. It does not use result messages, diagnostic text, severity-name substrings, kind prefixes, or the retired result counts.

All source paths are repository-relative. After a section gives a file's full path, later rows abbreviate it to the unique basename; every cited line is from the audit target above.

## Decision vocabulary and score implications

The `Disposition` column records the source branch's actual operation:

- `Reject`: no usable import is accepted from that branch.
- `Drop`: authored content is discarded with no substitute.
- `Recover`: a usable substitute or best-effort survivor is retained.
- `Skip`: a recognized capability is not modeled or a required external capability is unavailable.

The `Flow` column records scorer behavior for the kind in isolation and its precedence when mixed:

- `R`: primary `rejected`; `executed=yes`; no `acceptedImport` numerator. `Reject` defeats every other diagnostic.
- `D`: primary `degraded`; a usable import remains; `executed=yes`; no numerator. `Drop` defeats every `Skip`/choice kind unless a `Reject` exists.
- `V`: primary `degraded`; a recovered import remains; `executed=yes`; no numerator. `Recover` has the same primary precedence as `Drop`.
- `S`: primary `unsupported` only when no `Reject`, `Drop`, or `Recover` exists; a best-effort import remains; `executed=yes`; no numerator.
- `C`: source-supported deliberate choice. It may be primary `intentional-choice` only when otherwise clean; on a mixed result it is an orthogonal facet and the `R`/`D`/`V`/non-choice `S` primary wins. It never enters the `acceptedImport` numerator and never leaves the executed denominator.
- `D/V`: the same exact kind is classified `Drop` or `Recover` by its call-site role; either yields `degraded`.
- `D/R`: the same exact kind is `Drop` for an unresolved reference and `Reject` for a recursion/cycle; the actual emitted disposition decides `degraded` versus `rejected`.

`acceptedImport` therefore remains exactly clean `imported / executed`. No diagnostic kind in this table launders its result into that numerator. A thrown adapter remains `threw`, and a prerequisite failure remains `not-run`, independently of the table.

The MD5-animation adapter has one extra prerequisite rule: it parses the companion MD5 mesh into the same diagnostic sink before calling `parseMd5Anim`. If no companion exists, it emits no diagnostic and returns `not-run`; if the parsed companion has no skeleton joints, it can return `not-run` carrying mesh diagnostics. Thus MD5 mesh rows describe their source disposition, but do not alone prove that the MD5-animation candidate reached its target animation method.

## Deliberate-choice decisions

Source review identifies ten exact kinds with durable product-scope support for deliberate choice: the three previously named kinds plus seven SVG static-document boundary kinds. The SVG charter explicitly excludes live animation, filter/effect pipelines, scripting, and `foreignObject`; `pattern` is intentionally not included because it is static-vector content and its absence is a capability gap.

| Exact kind | Source support | Choice role | Reviewer rationale |
| --- | --- | --- | --- |
| `md5anim.bounds-unsupported` | `packages/scene3d-formats/src/md5AnimParse.ts:128-137`; `agents/scene3d-format-coverage.md:167-175` | `C` | The parser recognizes and intentionally omits a derived bounds block because bounds can be recomputed from skinned geometry. Primary only if otherwise clean; facet when mixed. |
| `svg.unsupported-animate` | bounded definition `packages/scene2d-formats/src/svgDocument.ts:1699-1708`, emission `:1602`; `agents/packages/structural-forks.md:105` | `C` | SMIL animation is outside the chartered static-vector import boundary. Primary only if otherwise clean; facet when mixed. |
| `svg.unsupported-animateMotion` | same bounded definition/emission and charter | `C` | Motion animation is outside the static-document boundary. |
| `svg.unsupported-animateTransform` | same bounded definition/emission and charter | `C` | Transform animation is outside the static-document boundary. |
| `svg.unsupported-filter` | `svgDocument.ts:273` and bounded element definition/emission `:1699-1708`/`:1602`; `agents/packages/structural-forks.md:105` | `C` | SVG filter/effect pipelines are explicitly outside this static-vector importer. |
| `svg.unsupported-foreignObject` | bounded definition/emission and charter above | `C` | Embedded live/foreign document content is outside the static-vector boundary. |
| `svg.unsupported-script` | bounded definition/emission and charter above | `C` | Script execution is explicitly outside the importer boundary. |
| `svg.unsupported-set` | bounded definition/emission and charter above | `C` | SMIL property-setting animation is outside the static-document boundary. |
| `swf.frame-script-declined` | `packages/swf/src/swfDocument.ts:1865-1906`; `agents/packages/swf/tag-coverage.md:78-83` | `C` | Non-playback bytecode is declined as a whole by importer charter; importing only the legible half would misrepresent the script. Primary only if otherwise clean; facet when mixed. |
| `swf.define-binary-data` | definition `packages/swf/src/swfDocument.ts:3034-3040`, emission `:2036-2053`; `agents/packages/swf/tag-coverage.md:86` | `C` | Arbitrary embedded bytes have no scene/display meaning and are deliberately outside scene import. Primary only if otherwise clean; facet when mixed. |

Every other `Skip` below is a genuine capability gap, an unknown-input condition, or a dependency/resolver condition. A comment saying data was "deliberately not used" is not sufficient for choice: if the source says the representation is absent or a capability is not wired, the kind stays non-choice `Skip`.

## glTF / GLB

The adapter calls `createScene3DsFromGltf` or `createScene3DsFromGlb`, installs the listed glTF extension handlers, and uses the shared no-`Reject` observation rule.

| Exact kind | Source emission/definition | Disposition | Choice | Flow | Semantic meaning and reviewer rationale |
| --- | --- | --- | --- | --- | --- |
| `gltf.invalid-json` | `packages/scene3d-formats/src/gltfParse.ts:174` | Reject | No | R | JSON parsing failed; no document exists. |
| `gltf.not-an-object` | `gltfParse.ts:181` | Reject | No | R | Parsed JSON is not a glTF object. |
| `gltf.unsupported-version` | `gltfParse.ts:222` | Recover | No | V | The asset version is absent/non-2.0, but the parser continues best-effort. The word `unsupported` must not override `Recover`. |
| `gltf.unsupported-required-extension` | `gltfParse.ts:229` | Skip | No | S | A required extension has no installed handler; required semantics are unavailable. |
| `gltf.camera-missing` | `gltfParse.ts:391` | Drop | No | D | A node references a camera definition that does not exist; that camera is lost. |
| `gltf.camera-invalid-perspective` | `gltfParse.ts:406` | Drop | No | D | Required perspective-camera values are invalid, so the camera is omitted. |
| `gltf.camera-invalid-orthographic` | `gltfParse.ts:433` | Drop | No | D | Required orthographic-camera values are invalid, so the camera is omitted. |
| `gltf.camera-missing-descriptor` | `gltfParse.ts:452` | Drop | No | D | The camera type has no matching perspective/orthographic descriptor. |
| `gltf.duplicate-extension-handler` | `gltfParse.ts:474` | Recover | No | V | Later duplicate handler registration is ignored; the first handler remains usable. |
| `gltf.node-child-out-of-range` | `gltfParse.ts:515` | Recover | No | V | An invalid child reference is removed while the remaining hierarchy survives. |
| `gltf.node-multiple-parents` | `gltfParse.ts:521` | Recover | No | V | A second parent edge is refused; the first valid parent survives. |
| `gltf.node-hierarchy-cycle` | `gltfParse.ts:546` | Recover | No | V | A cyclic edge is broken so an acyclic scene can still be built. |
| `gltf.skin-ibm-count-mismatch` | `gltfParse.ts:618` | Recover | No | V | Missing inverse-bind entries fall back to identity matrices. |
| `gltf.animation-target-unresolved` | `gltfParse.ts:661` | Drop | No | D | An animation channel targets no resolvable node and is discarded. |
| `gltf.animation-missing-sampler` | `gltfParse.ts:668` | Drop | No | D | An animation channel's sampler reference is absent. |
| `gltf.animation-sampler-empty` | `gltfParse.ts:696` | Drop | No | D | The sampler has no usable key data, so the channel is discarded. |
| `gltf.animation-sampler-cardinality` | `gltfParse.ts:708` | Drop | No | D | Input/output key cardinality cannot form a track. |
| `gltf.animation-unsupported-path` | `gltfParse.ts:736` | Skip | No | S | The channel targets an animation path Flight does not model. |
| `gltf.weights-cardinality-mismatch` | `gltfParse.ts:782` | Drop | No | D | Weight-key values do not match keys × morph targets; the channel is discarded. |
| `gltf.weights-no-morphable-mesh` | `gltfParse.ts:799` | Drop | No | D | A weights channel has no mesh with morph targets to drive. |
| `gltf.texture-source-missing` | `gltfParse.ts:918` | Recover | No | V | A texture source reference is absent; the material remains without that texture. |
| `gltf.texture-image-unresolved` | `gltfParse.ts:927` | Recover | No | V | Referenced image bytes cannot be resolved; the texture slot is omitted. |
| `gltf.texcoord-set-unsupported` | `gltfParse.ts:942` | Recover | No | V | A non-modeled UV set falls back to a supported/default coordinate path. Spelling does not turn it into `Skip`. |
| `gltf.image-malformed-uri` | `gltfParse.ts:1001` | Drop | No | D | The image URI cannot be decoded/resolved as an image source. |
| `gltf.image-bufferview-out-of-range` | `gltfParse.ts:1018,1030` | Drop | No | D | The embedded image bufferView or backing buffer is absent. |
| `gltf.image-no-source` | `gltfParse.ts:1040` | Drop | No | D | The image supplies neither a URI nor a bufferView. |
| `gltf.buffer-empty` | `gltfParse.ts:1066,1077` | Recover | No | V | A missing binary/external buffer becomes an empty buffer so the rest of the document can be inspected. |
| `gltf.primitive-no-position` | `gltfParse.ts:1168,1174` | Drop | No | D | A primitive has no readable POSITION stream and cannot produce geometry. |
| `gltf.primitive-empty-indices` | `gltfParse.ts:1296` | Drop | No | D | An indexed primitive has no surviving indices. |
| `gltf.primitive-unsupported-mode` | `gltfParse.ts:1406` | Drop | No | D | This primitive mode produces no supported topology and the primitive is omitted. Exact disposition is `Drop` despite spelling. |
| `gltf.morph-target-no-position` | `gltfParse.ts:1471,1478` | Drop | No | D | A morph target lacks a readable POSITION delta and is omitted. |
| `gltf.morph-target-count-mismatch` | `gltfParse.ts:1487` | Drop | No | D | Morph POSITION count differs from the base mesh, so the target is omitted. |
| `gltf.draco-decoder-missing` | `gltfParse.ts:1581` | Drop | No | D | A Draco-compressed primitive cannot be decoded because no decoder is registered. |
| `gltf.draco-payload-missing` | `gltfParse.ts:1588` | Drop | No | D | The Draco bufferView/backing buffer cannot be found. |
| `gltf.draco-decode-failed` | `gltfParse.ts:1605` | Drop | No | D | The registered decoder throws or returns no decoded mesh. |
| `gltf.accessor-count-mismatch` | definition `gltfParse.ts:1651`, emission `:1548-1554` | Recover | No | V | An optional attribute count differs from the primitive vertex count; the attribute is dropped and finite defaults remain. |
| `gltf.accessor-not-found` | definition `gltfParse.ts:1675`, emission `:1548-1554` | Drop/Recover | No | D/V | Missing accessor: mandatory index/animation roles drop their survivor; optional attributes/IBMs recover with defaults. |
| `gltf.accessor-type-mismatch` | definition `gltfParse.ts:1686`, emission `:1548-1554` | Drop/Recover | No | D/V | Accessor tuple type disagrees with its consumer; severity follows mandatory versus optional role. |
| `gltf.accessor-invalid-read` | definitions `gltfParse.ts:1700,1740`, emission `:1548-1554` | Drop/Recover | No | D/V | Component/count/stride/range validation makes the accessor unreadable; role decides whether a survivor exists. |
| `gltf.accessor-buffer-not-found` | definition `gltfParse.ts:1719`, emission `:1548-1554` | Drop/Recover | No | D/V | The accessor's bufferView references no supplied buffer; role decides drop versus substitute. |
| `gltf.accessor-bufferview-not-found` | definition `gltfParse.ts:1757`, emission `:1548-1554` | Drop/Recover | No | D/V | A non-sparse accessor has no readable bufferView; role decides drop versus substitute. |
| `gltf.sparse-bufferview-not-found` | `gltfParse.ts:1796` | Recover | No | V | Sparse overrides lack a bufferView; base accessor data remains. |
| `gltf.sparse-buffer-not-found` | `gltfParse.ts:1802` | Recover | No | V | Sparse override bytes are absent; base accessor data remains. |
| `gltf.sparse-invalid-read` | `gltfParse.ts:1841` | Recover | No | V | Sparse index/value ranges are unreadable; base values remain. |
| `gltf.sparse-index-out-of-range` | `gltfParse.ts:1853` | Recover | No | V | An out-of-range sparse override is ignored while valid/base values remain. |
| `glb.header-too-small` | `gltfParse.ts:1935` | Reject | No | R | The GLB header cannot be read. |
| `glb.wrong-magic` | `gltfParse.ts:1941` | Reject | No | R | Container magic is not GLB. |
| `glb.unsupported-version` | `gltfParse.ts:1946` | Reject | No | R | The container version cannot be interpreted; no GLB document is accepted. |
| `glb.chunk-past-end` | `gltfParse.ts:1971` | Recover | No | V | A trailing chunk overclaims bytes; earlier complete chunks remain usable. |
| `glb.json-chunk-invalid` | `gltfParse.ts:1980` | Reject | No | R | The JSON chunk is not decodable JSON text. |
| `glb.no-json-chunk` | `gltfParse.ts:1995` | Reject | No | R | The required JSON document chunk is absent. |
| `gltf.emissive-strength-negative` | `packages/scene3d-formats/src/gltfEmissiveStrength.ts:31` | Drop | No | D | Negative emissive multipliers are ignored rather than written to materials. |
| `gltf.light-missing` | `packages/scene3d-formats/src/gltfPunctualLights.ts:20` | Drop | No | D | A node references no punctual-light definition. |
| `gltf.light-negative-intensity` | `gltfPunctualLights.ts:56` | Drop | No | D | An invalid negative-intensity light is omitted. |
| `gltf.light-non-positive-range` | `gltfPunctualLights.ts:66` | Drop | No | D | A finite light range is non-positive, so the light is omitted. |
| `gltf.light-invalid-spot-cone` | `gltfPunctualLights.ts:76` | Drop | No | D | Spot cone angles violate the accepted ordering/range. |
| `gltf.light-unsupported-type` | `gltfPunctualLights.ts:90` | Skip | No | S | The extension declares a light type Flight does not model. |

## Lottie

| Exact kind | Source emission/definition | Disposition | Choice | Flow | Semantic meaning and reviewer rationale |
| --- | --- | --- | --- | --- | --- |
| `lottie.invalid-document` | `packages/scene2d-formats/src/lottieDocument.ts:105` | Reject | No | R | JSON is malformed or does not form a Lottie document. |
| `lottie.unsupported-layer` | `lottieDocument.ts:242` | Skip | No | S | A recognized/unknown layer type has no node realization. |
| `lottie.unresolved-asset` | `lottieDocument.ts:679,717` | Drop | No | D | An image/precomposition layer references no declared asset. |
| `lottie.unresolved-image` | `lottieDocument.ts:684` | Skip | No | S | The image asset has no resolved image resource; this is resolver/input availability, not deliberate scope. |
| `lottie.text-missing-document` | `lottieDocument.ts:694` | Drop | No | D | A text layer lacks its authored text document and is omitted. |
| `lottie.recursive-precomposition` | `lottieDocument.ts:721` | Drop | No | D | A precomposition reference cycles and cannot be instantiated. |
| `lottie.unsupported-shape-modifier` | `lottieDocument.ts:805,878,939,942` | Skip | No | S | A known modifier/dash behavior cannot be represented by the current shape path. |
| `lottie.unsupported-shape-item` | `lottieDocument.ts:944` | Skip | No | S | A shape item type has no importer implementation. |
| `lottie.incompatible-animated-shape-path` | `lottieDocument.ts:1171` | Drop | No | D | Animated path keyframes cannot share a compatible topology, so the channel is discarded. |
| `lottie.unsupported-expression` | `lottieDocument.ts:1459` | Skip | No | S | An authored expression cannot be evaluated by the importer. |

## MD5 animation, including companion MD5 mesh

### MD5 animation kinds

| Exact kind | Source emission/definition | Disposition | Choice | Flow | Semantic meaning and reviewer rationale |
| --- | --- | --- | --- | --- | --- |
| `md5anim.unsupported-version` | `packages/scene3d-formats/src/md5AnimParse.ts:60` | Recover | No | V | A non-v10 declaration is retained for best-effort parsing; spelling must not override `Recover`. |
| `md5anim.non-numeric-numframes` | `md5AnimParse.ts:78` | Recover | No | V | Invalid declared frame count falls back to the frames actually read. |
| `md5anim.non-numeric-numjoints` | `md5AnimParse.ts:92` | Recover | No | V | Invalid declared joint count falls back to the parsed hierarchy. |
| `md5anim.invalid-framerate` | `md5AnimParse.ts:106` | Recover | No | V | Invalid frame rate is replaced by a usable fallback. |
| `md5anim.bounds-unsupported` | `md5AnimParse.ts:137` | Skip | Yes | C | Recognized derived bounds are intentionally omitted; see the deliberate-choice decision above. |
| `md5anim.no-data` | `md5AnimParse.ts:158` | Reject | No | R | No hierarchy or no frames means no animation clip can be produced. |
| `md5anim.joint-count-mismatch` | `md5AnimParse.ts:161` | Recover | No | V | Declared and parsed joint counts disagree; parsed hierarchy remains usable. |
| `md5anim.frame-count-mismatch` | `md5AnimParse.ts:173` | Recover | No | V | Declared and parsed frame counts disagree; parsed frames remain usable. |
| `md5anim.joints-too-few` | `md5AnimParse.ts:185` | Reject | No | R | The supplied skeleton cannot satisfy the animation hierarchy. |
| `md5anim.component-count-mismatch` | `md5AnimParse.ts:245` | Recover | No | V | Declared animated-component total disagrees with hierarchy flags; computed total is used. |
| `md5anim.baseframe-count-mismatch` | `md5AnimParse.ts:251` | Recover | No | V | Baseframe entries do not cover every hierarchy joint; missing values use recovery behavior. |
| `md5anim.frame-width-mismatch` | `md5AnimParse.ts:258` | Recover | No | V | A frame's component stream length differs from the computed width. |
| `md5anim.joint-frame-window-invalid` | `md5AnimParse.ts:275` | Recover | No | V | A joint's flagged component window leaves the frame; bind/default components substitute. |
| `md5anim.hierarchy-block-unclosed` | `md5AnimParse.ts:368` | Recover | No | V | EOF closes an otherwise usable hierarchy block. |
| `md5anim.malformed-hierarchy` | `md5AnimParse.ts:381,393,405` | Drop | No | D | A malformed hierarchy entry is discarded. |
| `md5anim.baseframe-block-unclosed` | `md5AnimParse.ts:433` | Recover | No | V | EOF closes an otherwise usable baseframe block. |
| `md5anim.malformed-baseframe` | `md5AnimParse.ts:449,471` | Drop | No | D | A malformed baseframe pose is discarded. |
| `md5anim.non-numeric-frame-value` | `md5AnimParse.ts:501` | Recover | No | V | A nonnumeric frame component is replaced by a finite fallback. |
| `md5anim.frame-block-unclosed` | `md5AnimParse.ts:523` | Recover | No | V | EOF closes an otherwise usable frame block. |

### Companion MD5 mesh kinds

These rows inherit the MD5 prerequisite caveat above. Once the companion yields joints and animation execution proceeds, their `Flow` code applies normally.

| Exact kind | Source emission/definition | Disposition | Choice | Flow | Semantic meaning and reviewer rationale |
| --- | --- | --- | --- | --- | --- |
| `md5mesh.tangent-handedness-contradiction` | `packages/scene3d-formats/src/md5Parse.ts:121` | Recover | No | V | Conflicting tangent handedness is reconciled while keeping drawable geometry. |
| `md5mesh.animation-no-skeleton` | `md5Parse.ts:161` | Drop | No | D | An animation attachment is discarded because the mesh produced no skeleton. |
| `md5mesh.unsupported-version` | `md5Parse.ts:222` | Recover | No | V | A non-v10 declaration is parsed best-effort; exact `Recover` defeats substring-based unsupported classification. |
| `md5mesh.no-data` | `md5Parse.ts:249` | Reject | No | R | The file has no usable joints/mesh data. |
| `md5mesh.vertex-weight-out-of-range` | `md5Parse.ts:286` | Recover | No | V | An invalid vertex weight reference is ignored while valid influences remain. |
| `md5mesh.weight-joint-out-of-range` | `md5Parse.ts:295` | Recover | No | V | A weight targeting no joint is omitted. |
| `md5mesh.triangle-vertex-out-of-range` | `md5Parse.ts:395` | Drop | No | D | A triangle referencing missing vertices is discarded. |
| `md5mesh.mesh-empty` | `md5Parse.ts:454` | Drop | No | D | A mesh section produces no usable geometry. |
| `md5mesh.vertex-over-influenced` | `md5Parse.ts:461` | Recover | No | V | Influences beyond the supported maximum are truncated and normalized/retained. |
| `md5mesh.joint-parent-out-of-range` | `md5Parse.ts:574` | Recover | No | V | Invalid parent linkage is replaced with a root/no-parent relationship. |
| `md5mesh.joints-block-unclosed` | `md5Parse.ts:660` | Recover | No | V | EOF closes an otherwise usable joints block. |
| `md5mesh.malformed-joint` | `md5Parse.ts:670,686,710` | Drop | No | D | A malformed joint record is discarded/placeholder-aligned. |
| `md5mesh.joint-orientation-not-unit` | `md5Parse.ts:727` | Recover | No | V | An invalid quaternion is normalized/reconstructed to a usable orientation. |
| `md5mesh.shader-unquoted` | `md5Parse.ts:788` | Recover | No | V | An unquoted shader reference is still retained as a usable token. |
| `md5mesh.mesh-block-unclosed` | `md5Parse.ts:851` | Recover | No | V | EOF closes an otherwise usable mesh block. |
| `md5mesh.malformed-vert` | `md5Parse.ts:867,880,892,901` | Drop | No | D | A malformed vertex record is discarded/placeholder-aligned. |
| `md5mesh.malformed-tri` | `md5Parse.ts:919,931,940` | Drop | No | D | A malformed triangle record is discarded/placeholder-aligned. |
| `md5mesh.malformed-weight` | `md5Parse.ts:961,981,990` | Drop | No | D | A malformed weight record is discarded/placeholder-aligned. |
| `md5mesh.vert-index-repeated` | bounded template `md5Parse.ts:1081`, caller `:809` | Recover | No | V | A repeated/out-of-order vertex ordinal keeps the first record. |
| `md5mesh.tri-index-repeated` | bounded template `md5Parse.ts:1081`, caller `:823` | Recover | No | V | A repeated/out-of-order triangle ordinal keeps the first record. |
| `md5mesh.weight-index-repeated` | bounded template `md5Parse.ts:1081`, caller `:832` | Recover | No | V | A repeated/out-of-order weight ordinal keeps the first record. |
| `md5mesh.vert-index-gap` | bounded template `md5Parse.ts:1087`, caller `:809` | Recover | No | V | Missing vertex ordinals are filled with explicit failing placeholders to preserve addressing. |
| `md5mesh.tri-index-gap` | bounded template `md5Parse.ts:1087`, caller `:823` | Recover | No | V | Missing triangle ordinals are filled positionally. |
| `md5mesh.weight-index-gap` | bounded template `md5Parse.ts:1087`, caller `:832` | Recover | No | V | Missing weight ordinals are filled positionally. |
| `md5mesh.vert-count-mismatch` | bounded template `md5Parse.ts:1104`, caller `:847` | Recover | No | V | Declared and parsed vertex counts disagree; actual records remain. |
| `md5mesh.tri-count-mismatch` | bounded template `md5Parse.ts:1104`, caller `:848` | Recover | No | V | Declared and parsed triangle counts disagree; actual records remain. |
| `md5mesh.weight-count-mismatch` | bounded template `md5Parse.ts:1104`, caller `:849` | Recover | No | V | Declared and parsed weight counts disagree; actual records remain. |

## OBJ, including MTL sidecars

| Exact kind | Source emission/definition | Disposition | Choice | Flow | Semantic meaning and reviewer rationale |
| --- | --- | --- | --- | --- | --- |
| `obj.vertex-malformed` | `packages/scene3d-formats/src/objParse.ts:122,178,188` | Drop | No | D | A position record lacks usable numeric components. |
| `obj.normal-malformed` | `objParse.ts:127,200,210` | Drop | No | D | A normal record lacks usable numeric components. |
| `obj.uv-malformed` | `objParse.ts:132,222,231` | Drop | No | D | A texture-coordinate record lacks usable numeric components. |
| `obj.face-too-few-vertices` | `objParse.ts:137,243` | Drop | No | D | A face cannot form a primitive. |
| `obj.object-name-missing` | `objParse.ts:141` | Recover | No | V | A group/object keeps geometry under a fallback/unnamed identity. |
| `obj.face-vertex-invalid` | `objParse.ts:412` | Drop | No | D | A face position token is nonnumeric/zero and the face corner is unusable. |
| `obj.position-index-out-of-range` | `objParse.ts:420` | Drop | No | D | A face position reference cannot resolve. |
| `obj.uv-index-invalid` | `objParse.ts:433` | Recover | No | V | Invalid optional UV is removed while the vertex remains. |
| `obj.normal-index-invalid` | `objParse.ts:444` | Recover | No | V | Invalid optional normal is removed/generated while the vertex remains. |
| `obj.element-index-out-of-range` | `objParse.ts:580` | Drop | No | D | A line/point element references a missing position. |
| `obj.material-missing` | `objParse.ts:820` | Drop | No | D | `usemtl` names no material in the supplied library. |
| `mtl.emissive-dropped` | `objParse.ts:676` | Skip | No | S | Parsed emissive terms are not represented by the chosen Blinn-Phong material path; a capability gap, not product scope. |
| `mtl.bump-height-map-unbound` | `objParse.ts:684,743` | Skip | No | S | The height-map directive is understood but no height-map material feature can bind it. |
| `mtl.metallic-roughness-map-unpacked` | `objParse.ts:725` | Skip | No | S | Separate authored maps cannot be composed into the material's packed representation. |
| `mtl.newmtl-no-name` | `packages/scene3d-formats/src/mtlParse.ts:31` | Drop | No | D | A material declaration has no identity and cannot create a library entry. |
| `mtl.color-malformed` | `mtlParse.ts:35,362,373` | Recover | No | V | Invalid color components are ignored and defaults remain. |
| `mtl.map-no-filename` | `mtlParse.ts:69` | Drop | No | D | A recognized texture-map directive supplies no resource path. |
| `mtl.directive-before-material` | `mtlParse.ts:390` | Drop | No | D | A property appears before any material exists to receive it. |
| `mtl.invalid-value` | `mtlParse.ts:399` | Recover | No | V | Invalid scalar material value is ignored and its default remains. |

## Skeleton2D JSON: DragonBones and Spine

The `skeleton2d-json` adapter passes text to `parseSkeleton2D`, which detects DragonBones or Spine JSON. Both parsers return a best-effort rig for the diagnostics below; malformed/non-matching top-level input can return `null` without a structured kind and is therefore outside the kind table.

### DragonBones exact kinds

| Exact kind | Source emission/definition | Disposition | Choice | Flow | Semantic meaning and reviewer rationale |
| --- | --- | --- | --- | --- | --- |
| `dragonbones.multi-armature-unsupported` | `packages/skeleton2d-formats/src/dragonBonesParse.ts:69` | Skip | No | S | Only the first armature is imported; additional armatures are unmodeled capability. |
| `dragonbones.ik-constraint-unsupported` | `dragonBonesParse.ts:95` | Skip | No | S | IK constraints have no imported constraint realization. |
| `dragonbones.deform-timeline-unsupported` | `dragonBonesParse.ts:173` | Skip | No | S | FFD/deform timelines are recognized but not modeled. |
| `dragonbones.ik-timeline-unsupported` | `dragonBonesParse.ts:174` | Skip | No | S | IK animation timelines are recognized but not modeled. |
| `dragonbones.zorder-timeline-unsupported` | `dragonBonesParse.ts:175` | Skip | No | S | Animated draw-order changes are recognized but not modeled. |
| `dragonbones.blend-tree-animation-unsupported` | `dragonBonesParse.ts:183` | Skip | No | S | A blend-tree entry becomes no executable blend tree; this is a missing capability. |
| `dragonbones.slot-timeline-unsupported` | bounded template `dragonBonesParse.ts:192`, sole value source `:237` | Skip | No | S | A slot timeline names no resolvable slot; its animation cannot be bound. |
| `dragonbones.animation-bone-unresolved` | `dragonBonesParse.ts:201` | Recover | No | V | Channels for missing bones are omitted while the rest of the clip survives. |
| `dragonbones.legacy-bone-frame-unsupported` | `dragonBonesParse.ts:334` | Skip | No | S | The legacy combined bone-frame timeline has no modeled channel conversion. |
| `dragonbones.malformed-frame-recovered` | `dragonBonesParse.ts:474` | Recover | No | V | Malformed keyframe positions are held with recovery entries so the time axis remains aligned. |
| `dragonbones.tween-easing-approximated` | `dragonBonesParse.ts:507` | Recover | No | V | Unsupported tween-easing values are approximated by a usable interpolation. |
| `dragonbones.color-offset-unsupported` | `dragonBonesParse.ts:609` | Skip | No | S | Additive color offsets have no `Slot2D` representation. |
| `dragonbones.armature-display-unsupported` | dynamic emitter `dragonBonesParse.ts:675`; canonical type documented `:44-56` | Skip | No | S | Nested armature displays are recognized but cannot become attachments. |
| `dragonbones.boundingBox-display-unsupported` | dynamic emitter `dragonBonesParse.ts:675`; canonical type documented `:44-56` | Skip | No | S | Bounding-box displays have no attachment realization. |
| `dragonbones.path-display-unsupported` | dynamic emitter `dragonBonesParse.ts:675`; canonical type documented `:44-56` | Skip | No | S | Path displays have no attachment realization. |
| `dragonbones.shared-mesh-unsupported` | `dragonBonesParse.ts:696` | Skip | No | S | A mesh borrowing geometry through `share` cannot be resolved by the current importer. |
| `dragonbones.legacy-weighted-mesh-unsupported` | `dragonBonesParse.ts:708` | Skip | No | S | Legacy weights without `bonePose` cannot be converted to Flight skin offsets. |
| `dragonbones.weighted-mesh-recovered` | `dragonBonesParse.ts:818` | Recover | No | V | Invalid/singular/unresolved weighted influences are omitted while valid influences survive. |
| `dragonbones.unresolved-bone-parent` | `dragonBonesParse.ts:1042` | Drop | No | D | Parent cycles/dangling names lose hierarchy links; affected bones are re-rooted. |

### Spine exact kinds

| Exact kind | Source emission/definition | Disposition | Choice | Flow | Semantic meaning and reviewer rationale |
| --- | --- | --- | --- | --- | --- |
| `spine.draworder-keyframe-unresolved` | `packages/skeleton2d-formats/src/spineParse.ts:69` | Drop | No | D | Invalid/conflicting slot offsets discard the draw-order keyframe. |
| `spine.malformed-bone-recovered` | `spineParse.ts:102` | Recover | No | V | An inert placeholder preserves file-order bone indices for weighted meshes. |
| `spine.boundingbox-attachment-unsupported` | dynamic emitter `spineParse.ts:169`; canonical type documented `:157-160` | Skip | No | S | Bounding-box attachment has no Flight attachment representation. |
| `spine.path-attachment-unsupported` | dynamic emitter `spineParse.ts:169`; canonical type documented `:157-160` | Skip | No | S | Path attachment has no Flight attachment representation. |
| `spine.clipping-attachment-unsupported` | dynamic emitter `spineParse.ts:169`; canonical type documented `:157-160` | Skip | No | S | Clipping attachment has no Flight attachment representation. |
| `spine.point-attachment-unsupported` | dynamic emitter `spineParse.ts:169`; canonical type documented `:157-160` | Skip | No | S | Point attachment has no Flight attachment representation. |
| `spine.linkedmesh-attachment-unsupported` | dynamic emitter `spineParse.ts:169`; canonical type documented `:157-160` | Skip | No | S | Linked mesh indirection is not resolved into an attachment. |
| `spine.weighted-vertices-truncated` | `spineParse.ts:358` | Recover | No | V | An incomplete weighted-vertex stream keeps the complete prefix. |
| `spine.curve-time-overshoot-clamped` | `spineParse.ts:511` | Recover | No | V | Non-invertible Bezier x control values are clamped to a usable time domain. |
| `spine.per-component-curve-easing-unsupported` | `spineParse.ts:520` | Skip | No | S | Divergent per-component curves cannot map to one track segment easing. |
| `spine.ik-timeline-unsupported` | `spineParse.ts:617` | Skip | No | S | IK constraint timelines are recognized but not modeled. |
| `spine.transform-timeline-unsupported` | `spineParse.ts:618` | Skip | No | S | Transform-constraint timelines are recognized but not modeled. |
| `spine.path-timeline-unsupported` | `spineParse.ts:619` | Skip | No | S | Path-constraint timelines are recognized but not modeled. On a result also carrying `spine.draworder-keyframe-unresolved`, the `Drop` must win and this remains only supporting evidence. |
| `spine.deform-timeline-unsupported` | `spineParse.ts:620` | Skip | No | S | Attachment deformation timelines are recognized but not modeled. |
| `spine.event-timeline-unsupported` | `spineParse.ts:621` | Skip | No | S | Event timelines are recognized but not modeled. |
| `spine.slot-rgb-timeline-unsupported` | dynamic emitter `spineParse.ts:658`; source-locked example `spineParse.test.ts:717-722` | Skip | No | S | Partial RGB animation cannot map to the one packed slot color without inventing setup blending. |
| `spine.slot-alpha-timeline-unsupported` | dynamic emitter `spineParse.ts:658`; source-locked example `spineParse.test.ts:717-722` | Skip | No | S | Alpha-only animation cannot map to the one packed slot color without inventing setup blending. |
| `spine.slot-rgba2-timeline-unsupported` | dynamic emitter `spineParse.ts:658`; source-locked example `spineParse.test.ts:717-722` | Skip | No | S | Two-color/dark-color data has no `Slot2D` representation. |

### Unbounded Skeleton2D kind emitters

Three source sites turn unvalidated input strings into diagnostic kind components:

| Source site | Runtime domain | Exact-equality review consequence |
| --- | --- | --- |
| `dragonBonesParse.ts:675` | Every string `display.type` except the handled `image` and `mesh` becomes `dragonbones.${type}-display-unsupported`. | The three canonical source-documented values above can be reviewed exactly, but arbitrary/extension values are unbounded. They must remain unreviewed non-choice `Skip` unless the emitter is normalized to a stable kind or a later source enum bounds the domain. |
| `spineParse.ts:169` | Every string `attachment.type` except handled `region` and `mesh` becomes `spine.${type}-attachment-unsupported`. | The five canonical source-documented values above are reviewable; arbitrary values cannot be pre-enumerated for exact equality. |
| `spineParse.ts:658` | Every slot-timeline object key except handled `rgba` and `attachment` becomes `spine.slot-${kind}-timeline-unsupported`. | The three source-locked values above are reviewable; arbitrary vendor/future keys are unbounded. No wildcard/prefix disposition is safe. |

This is a source-level completeness finding, not a reason to infer values from a corpus. An exact disposition registry can safely contain only the enumerated exact values; unknown generated values must retain ordinary `Skip` behavior.

## SVG

The dynamic element-kind emitter is finitely bounded by `isUnsupportedSvgElementName` at `svgDocument.ts:1699-1708`, so all eight possible values are enumerated exactly. Seven have the charter-backed `C` role; `pattern` is a genuine static-vector capability gap.

| Exact kind | Source emission/definition | Disposition | Choice | Flow | Semantic meaning and reviewer rationale |
| --- | --- | --- | --- | --- | --- |
| `svg.invalid-document` | `packages/scene2d-formats/src/svgDocument.ts:95` | Reject | No | R | XML parsing/root validation yields no SVG document. |
| `svg.unsupported-filter` | style branch `svgDocument.ts:273`; bounded element emitter `:1602`, value `:1704` | Skip | Yes | C | Filter/effect pipelines are outside the chartered static-vector boundary. |
| `svg.unresolved-clip-reference` | `svgDocument.ts:305,604` | Drop/Reject | No | D/R | Missing target drops the clip; a clip recursion makes the construction reject. |
| `svg.object-bounding-box-clip-unmeasurable-bounds` | `svgDocument.ts:325` | Skip | No | S | Object-bounding-box clip units cannot be resolved without measurable target bounds. |
| `svg.mask-as-hard-clip` | `svgDocument.ts:337` | Recover | No | V | A mask is approximated by hard clipping rather than alpha/luminance masking. |
| `svg.mixed-clip-rule` | `svgDocument.ts:468` | Recover | No | V | Mixed winding rules are flattened to one usable clip rule. |
| `svg.unsupported-clip-text` | `svgDocument.ts:584` | Skip | No | S | Text cannot currently contribute geometry to a clip path. |
| `svg.clip-nested-intersection-unsupported` | `svgDocument.ts:614` | Skip | No | S | A transformed object-bounding-box nested clip intersection has no correct representation. |
| `svg.unresolved-use` | `svgDocument.ts:641,652,944,955` | Drop | No | D | A `use` element has no href/target; the instance is omitted. |
| `svg.recursive-use` | `svgDocument.ts:641,944` | Reject | No | R | `use` reference recursion cannot yield a finite subtree. |
| `svg.unknown-element` | `svgDocument.ts:731` | Skip | No | S | An element outside both modeled and explicitly bounded unsupported sets is unknown input, not deliberate scope. |
| `svg.image-missing-href` | `svgDocument.ts:757` | Drop | No | D | An image element provides no resource reference. |
| `svg.image-resolver-unwired` | `svgDocument.ts:757` | Drop | No | D | Caller did not supply the image-resource resolver required to retain the image. |
| `svg.unresolved-image` | `svgDocument.ts:757` | Drop | No | D | The supplied resolver cannot produce the referenced image resource. |
| `svg.tspan-position-flattened` | `svgDocument.ts:906` | Recover | No | V | Per-`tspan` positioning/transform is flattened into a usable text representation. |
| `svg.unresolved-fill-gradient` | `svgDocument.ts:1032` | Drop | No | D | A fill gradient reference cannot be resolved, so that paint is lost. |
| `svg.unresolved-stroke-gradient` | `svgDocument.ts:1045` | Drop | No | D | A stroke gradient reference cannot be resolved, so that paint is lost. |
| `svg.gradient-transform-singular` | `svgDocument.ts:1382` | Recover | No | V | A non-invertible gradient transform falls back to a usable transform. |
| `svg.recursive-gradient` | `svgDocument.ts:1412` | Reject | No | R | Gradient inheritance cycles and cannot be resolved. |
| `svg.unresolved-gradient-reference` | `svgDocument.ts:1412` | Drop | No | D | Gradient inheritance names no definition; inherited paint data is lost. |
| `svg.unsupported-animate` | bounded emitter `svgDocument.ts:1602`, value `:1701` | Skip | Yes | C | SMIL animation is outside static SVG import. |
| `svg.unsupported-animateMotion` | bounded emitter `svgDocument.ts:1602`, value `:1702` | Skip | Yes | C | Motion animation is outside static SVG import. |
| `svg.unsupported-animateTransform` | bounded emitter `svgDocument.ts:1602`, value `:1703` | Skip | Yes | C | Transform animation is outside static SVG import. |
| `svg.unsupported-foreignObject` | bounded emitter `svgDocument.ts:1602`, value `:1705` | Skip | Yes | C | Foreign/live document embedding is outside static SVG import. |
| `svg.unsupported-pattern` | bounded emitter `svgDocument.ts:1602`, value `:1706` | Skip | No | S | Pattern paint is static-vector content but lacks a realization; capability gap. |
| `svg.unsupported-script` | bounded emitter `svgDocument.ts:1602`, value `:1707` | Skip | Yes | C | Script execution is outside static SVG import. |
| `svg.unsupported-set` | bounded emitter `svgDocument.ts:1602`, value `:1708` | Skip | Yes | C | SMIL property animation is outside static SVG import. |

## SWF

| Exact kind | Source emission/definition | Disposition | Choice | Flow | Semantic meaning and reviewer rationale |
| --- | --- | --- | --- | --- | --- |
| `swf.timeline-instantiation-failed` | `packages/swf/src/swfDocument.ts:138` | Reject | No | R | Parsed document cannot instantiate its root timeline. |
| `swf.unknown-linkage-name` | `swfDocument.ts:189` | Reject | No | R | Requested exported/linkage symbol does not exist. |
| `swf.uncompressed-signature-invalid` | `swfDocument.ts:510` | Reject | No | R | Decompressed bytes do not contain a valid uncompressed SWF signature. |
| `swf.header-fields-invalid` | `swfDocument.ts:522` | Reject | No | R | Version/declared length fields cannot describe the available stream. |
| `swf.stage-bounds-unreadable` | `swfDocument.ts:533` | Reject | No | R | Required stage rectangle cannot be read. |
| `swf.header-truncated` | `swfDocument.ts:541` | Reject | No | R | Required frame-rate/count header data is truncated. |
| `swf.invalid-signature` | `swfDocument.ts:557` | Reject | No | R | Source is too short or lacks a valid signature. |
| `swf.unknown-container` | `swfDocument.ts:574` | Reject | No | R | Container compression signature is unknown. |
| `swf.no-decompressor-registered` | `swfDocument.ts:590` | Reject | No | R | Required container decompressor is not installed; the adapter normally registers Deflate explicitly. |
| `swf.declared-length-too-small` | `swfDocument.ts:604` | Reject | No | R | Declared file length is smaller than the header/stream start. |
| `swf.truncated-container` | `swfDocument.ts:621` | Reject | No | R | Container does not contain the declared body bytes. |
| `swf.decompression-failed` | `swfDocument.ts:636` | Reject | No | R | Registered decompressor cannot produce the declared body. |
| `swf.appearance-without-node` | `swfDocument.ts:810` | Drop | No | D | Blend/filter appearance exists for a placement that produced no node. |
| `swf.mask-without-geometry` | `swfDocument.ts:951` | Recover | No | V | Invalid mask geometry is ignored so covered content can remain. |
| `swf.nested-mask-collapsed` | `swfDocument.ts:987` | Skip | No | S | Nested mask intersection cannot be represented and is collapsed. |
| `swf.edit-text-font-name-unresolved` | `swfDocument.ts:1251` | Drop | No | D | Edit text names no resolvable embedded font. |
| `swf.sprite-bounds-short` | `swfDocument.ts:1433` | Drop | No | D | Sprite bounds omit child geometry whose bounds cannot be resolved. |
| `swf.blend-mode-behind-unread-filters` | `swfDocument.ts:1499` | Drop | No | D | Parser cannot reach a placement blend mode after malformed filter data. |
| `swf.abc-frame-scripts-unreadable` | `swfDocument.ts:1796` | Drop | No | D | ABC payload cannot yield the recognized frame-script bindings. |
| `swf.text-shape-uncomposable` | `swfDocument.ts:1826` | Drop | No | D | Pending text/glyph shape data cannot be composed into a text target. |
| `swf.frame-script-declined` | `swfDocument.ts:1878,1896` | Skip | Yes | C | Whole non-playback script is deliberately declined by charter; primary only when otherwise clean, facet when mixed. |
| `swf.stream-sound-format` | `swfDocument.ts:1977` | Skip | No | S | Stream audio uses a format the current resource path cannot realize. |
| `swf.label-past-last-frame` | `swfDocument.ts:2005` | Drop | No | D | Frame labels beyond the realized timeline are discarded. |
| `swf.cue-past-last-frame` | `swfDocument.ts:2018` | Drop | No | D | Timeline cues beyond the realized frame range are discarded. |
| `swf.define-button-sound` | map definition `swfDocument.ts:3034`, emitter `:2047` | Skip | No | S | Button transition sounds need an interaction-state model that does not exist. |
| `swf.import-assets` | map definition `swfDocument.ts:3035,3037`, emitter `:2047` | Skip | No | S | Cross-document imports cannot resolve without the referenced external SWF. |
| `swf.video-frame-payload` | map definition `swfDocument.ts:3036`, emitter `:2047` | Skip | No | S | Codec packets are not a browser-playable video resource and no decoder path is installed. |
| `swf.define-binary-data` | map definition `swfDocument.ts:3038`, emitter `:2047` | Skip | Yes | C | Arbitrary bytes have no display meaning and are deliberately outside scene import. |
| `swf.define-font-4` | map definition `swfDocument.ts:3039`, emitter `:2047` | Skip | No | S | Embedded font bytes require a general font-format producer not supplied at this importer seam. |
| `swf.button-interaction-state` | `swfDocument.ts:2087` | Skip | No | S | Only the up-state timeline is modeled; over/down/hit interaction states have no state-machine target. |
| `swf.font-glyph-table` | `swfDocument.ts:2139` | Drop | No | D | Glyph table cannot be decoded into usable outlines. |
| `swf.font-character-id-reused` | `swfDocument.ts:2156` | Drop | No | D | A duplicate character id prevents a font definition from being retained consistently. |
| `swf.scene-names` | `swfDocument.ts:2264` | Skip | No | S | Named scene ranges have no timeline-scene representation. |
| `swf.edit-text-unparseable` | `swfDocument.ts:2329` | Drop | No | D | Edit-text definition body cannot be decoded. |
| `swf.shape-body-unreadable` | `swfDocument.ts:2377` | Recover | No | V | Unreadable shape body yields a recoverable/empty shape definition rather than aborting the document. |
| `swf.morph-shape-undecodable` | `swfDocument.ts:2421` | Drop | No | D | Morph geometry cannot be decoded and the character is omitted. |
| `swf.jpeg-tables-missing` | `swfDocument.ts:2457` | Drop | No | D | Legacy JPEG data lacks the shared tables needed to construct an image. |
| `swf.jpeg-tables-unsplittable` | `swfDocument.ts:2482` | Drop | No | D | Legacy table/image byte streams cannot be separated into a usable image. |
| `swf.jpeg-alpha-stream` | `swfDocument.ts:2545` | Skip | No | S | Separate compressed alpha is recognized but no bitmap-composition realization applies it. |
| `swf.filter-field-unrepresentable` | `packages/swf/src/swfFilter.ts:82,169` | Skip | No | S | Authored filter passes/placement fields cannot map to the Flight filter descriptor. |
| `swf.abc-frame-script-declined` | `packages/swf/src/swfFrameAction.ts:180` | Drop | No | D | An ABC frame-script binding is found but its method body/commands cannot be retained; actual authored behavior is lost. |
| `swf.morph-path-pair-declined` | `packages/swf/src/swfMorphShape.ts:75` | Drop | No | D | Start/end paths cannot form a compatible morph pair and are omitted. |
| `swf.fill-matrix-singular` | `packages/swf/src/swfShape.ts:692` | Recover | No | V | A singular fill transform is replaced by a usable fallback matrix. |
| `swf.font-glyph-outline` | `packages/swf/src/swfText.ts:105` | Drop | No | D | Individual unreadable glyph outlines are omitted from the font source. |

## Precedence and the 28-case masking regression

Disposition is selected from exact source evidence before any kind spelling is considered. The scorer precedence is:

1. no returned import or any `Reject` -> `rejected`;
2. any `Drop` or `Recover` -> `degraded`;
3. any non-choice `Skip` -> `unsupported`;
4. any reviewed deliberate-choice kind -> `intentional-choice`;
5. otherwise -> `imported`.

Reviewed choice is also an orthogonal facet whenever it coexists with a stronger primary. This order makes these exact regression constructions defeating examples for the removed substring rule (`conformance/core/fixture-conformance.test.ts` at `b8d9c121e`, lines 127-155):

- 3 synthetic glTF cases carry `Recover gltf.unsupported-version` and must be `degraded`, not `unsupported`.
- 12 synthetic MD5 cases carry `Recover md5mesh.unsupported-version` and must be `degraded`, not `unsupported`.
- 13 synthetic Spine cases carry `Skip spine.path-timeline-unsupported` plus `Drop spine.draworder-keyframe-unresolved`; the exact `Drop` defeats the `Skip`, so all remain `degraded`.

The same rule applies to every other spelling collision in the table, including `Recover md5anim.unsupported-version`, `Recover gltf.texcoord-set-unsupported`, and `Drop gltf.primitive-unsupported-mode`. No prefix, suffix, or substring participates in precedence.

## Corpus availability and zero-count evidence

No result-population counts are reported from this workspace.

Read-only evidence:

- `.artifacts/conformance/fixture-imports.json` is absent.
- `.cache/fixtures/extracted/full/` contains one stamped tree, `mesh-legacy-fixtures`, not the complete 35-tree release population.
- Its `.flight-fixtures.json` stamp names release `0.1.1`, variant `full`, one pack, and 195 verified fixture files.
- `.cache/fixtures/packs/` contains only that pack's content-addressed archive, `f311cef73a4ee07e75ecf6921271de7f5dbc7e815fdecb505d5878f6223d456c.tar.gz`.
- `.artifacts/import-conformance/` is a different conformance lane/cache and is not a substitute for the fixture-import report.

Therefore the exact result count for every table row is **not measured here**. The report contains zero result-count claims, zero family populations, and zero reconstructed choice totals.

### Exact non-network reproduction prerequisites

The stock acquisition CLI always fetches the pinned release `index.json` and `SHA256SUMS`, even with warm archives, so `npm run fixtures -- --all` is not an offline command. A non-network reproduction requires a cache copied from a previously completed and verified acquisition:

1. Provide a directory containing the complete release `0.1.1` `full` extraction under `extracted/full/`, including all 35 tree directories and each tree's `.flight-fixtures.json` stamp.
2. Each stamp must say `tag: "0.1.1"`, `variant: "full"`, and include every merged pack record with its archive filename, sha256, metadata-file count, and verified fixture-file count. The extracted trees must still contain the manifest-declared paths; copying only loose result JSON is insufficient.
3. Point `FLIGHT_FIXTURES_DIR` at that cache directory. No network is used by the conformance runner itself.
4. From the exact source revision to be reviewed, run `npm run conformance:fixtures -- --output .artifacts/conformance/fixture-imports.json` with no adapter, pack, variant, or limit filter. Preserve the resulting report together with its `fixtureRelease`, `selection`, 35-tree census, and per-result exact `diagnosticKinds` arrays.
5. Before applying dispositions, verify the report's source revision and schema are the intended review target and that all 35 stamped trees were selected. Only then may exact-equality kinds from this table be joined to results and counted.

If only archives are supplied, the repository currently has no offline acquisition mode that consumes a saved release manifest/checksum pair; either the fully verified extracted cache above must be supplied, or a separately authorized offline-acquisition feature must first be implemented. No external corpus fetch is authorized by this audit.

## Review outcome

- The table enumerates 240 unique exact values and is complete for all literal kinds, bounded template values, bounded SWF map values, and source-documented canonical Skeleton2D values reachable from the seven adapters. A syntax-tree inventory cross-check found no source literal diagnostic kind missing from the table.
- Ten exact kinds have source-backed deliberate-choice status: MD5 bounds, seven charter-excluded SVG live-document/filter kinds, SWF frame-script decline, and SWF binary data.
- Three Skeleton2D emitters have unbounded input-derived kind domains. Their unknown runtime values cannot be admitted to an exact-equality disposition registry by wildcard; they must remain ordinary non-choice `Skip` until source normalization or a bounded enum makes them reviewable.
- Implementation remains frozen. This artifact authorizes no scoring edit, no disposition application, and no result-count claim.
