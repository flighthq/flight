# New Package Spec: @flighthq/contacts

**Represents:** System address-book integration — query, search, pick, and (where the host allows) create/update contacts as plain-data records over a swappable backend, with a web sentinel backend where the platform exposes no contacts API.

**Requested by:** application-platform

## Fits

- **Architecture slot:** a **command-style platform capability** in the Platform Integration Suite, identical in shape to `dialog`, `clipboard`, `geolocation`, `share`, and `webcam`. It exposes flat free functions plus the backend seam trio `getContactsBackend` / `setContactsBackend(backend | null)` / `createWebContactsBackend`. There is no resident entity-of-signals here; contacts is a request/response capability, not an event stream. (A future inbound _change-observer_ — "contacts were edited" — is an event-style sibling, called out under Open design questions, not this cell.)
- **Web reality dictates the default backend.** The browser has no general contacts API; the only standardized surface is the **Contact Picker API** (`navigator.contacts.select`), which is a one-shot user-gated picker available on a narrow set of mobile browsers and nothing else. So `createWebContactsBackend()` implements `pickContacts` over the Contact Picker where present and returns sentinels (`null` / `[]` / `false` / `-1`) for everything else (enumeration, search, create, update, delete) — never throwing. This is the canonical "web sentinel where unavailable" backend the brief asks for. Native hosts (Capacitor `@capacitor-community/contacts`, an Electron→OS bridge, a C/C++ shell) register a fuller backend via `setContactsBackend`.
- **Dependencies:** `@flighthq/types` (header layer — all shapes live here first) and `@flighthq/signals` only if/when the permission-change or contacts-changed observer lands (opt-in `enable*` group). No dependency on `resources`, `media`, or `surface`; a contact photo is delivered as a plain `ArrayBuffer` + mime descriptor, not a decoded `ImageSource`, keeping the seam value-typed. Contacts records are plain data, so the package is a near-zero-copy **mixable leaf** for the Rust port.
- **Neighbor packages:** `@flighthq/contacts-formats` for **vCard / jCard import-export** (RFC 6350 `.vcf` parse/serialize, jCard JSON), following the `-formats` importer/parser convention. Parsing vCard text into `Contact` records and serializing back is format work, not capability work, and must tree-shake away for apps that only pick a contact. CSV address-book import also lives here.
- **Rust crate:** `flighthq-contacts` (native default backend over platform address-book FFI where a target provides it; `host-web` supplies the wasm Contact-Picker fill). 1:1 conformance against the TS package; records are plain-data value seams ideal for the conformance instrument. `flighthq-contacts-formats` mirrors the vCard neighbor.
- **`*Kind` strings** for the multi-value field labels and channel types that every contacts API carries (see Bronze), kept as open string registries with bare names reserved for built-ins and vendor-prefixed custom labels.

## Bronze

The minimum viable, genuinely useful version: **pick a contact** and **read its core fields**. The Contact Picker is the one thing that actually works on the web today, so it is the spine of Bronze; everything else degrades to a sentinel until a native backend is installed.

Types in `@flighthq/types` first (`Contact.ts`):

- `Contact` — the plain record entity: `id` (`string`, backend-stable or `''` when the source is anonymous like a picker result), `displayName`, `givenName`, `familyName`, `organizationName`, `phoneNumbers` (`ContactPhone[]`), `emailAddresses` (`ContactEmail[]`), `photo` (`ContactPhoto | null`).
- `ContactPhone` — `{ value: string; label: ContactLabel }`. `ContactEmail` — `{ value: string; label: ContactLabel }`.
- `ContactPhoto` — `{ bytes: ArrayBuffer; mimeType: string }` (value-typed; no decode).
- `ContactLabel` string ids (open registry): `HomeContactLabel`, `WorkContactLabel`, `MobileContactLabel`, `MainContactLabel`, `OtherContactLabel`.
- `ContactFieldKind` string ids — the picker property selector: `NameContactField`, `PhoneContactField`, `EmailContactField`, `PhotoContactField`. (Maps 1:1 to Contact Picker `properties`.)
- `ContactPickerOptions` — `{ fields: Readonly<ContactFieldKind[]>; allowMultiple: boolean }`.
- `ContactsBackend` — the seam. Bronze methods: `pickContacts(options): Promise<Contact[]>`, `getAvailableContactFields(): Promise<ContactFieldKind[]>`, `requestContactsPermission(): Promise<boolean>`. All other methods (Silver+) return sentinels in the web backend.

Functions in `@flighthq/contacts`:

- `createContact(): Contact`, `createContactPhone(): ContactPhone`, `createContactEmail(): ContactEmail` — explicit allocation per the constructor rule.
- `pickContact(options?): Promise<Contact | null>` — single-pick convenience (`null` on cancel/unsupported).
- `pickContacts(options?): Promise<Contact[]>` — multi-pick (`[]` on cancel/unsupported).
- `getAvailableContactFields(): Promise<ContactFieldKind[]>` — what the active backend can return (`[]` if none).
- `requestContactsPermission(): Promise<boolean>` — `false` where no permission model exists.
- `hasContactsSupport(): boolean` — synchronous capability probe over the active backend.
- Backend seam: `getContactsBackend()`, `setContactsBackend(backend | null)`, `createWebContactsBackend()` (Contact Picker where present; sentinels elsewhere).

## Silver

Competitive and solid: full **read access to the address book** (enumerate, search, fetch one), the complete multi-value field set a good contacts library exposes, and cross-backend consistency. This is the tier where a native host backend becomes worthwhile.

Types added to `@flighthq/types`:

- Extend `Contact` with the full canonical field set: `middleName`, `namePrefix`, `nameSuffix`, `nickname`, `jobTitle`, `department`, `postalAddresses` (`ContactPostalAddress[]`), `urls` (`ContactUrl[]`), `birthday` (`ContactDate | null`), `note`.
- `ContactPostalAddress` — `{ label: ContactLabel; street; city; region; postalCode; country; isoCountryCode }`.
- `ContactUrl` — `{ value: string; label: ContactLabel }`. `ContactDate` — `{ year: number; month: number; day: number }` (year `-1` when unknown, matching real address books).
- Additional `ContactLabel` ids: `BillingContactLabel`, `ShippingContactLabel`, `FaxContactLabel`, `PagerContactLabel`.
- Additional `ContactFieldKind` ids: `PostalAddressContactField`, `OrganizationContactField`, `BirthdayContactField`, `NoteContactField`, `UrlContactField`.
- `ContactQuery` — `{ searchText: string; fields: Readonly<ContactFieldKind[]>; limit: number; offset: number }` (paged; `limit -1` = unbounded).
- `ContactPermissionStatus` string ids: `GrantedContactPermission`, `DeniedContactPermission`, `PromptContactPermission`, `UnsupportedContactPermission`.
- Extend `ContactsBackend` with: `getAllContacts(query): Promise<Contact[]>`, `findContacts(query): Promise<Contact[]>`, `getContactById(id): Promise<Contact | null>`, `getContactCount(): Promise<number>`, `getContactsPermissionStatus(): Promise<ContactPermissionStatus>`.

Functions added to `@flighthq/contacts`:

- `getAllContacts(query?): Promise<Contact[]>` — full enumeration with paging (`[]` on web/unsupported).
- `findContacts(query): Promise<Contact[]>` — text search across the selected fields.
- `getContactById(id): Promise<Contact | null>` — single fetch (sentinel `null` on miss).
- `getContactCount(): Promise<number>` — `-1` when the backend cannot count.
- `getContactsPermissionStatus(): Promise<ContactPermissionStatus>` — non-mutating status read distinct from the request.
- `getContactPhone(contact, label): ContactPhone | null`, `getContactEmail(contact, label): ContactEmail | null` — labeled multi-value accessors with `null` sentinel.
- `getPrimaryContactPhone(contact): ContactPhone | null`, `getPrimaryContactEmail(contact): ContactEmail | null` — "best" pick (main → mobile → first).
- `getContactFullName(contact): string` — composes prefix/given/middle/family/suffix with locale-neutral ordering.
- `cloneContact(source, out?): Contact` — deep copy for safe local mutation (out-param, alias-safe).
- **Neighbor `@flighthq/contacts-formats`** ships at Silver: `parseVCardContacts(text): Contact[]`, `serializeContactsToVCard(contacts): string` (RFC 6350), `parseJCardContacts(json): Contact[]`, `serializeContactsToJCard(contacts): string`.

## Gold

Authoritative / AAA: **write access**, grouping, account/source awareness, change observation, exhaustive field and label coverage, full error/permission edge handling, and 1:1 Rust-port parity. Nothing a contacts-domain expert would find missing.

Types added to `@flighthq/types`:

- `ContactGroup` — `{ id; name; memberIds: Readonly<string[]> }`. `ContactSource` — `{ id; name; type }` (local / iCloud / Google / Exchange account a contact lives in).
- `ContactInstantMessage`, `ContactSocialProfile`, `ContactRelation` — `{ value/handle; service/label }` rounding out the canonical multi-value set; `ContactPhoneticName` (`{ givenName; familyName; middleName }`) for CJK/JP address books.
- Extend `Contact` with `phoneticName`, `instantMessages`, `socialProfiles`, `relations`, `sourceId`, `isStarred`, `rawId` (provider-native key for write-back).
- `ContactWriteResult` — `{ ok: boolean; id: string; error: ContactErrorKind | null }`. `ContactErrorKind` string ids: `PermissionDeniedContactError`, `NotFoundContactError`, `ConflictContactError`, `ReadOnlyContactError`, `UnsupportedContactError`.
- `ContactChange` — `{ kind: ContactChangeKind; id: string }`; `ContactChangeKind` ids `AddedContactChange`, `UpdatedContactChange`, `RemovedContactChange`.
- `ContactsSignals` — the opt-in signal group entity carrying `onContactsChanged(change)` and `onContactsPermissionChanged(status)`.
- Extend `ContactsBackend` with the full write + observe surface: `createContact(contact)`, `updateContact(contact)`, `deleteContact(id)`, `getContactGroups()`, `getContactsInGroup(groupId)`, `getContactSources()`, `subscribeContactChanges(handler): () => void`.

Functions added to `@flighthq/contacts`:

- Write commands: `createSystemContact(contact): Promise<ContactWriteResult>`, `updateSystemContact(contact): Promise<ContactWriteResult>`, `deleteSystemContact(id): Promise<boolean>` — all return sentinel/`ReadOnlyContactError` on the web backend.
- Grouping: `getContactGroups(): Promise<ContactGroup[]>`, `getContactsInGroup(groupId, query?): Promise<Contact[]>`, `addContactToGroup(contactId, groupId)`, `removeContactFromGroup(contactId, groupId)`.
- Sources: `getContactSources(): Promise<ContactSource[]>`, `getDefaultContactSource(): Promise<ContactSource | null>`.
- Change observation (opt-in signals, per the `enable*` rule): `enableContactsSignals(): ContactsSignals`, with the group inert until enabled; `onContactsChanged` over the backend `subscribeContactChanges` seam.
- Full accessor symmetry for every multi-value field (`getContactPostalAddress`, `getContactUrl`, `getContactSocialProfile`, …) and `setContactPhone(out, …)`-style out-param mutators that keep label invariants.
- `mergeContacts(primary, secondary, out?): Contact` — dedup/merge two records (out-param, alias-safe).
- `contacts-formats` Gold: round-trip fidelity tests, vCard 3.0 _and_ 4.0, photo (`PHOTO`) base64 round-trip, grouping (`CATEGORIES`), and CSV (Google/Outlook column maps).
- **Rust parity:** `flighthq-contacts` + `flighthq-contacts-formats` reach 1:1 conformance — value-typed records fingerprinted through the conformance instrument; native backend over a platform address-book FFI behind the `native` cargo feature, web fill in `host-web`.
- **Coverage:** colocated unit tests per source file, a fake `ContactsBackend` for deterministic tests of every function and sentinel path, permission-state matrix tests, and paging/limit edge tests.

## Boundaries

- **Not a calendar.** `@flighthq/calendar` (events/reminders, requested alongside contacts) is a separate cell; only the address book lives here.
- **vCard/jCard/CSV parsing stays in `@flighthq/contacts-formats`**, never in the core capability — importers must tree-shake away for pick-only apps.
- **Contact photos are plain bytes, not decoded images.** Decoding a `ContactPhoto.bytes` into an `ImageSource` is the caller's job via `@flighthq/surface`/`resources`; contacts does not depend on the image stack.
- **No UI.** A contact-picker _widget_ (in-app list/search UI) is application/display-object territory; this package only brokers the OS picker and data.
- **Permission UI/prompts** beyond the request/status calls belong to the host; contacts exposes only the boolean/status seam.
- **No persistence/caching layer.** Contacts is a live view over the system backend; an app-owned cache or sync engine is out of scope.

## Open design questions

- **Single vs. multi-value `id` stability.** Picker results have no stable id (`id: ''`); native backends do. Should `Contact.id` be split into a stable `rawId` + an ephemeral session key, or is a sentinel `''` enough? (Currently: sentinel `''`, `rawId` added at Gold for write-back.)
- **Change observer as event sibling.** Should "contacts changed" graduate from the opt-in `ContactsSignals` group into a full event-style capability (its own `create*/attach*/detach*/dispose*` entity) mirroring `network`/`power`, given how few backends actually emit it?
- **Photo delivery.** Bytes-on-the-record vs. a lazy `getContactPhoto(id): Promise<ContactPhoto | null>` fetch — the address book can be huge and inlining every thumbnail in `getAllContacts` is costly. Likely: omit photo from list queries, fetch on demand at Silver.
- **Label registry breadth.** Real platforms (CNContact, Android) allow arbitrary custom labels. Confirm the vendor-prefix convention (`'acme.School'`) is the answer rather than a free `customLabel` string field, to keep one consistent kind model.
- **Permission timing on web.** The Contact Picker grants per-invocation with no persistent permission; `requestContactsPermission` is effectively a no-op returning `false`/`UnsupportedContactPermission`. Confirm callers should rely on `pickContacts` resolving `[]` rather than a separate permission gate on web.
- **Rust native backend reach.** Which native targets get a real address-book FFI vs. a sentinel backend? Desktop OS contacts FFI is uneven; the realistic native story may be Capacitor/mobile-only, with desktop returning sentinels like the web.
