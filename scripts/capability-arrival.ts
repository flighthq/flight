import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

import { discoverEntries } from '../packages/tool-capture/src/captureEntries.js';
import { functionalScene3DFile } from '../packages/tool-capture/src/functionalScene3Ds.js';

export type ArrivalSuite = 'examples' | 'functional';

export interface GeneratedEntry {
  readonly consumer: string;
  readonly renderer: string;
  readonly source: string;
  readonly suite: ArrivalSuite;
}

export interface CapabilityArrivalOptions {
  readonly root?: string;
  /** Test seam: mutate the exact source emitted by a runner's Vite plugin. */
  readonly transformGeneratedEntry?: (entry: Readonly<GeneratedEntry>) => string;
  /** Test seam: mutate an in-repo source without changing the working tree. */
  readonly transformSource?: (source: Readonly<RepositorySource>) => string;
}

export interface RepositorySource {
  /** POSIX-style path relative to the repository root. */
  readonly path: string;
  readonly source: string;
}

export interface CapabilityArrivalFailure {
  readonly capability?: string;
  readonly consumer?: string;
  readonly message: string;
  readonly kind: 'arrival' | 'policy' | 'population' | 'registry';
}

interface CapabilityRecord {
  readonly enabler: string;
  readonly label: string;
  readonly providerDirectory: string;
  readonly registrar: string;
  readonly selector: string;
}

interface Registry {
  readonly aggregate: ReadonlySet<string>;
  readonly byCall: ReadonlyMap<string, string>;
  readonly byLabel: ReadonlyMap<string, CapabilityRecord>;
  readonly enablerClosure: ReadonlyMap<string, ReadonlySet<string>>;
  readonly failures: readonly CapabilityArrivalFailure[];
}

interface Page {
  readonly consumer: string;
  readonly generatedSource: string;
  readonly renderer: string;
  readonly rootFiles: readonly string[];
  readonly suite: ArrivalSuite;
}

const EXPECTED_AGGREGATE = [
  'Audio',
  'AudioDevice',
  'BitmapEncode',
  'BitmapReadback',
  'Device',
  'FileSystem',
  'FontLoading',
  'Geolocation',
  'GlyphRasterizer',
  'Image',
  'SoftKeyboard',
  'Lifecycle',
  'Permission',
  'Platform',
  'Raster2DSurface',
  'Sensors',
  'VideoCapability',
  'Webcam',
] as const;

// These capabilities arrive as stable slots on the explicit Web Host, not through the legacy
// process-global enabler registry.
const EXPECTED_EXPLICIT_HOST = ['MediaSession', 'Power', 'Screen', 'Storage'] as const;

// These are deliberately not part of enableHostWeb(): applications opt into application services,
// status chrome, and renderer surfaces explicitly. Keeping the names here turns a newly added web
// enabler into a reviewable registry change instead of silently treating it as either aggregate or
// excluded.
const EXPECTED_EXCLUDED = ['App', 'Protocol', 'StatusBar', 'GlRenderSurface', 'WgpuRenderSurface'] as const;

const EXPECTED_FACTORIES = [
  'Accessibility',
  'Connectivity',
  'Cursor',
  'MediaSession',
  'MediaSessionAction',
  'SoftKeyboardChange',
  'SoftKeyboardInfo',
  'SoftKeyboardVisibility',
] as const;

const EXPECTED_POPULATIONS = {
  examples: { canvas: 28, dom: 24, webgl: 40, webgpu: 40 },
  functional: { canvas: 91, dom: 53, webgl: 188, webgpu: 168 },
} as const;

const EXPECTED_TOTALS = { examples: 132, functional: 500 } as const;

type Container = ts.SourceFile | ts.FunctionLikeDeclaration;

interface ContainerFacts {
  readonly capabilities: Set<string>;
  readonly edges: Set<Container>;
  readonly installations: Set<string>;
}

class SemanticGraph {
  private readonly cache = new Map<Container, ContainerFacts>();
  private readonly checker: ts.TypeChecker;
  private readonly selectors = new Map<string, readonly CapabilityRecord[]>();
  private readonly slots = new Map<string, Map<string, readonly CapabilityRecord[]>>();

  constructor(
    private readonly program: ts.Program,
    private readonly registry: Registry,
  ) {
    this.checker = program.getTypeChecker();
    for (const capability of registry.byLabel.values()) {
      const records = this.selectors.get(capability.selector) ?? [];
      this.selectors.set(capability.selector, [...records, capability]);
      this.deriveSelectorSlots(capability);
    }
  }

  source(path: string): ts.SourceFile | undefined {
    return this.program.getSourceFile(resolve(path));
  }

  reachable(
    roots: readonly Container[],
    excludedFiles: ReadonlySet<string>,
  ): { capabilities: Set<string>; installations: Set<string> } {
    const capabilities = new Set<string>();
    const installations = new Set<string>();
    const seen = new Set<Container>();
    const pending = [...roots];
    while (pending.length > 0) {
      const container = pending.pop()!;
      if (seen.has(container)) continue;
      seen.add(container);
      const file = resolve(container.getSourceFile().fileName);
      if (excludedFiles.has(file)) continue;
      const facts = this.facts(container);
      for (const capability of facts.capabilities) capabilities.add(capability);
      for (const capability of facts.installations) installations.add(capability);
      for (const edge of facts.edges) pending.push(edge);
    }
    return { capabilities, installations };
  }

  private facts(container: Container): ContainerFacts {
    const cached = this.cache.get(container);
    if (cached !== undefined) return cached;
    const facts: ContainerFacts = { capabilities: new Set(), edges: new Set(), installations: new Set() };
    this.cache.set(container, facts);

    const sourceFile = container.getSourceFile();
    const visit = (node: ts.Node): void => {
      if (node !== container && isContainer(node)) {
        // Inline callbacks and assigned handlers are reachable once their enclosing expression runs.
        // Declarations/variable functions instead acquire an edge at their call or value-use site.
        if (isInlineCallback(node)) facts.edges.add(node);
        return;
      }

      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const expression = node.expression;
        const callName = calledName(expression);
        if (callName !== null) {
          for (const capability of this.installationsForCall(callName)) facts.installations.add(capability);
          const semantic = this.selectors.get(callName) ?? [];
          for (const capability of semantic) {
            if (isWithin(sourceFile.fileName, capability.providerDirectory)) {
              facts.capabilities.add(capability.label);
            }
          }
        }

        const declaration = this.checker.getResolvedSignature(node)?.declaration;
        if (declaration !== undefined) addDeclarationEdges(declaration, facts.edges);
      }

      if (ts.isIdentifier(node) && !isNonSemanticSlotContainer(container, this.registry)) {
        const byName = this.slots.get(resolve(sourceFile.fileName));
        for (const capability of byName?.get(node.text) ?? []) facts.capabilities.add(capability.label);
      }

      // Deliberately visit every static branch. Capture mode can mask a capability with a fabricated
      // resource while the interactive branch still reaches the host (the video example is the proof).
      ts.forEachChild(node, visit);
    };

    if (ts.isSourceFile(container)) {
      for (const statement of container.statements) visit(statement);
    } else if (container.body !== undefined) {
      visit(container.body);
    }
    return facts;
  }

  private deriveSelectorSlots(capability: CapabilityRecord): void {
    for (const sourceFile of this.program.getSourceFiles()) {
      if (!isWithin(sourceFile.fileName, capability.providerDirectory)) continue;
      const selector = sourceFile.statements.find(
        (statement): statement is ts.FunctionDeclaration =>
          ts.isFunctionDeclaration(statement) && statement.name?.text === capability.selector,
      );
      if (selector?.body === undefined) continue;
      const names = new Set<string>();
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node)) {
          let symbol = this.checker.getSymbolAtLocation(node);
          if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0)
            symbol = this.checker.getAliasedSymbol(symbol);
          if (
            symbol?.declarations?.some(
              (declaration) => ts.isVariableDeclaration(declaration) && declaration.parent.parent.parent === sourceFile,
            ) === true
          ) {
            names.add(node.text);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(selector.body);
      if (names.size === 0) continue;
      let byName = this.slots.get(resolve(sourceFile.fileName));
      if (byName === undefined) {
        byName = new Map();
        this.slots.set(resolve(sourceFile.fileName), byName);
      }
      for (const name of names) byName.set(name, [...(byName.get(name) ?? []), capability]);
    }
  }

  private installationsForCall(callName: string): ReadonlySet<string> {
    if (callName === 'enableHostWeb') return this.registry.aggregate;
    const capability = this.registry.byCall.get(callName);
    if (capability === undefined) return new Set();
    return this.registry.enablerClosure.get(callName) ?? new Set([capability]);
  }
}

function isNonSemanticSlotContainer(container: Container, registry: Registry): boolean {
  if (ts.isSourceFile(container)) return false;
  const name = container.name;
  if (name === undefined || !ts.isIdentifier(name)) return false;
  const text = name.text;
  if (/^(?:set|install|reset|explain)/.test(text)) return true;
  return [...registry.byLabel.values()].some(
    (capability) => text === capability.selector || text === capability.registrar,
  );
}

function isContainer(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node)
  );
}

function isInlineCallback(node: ts.FunctionLikeDeclaration): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function addDeclarationEdges(declaration: ts.Declaration, edges: Set<Container>): void {
  if (isContainer(declaration)) {
    edges.add(declaration);
    return;
  }
  if (
    ts.isVariableDeclaration(declaration) &&
    declaration.initializer !== undefined &&
    isContainer(declaration.initializer)
  ) {
    edges.add(declaration.initializer);
    return;
  }
  if (ts.isClassDeclaration(declaration) || ts.isClassExpression(declaration)) {
    for (const member of declaration.members) if (ts.isConstructorDeclaration(member)) edges.add(member);
  }
}

function calledName(expression: ts.LeftHandSideExpression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function isWithin(path: string, directory: string): boolean {
  const rel = relative(resolve(directory), resolve(path));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..');
}

function readSource(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function importedBindings(source: ts.SourceFile): Map<string, { imported: string; module: string }> {
  const imports = new Map<string, { imported: string; module: string }>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const module = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause?.namedBindings === undefined || !ts.isNamedImports(clause.namedBindings)) continue;
    for (const element of clause.namedBindings.elements) {
      imports.set(element.name.text, { imported: element.propertyName?.text ?? element.name.text, module });
    }
  }
  return imports;
}

function callsInside(node: ts.Node): Set<string> {
  const calls = new Set<string>();
  const visit = (child: ts.Node): void => {
    if (ts.isCallExpression(child)) {
      const name = calledName(child.expression);
      if (name !== null) calls.add(name);
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return calls;
}

function selectorForRegistrar(registrar: string): string | null {
  let match = /^install(.+)HostBackend$/.exec(registrar);
  if (match !== null) return `get${match[1]}Backend`;
  match = /^install(.+)HostProvider$/.exec(registrar);
  if (match !== null) return `get${match[1]}Provider`;
  match = /^set(.+)Provider$/.exec(registrar);
  if (match !== null) return `get${match[1]}Provider`;
  return null;
}

function registryFailure(message: string): CapabilityArrivalFailure {
  return { kind: 'registry', message };
}

function sameMembers(actual: Iterable<string>, expected: readonly string[]): boolean {
  const left = [...actual].sort();
  const right = [...expected].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function describeMembers(values: Iterable<string>): string {
  return [...values].sort().join(', ');
}

function deriveRegistry(root: string, transformSource?: CapabilityArrivalOptions['transformSource']): Registry {
  const hostWebDir = join(root, 'packages/host-web/src');
  const failures: CapabilityArrivalFailure[] = [];
  const byLabel = new Map<string, CapabilityRecord>();
  const enablerCalls = new Map<string, Set<string>>();

  for (const file of readdirSync(hostWebDir).filter((name) => /^web.*\.ts$/.test(name) && !name.includes('.test.'))) {
    const path = join(hostWebDir, file);
    const source = readSource(path);
    const imports = importedBindings(source);
    for (const statement of source.statements) {
      if (!ts.isFunctionDeclaration(statement) || statement.name === undefined || statement.body === undefined)
        continue;
      const enabler = statement.name.text;
      if (!/^enableHostWeb[A-Z]/.test(enabler)) continue;
      const label = enabler.slice('enableHostWeb'.length);
      const calls = callsInside(statement.body);
      enablerCalls.set(enabler, calls);
      const registrars = [...calls]
        .map((call) => ({ call, binding: imports.get(call) }))
        .filter(
          ({ call, binding }) => binding !== undefined && selectorForRegistrar(binding.imported ?? call) !== null,
        );
      const expectedRegistrarCount = label === 'SoftKeyboard' ? 3 : 1;
      if (registrars.length !== expectedRegistrarCount) {
        failures.push(
          registryFailure(
            `${enabler} must call exactly ${expectedRegistrarCount} imported host registrar${expectedRegistrarCount === 1 ? '' : 's'}; found ${registrars.length}`,
          ),
        );
        continue;
      }
      // SoftKeyboard intentionally installs three independent provider lanes. Visibility is its command
      // selector; the aggregate enabler itself remains the arrival proof for all three installations.
      const registrar = registrars.at(-1)!.binding!;
      const selector = selectorForRegistrar(registrar.imported);
      const packageMatch = /^@flighthq\/([^/]+)\/(?:contract|[^/]+)$/.exec(registrar.module);
      if (selector === null || packageMatch === null) {
        failures.push(
          registryFailure(`${enabler} registrar ${registrar.imported} has no derivable provider package/selector`),
        );
        continue;
      }
      byLabel.set(label, {
        enabler,
        label,
        providerDirectory: join(root, 'packages', packageMatch[1], 'src'),
        registrar: registrar.imported,
        selector,
      });
    }
  }

  const allExpected = [...EXPECTED_AGGREGATE, ...EXPECTED_EXCLUDED];
  if (!sameMembers(byLabel.keys(), allExpected)) {
    failures.push(
      registryFailure(
        `web enabler registry must be exactly ${allExpected.length} members; expected [${describeMembers(allExpected)}], found [${describeMembers(byLabel.keys())}]`,
      ),
    );
  }

  const aggregateSource = readSource(join(hostWebDir, 'enableHostWeb.ts'));
  const aggregateFunction = aggregateSource.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'enableHostWeb',
  );
  const aggregate = new Set<string>();
  if (aggregateFunction?.body === undefined) {
    failures.push(registryFailure('packages/host-web/src/enableHostWeb.ts must declare enableHostWeb()'));
  } else {
    for (const call of callsInside(aggregateFunction.body)) {
      const label = call.startsWith('enableHostWeb') ? call.slice('enableHostWeb'.length) : '';
      if (byLabel.has(label)) aggregate.add(label);
    }
  }
  if (!sameMembers(aggregate, EXPECTED_AGGREGATE)) {
    failures.push(
      registryFailure(
        `enableHostWeb aggregate must be exactly ${EXPECTED_AGGREGATE.length} members; expected [${describeMembers(EXPECTED_AGGREGATE)}], found [${describeMembers(aggregate)}]`,
      ),
    );
  }

  const excluded = [...byLabel.keys()].filter((label) => !aggregate.has(label));
  if (!sameMembers(excluded, EXPECTED_EXCLUDED)) {
    failures.push(
      registryFailure(
        `documented non-aggregate enablers must be exactly ${EXPECTED_EXCLUDED.length} members; expected [${describeMembers(EXPECTED_EXCLUDED)}], found [${describeMembers(excluded)}]`,
      ),
    );
  }

  const webHostPath = join(hostWebDir, 'webHost.ts');
  const webHostRelativePath = relative(root, webHostPath).split(sep).join('/');
  const webHostRaw = readFileSync(webHostPath, 'utf8');
  const webHostSource = transformSource?.({ path: webHostRelativePath, source: webHostRaw }) ?? webHostRaw;
  const explicitHost = new Set<string>();
  const mediaGroup = /\bmedia\s*:\s*\{([^{}]*)\}/s.exec(webHostSource)?.[1] ?? '';
  if (
    /\bsession\s*:\s*webMediaSessionBackend\b/.test(mediaGroup) &&
    /\bsessionAction\s*:\s*webMediaSessionActionBackend\b/.test(mediaGroup)
  ) {
    explicitHost.add('MediaSession');
  }
  if (/\bpower\s*:\s*webPowerCapabilities\b/.test(webHostSource)) explicitHost.add('Power');
  if (/\bscreen\s*:\s*webScreenCapabilities\b/.test(webHostSource)) explicitHost.add('Screen');
  const storageGroup = /\bstorage\s*:\s*\{([^{}]*)\}/s.exec(webHostSource)?.[1] ?? '';
  if (
    /\bchange\s*:\s*webStorageBackend\b/.test(storageGroup) &&
    /\blocal\s*:\s*webStorageBackend\b/.test(storageGroup)
  ) {
    explicitHost.add('Storage');
  }
  if (!sameMembers(explicitHost, EXPECTED_EXPLICIT_HOST)) {
    failures.push(
      registryFailure(
        `explicit Web Host capabilities must be exactly ${EXPECTED_EXPLICIT_HOST.length} members; expected [${describeMembers(EXPECTED_EXPLICIT_HOST)}], found [${describeMembers(explicitHost)}]`,
      ),
    );
  }

  const factories = readdirSync(hostWebDir)
    .filter((name) => /^web.*\.ts$/.test(name) && !name.includes('.test.'))
    .flatMap((file) => {
      const source = readSource(join(hostWebDir, file));
      return source.statements
        .filter(
          (statement): statement is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(statement) && statement.name?.text.startsWith('createWeb') === true,
        )
        .map((statement) => statement.name!.text.slice('createWeb'.length))
        .filter((name) => name.endsWith('Backend') && !byLabel.has(name.slice(0, -'Backend'.length)))
        .map((name) => name.slice(0, -'Backend'.length));
    });
  if (!sameMembers(factories, EXPECTED_FACTORIES)) {
    failures.push(
      registryFailure(
        `per-instance web provider factories must be exactly [${describeMembers(EXPECTED_FACTORIES)}], found [${describeMembers(factories)}]`,
      ),
    );
  }

  for (const capability of byLabel.values()) {
    const selectorFound = listTsFiles(capability.providerDirectory).some((path) =>
      new RegExp(`\\bfunction\\s+${capability.selector}\\b`).test(readFileSync(path, 'utf8')),
    );
    if (!selectorFound) {
      failures.push(
        registryFailure(`${capability.label} registrar ${capability.registrar} implies missing ${capability.selector}`),
      );
    }
  }

  const byCall = new Map<string, string>();
  for (const capability of byLabel.values()) {
    byCall.set(capability.enabler, capability.label);
    byCall.set(capability.registrar, capability.label);
    // Some applications intentionally inject a per-instance backend through the package's public
    // setter rather than using host-web's process-wide installer (glyph rasterization is the live case).
    for (const alternate of [`set${capability.label}Backend`, `set${capability.label}Provider`]) {
      if (
        listTsFiles(capability.providerDirectory).some((path) =>
          new RegExp(`\\b${alternate}\\b`).test(readFileSync(path, 'utf8')),
        )
      ) {
        byCall.set(alternate, capability.label);
      }
    }
  }
  byCall.set('createWebCursorBackend', 'Cursor');

  const closure = new Map<string, ReadonlySet<string>>();
  const expand = (enabler: string, visiting = new Set<string>()): ReadonlySet<string> => {
    const cached = closure.get(enabler);
    if (cached !== undefined) return cached;
    if (visiting.has(enabler)) return new Set();
    visiting.add(enabler);
    const result = new Set<string>();
    const own = byCall.get(enabler);
    if (own !== undefined) result.add(own);
    for (const call of enablerCalls.get(enabler) ?? []) {
      if (call.startsWith('enableHostWeb')) for (const item of expand(call, visiting)) result.add(item);
    }
    visiting.delete(enabler);
    closure.set(enabler, result);
    return result;
  };
  for (const capability of byLabel.values()) expand(capability.enabler);

  return { aggregate, byCall, byLabel, enablerClosure: closure, failures };
}

function listTsFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const result: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listTsFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.ts') && !/\.(?:test|spec)\.ts$/.test(entry.name))
      result.push(path);
  }
  return result;
}

function createProgram(root: string, transformSource?: CapabilityArrivalOptions['transformSource']): ts.Program {
  const configPath = join(root, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, { noEmit: true }, configPath);
  const roots = new Set(
    parsed.fileNames.filter((path) => !/\.(?:test|spec)\.ts$/.test(path)).map((path) => resolve(path)),
  );
  for (const directory of [join(root, 'functional/scenes'), join(root, 'tools/harness')]) {
    for (const path of listTsFiles(directory)) roots.add(resolve(path));
  }
  if (transformSource === undefined) return ts.createProgram({ options: parsed.options, rootNames: [...roots] });

  const host = ts.createCompilerHost(parsed.options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const sourceFile = getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    if (sourceFile === undefined || !isWithin(fileName, root)) return sourceFile;
    const path = relative(root, resolve(fileName)).split(sep).join('/');
    const source = transformSource({ path, source: sourceFile.text });
    if (source === sourceFile.text) return sourceFile;
    return ts.createSourceFile(fileName, source, languageVersion, true);
  };
  return ts.createProgram({ host, options: parsed.options, rootNames: [...roots] });
}

async function runnerPlugin(root: string, suite: ArrivalSuite): Promise<Record<string, unknown>> {
  const path =
    suite === 'examples'
      ? join(root, 'examples/runners/web/vite.config.ts')
      : join(root, 'tools/functional/vite.config.ts');
  // Vite normally supplies __dirname while loading a TypeScript config. The gate imports the config
  // directly so it can ask the real plugin for its virtual entry source, and supplies the same binding.
  const globals = globalThis as typeof globalThis & { __dirname?: string; __filename?: string };
  globals.__dirname = dirname(path);
  globals.__filename = path;
  const module = (await import(pathToFileURL(path).href)) as { default: unknown };
  const factory = module.default;
  const config =
    typeof factory === 'function'
      ? await (factory as (environment: Record<string, unknown>) => unknown)({ command: 'serve', mode: 'production' })
      : factory;
  const plugins = (config as { plugins?: unknown[] }).plugins?.flat(Infinity) ?? [];
  const name = suite === 'examples' ? 'examples:modules' : 'functional-tests:modules';
  const plugin = plugins.find((candidate) => (candidate as { name?: string }).name === name);
  if (plugin === undefined) throw new Error(`${path} did not produce the ${name} plugin`);
  return plugin as Record<string, unknown>;
}

async function generatedSource(
  plugin: Record<string, unknown>,
  suite: ArrivalSuite,
  name: string,
  renderer: string,
): Promise<string> {
  const id = suite === 'examples' ? `\0virtual:entry:${name}:${renderer}` : `\0virtual:ft-entry:${name}:${renderer}`;
  const load = plugin.load;
  if (typeof load !== 'function') throw new Error(`${suite} runner plugin has no load hook`);
  const loaded = await (load as (id: string) => unknown).call(plugin, id);
  const source = typeof loaded === 'string' ? loaded : (loaded as { code?: unknown } | null)?.code;
  if (typeof source !== 'string') throw new Error(`${suite} runner did not generate source for ${name}/${renderer}`);
  return source;
}

function populationFailures(suite: ArrivalSuite, pages: readonly { renderer: string }[]): CapabilityArrivalFailure[] {
  const failures: CapabilityArrivalFailure[] = [];
  const counts = new Map<string, number>();
  for (const page of pages) counts.set(page.renderer, (counts.get(page.renderer) ?? 0) + 1);
  const expected = EXPECTED_POPULATIONS[suite];
  for (const [renderer, count] of Object.entries(expected)) {
    if ((counts.get(renderer) ?? 0) !== count) {
      failures.push({
        kind: 'population',
        message: `${suite} ${renderer} population must be exactly ${count}; found ${counts.get(renderer) ?? 0}`,
      });
    }
  }
  if (pages.length !== EXPECTED_TOTALS[suite]) {
    failures.push({
      kind: 'population',
      message: `${suite} aggregate population must be exactly ${EXPECTED_TOTALS[suite]}; found ${pages.length}`,
    });
  }
  return failures;
}

async function discoverPages(root: string): Promise<{ failures: CapabilityArrivalFailure[]; pages: Page[] }> {
  const failures: CapabilityArrivalFailure[] = [];
  const pages: Page[] = [];
  for (const suite of ['examples', 'functional'] as const) {
    const plugin = await runnerPlugin(root, suite);
    const entries = discoverEntries(suite, root);
    const population: { renderer: string }[] = [];
    for (const entry of entries) {
      for (const renderer of entry.renderers) {
        population.push({ renderer });
        const consumer = `${suite}:${entry.name}/${renderer}`;
        const source = await generatedSource(plugin, suite, entry.name, renderer);
        if (suite === 'examples') {
          const exampleDir = join(root, 'examples/packages', entry.name, 'src');
          pages.push({
            consumer,
            generatedSource: source,
            renderer,
            rootFiles: [join(exampleDir, 'app.ts'), join(exampleDir, `render.${renderer}.ts`)],
            suite,
          });
        } else {
          const scene = functionalScene3DFile(join(root, 'functional/scenes'), entry.name, renderer);
          const sceneSource = readFileSync(scene, 'utf8');
          const usesHarness = /\bcreateFunctionalTarget\s*\(/.test(sceneSource);
          pages.push({
            consumer,
            generatedSource: source,
            renderer,
            rootFiles: [scene, ...(usesHarness ? [join(root, 'tools/harness', `${renderer}.ts`)] : [])],
            suite,
          });
        }
      }
    }
    failures.push(...populationFailures(suite, population));
  }
  return { failures, pages };
}

function sourceInstallations(
  sourceText: string,
  registry: Registry,
  countAggregate: boolean,
): { aggregate: boolean; values: Set<string> } {
  const source = ts.createSourceFile('generated-entry.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls = callsInside(source);
  const values = new Set<string>();
  const aggregate = calls.has('enableHostWeb');
  if (aggregate && countAggregate) for (const capability of registry.aggregate) values.add(capability);
  for (const call of calls) {
    const capability = registry.byCall.get(call);
    if (capability === undefined) continue;
    for (const installed of registry.enablerClosure.get(call) ?? [capability]) values.add(installed);
  }
  return { aggregate, values };
}

function excludedRendererFiles(root: string, page: Page): Set<string> {
  const excluded = new Set<string>();
  if (page.suite === 'examples') {
    const sourceDir = dirname(page.rootFiles[0]);
    for (const renderer of ['dom', 'canvas', 'webgl', 'webgpu']) {
      if (renderer !== page.renderer) excluded.add(resolve(sourceDir, `render.${renderer}.ts`));
    }
    // app.ts resolves this barrel to Canvas under the plain repo tsconfig; the Vite runner replaces it
    // with the selected renderer. Exclude the static barrel and seed the selected source explicitly.
    excluded.add(resolve(sourceDir, 'render.ts'));
  } else {
    for (const renderer of ['dom', 'canvas', 'webgl', 'webgpu']) {
      if (renderer !== page.renderer) excluded.add(resolve(root, 'tools/harness', `${renderer}.ts`));
    }
  }
  return excluded;
}

export async function capabilityArrivalFailures(
  options: CapabilityArrivalOptions = {},
): Promise<CapabilityArrivalFailure[]> {
  const root = resolve(options.root ?? join(import.meta.dirname, '..'));
  const context = await analysisContext(root);
  const { discovered } = context;
  const registry =
    options.transformSource === undefined ? context.registry : deriveRegistry(root, options.transformSource);
  const failures = [...registry.failures, ...discovered.failures];
  if (failures.some((failure) => failure.kind === 'registry' || failure.kind === 'population')) return failures;
  const graph =
    options.transformSource === undefined
      ? context.graph
      : new SemanticGraph(createProgram(root, options.transformSource), registry);

  const functionalWithoutAggregate: string[] = [];
  for (const page of discovered.pages) {
    const generatedSource =
      options.transformGeneratedEntry?.({
        consumer: page.consumer,
        renderer: page.renderer,
        source: page.generatedSource,
        suite: page.suite,
      }) ?? page.generatedSource;
    const roots = page.rootFiles
      .map((path) => graph.source(path))
      .filter((source): source is ts.SourceFile => source !== undefined);
    if (roots.length !== page.rootFiles.length) {
      failures.push({
        kind: 'population',
        consumer: page.consumer,
        message: `${page.consumer} has an unresolved source root`,
      });
      continue;
    }
    const reached = graph.reachable(roots, excludedRendererFiles(root, page));
    const generated = sourceInstallations(generatedSource, registry, page.suite === 'functional');
    const installed = new Set([...generated.values, ...reached.installations]);

    // The generated verifier's renderer discriminator is runtime data, so a path-insensitive call graph
    // would charge every page for every verification branch. Its source only reaches the host Bitmap
    // readback slot on the Canvas/WebGL legs; WebGPU maps its retained GPU buffer and DOM is supplied a
    // browser screenshot. Presence of the call is still derived from the emitted entry.
    if (
      /\bverifyCaptureTarget\s*\(/.test(generatedSource) &&
      (page.renderer === 'canvas' || page.renderer === 'webgl')
    ) {
      reached.capabilities.add('BitmapReadback');
    }

    if (page.suite === 'functional' && !generated.aggregate) {
      functionalWithoutAggregate.push(page.consumer);
    }
    if (page.suite === 'examples' && generated.aggregate) {
      failures.push({
        consumer: page.consumer,
        kind: 'policy',
        message: `${page.consumer} must install reached capabilities explicitly, not through enableHostWeb`,
      });
    }

    for (const capability of [...reached.capabilities].sort()) {
      if (installed.has(capability)) continue;
      failures.push({
        capability,
        consumer: page.consumer,
        kind: 'arrival',
        message: `${page.consumer} reaches ${capability} but its generated/app entry path does not install it`,
      });
    }
  }
  if (functionalWithoutAggregate.length > 0) {
    failures.push({
      capability: 'enableHostWeb aggregate',
      consumer: 'functional generated-entry template',
      kind: 'policy',
      message: `functional generated-entry template must install the ${EXPECTED_AGGREGATE.length}-member enableHostWeb aggregate; absent from ${functionalWithoutAggregate.length} cells (first: ${functionalWithoutAggregate[0]})`,
    });
  }
  return failures;
}

interface AnalysisContext {
  readonly discovered: Awaited<ReturnType<typeof discoverPages>>;
  readonly graph: SemanticGraph;
  readonly registry: Registry;
}

const analysisContexts = new Map<string, Promise<AnalysisContext>>();

function analysisContext(root: string): Promise<AnalysisContext> {
  let pending = analysisContexts.get(root);
  if (pending !== undefined) return pending;
  pending = (async () => {
    const registry = deriveRegistry(root);
    const discovered = await discoverPages(root);
    return { discovered, graph: new SemanticGraph(createProgram(root), registry), registry };
  })();
  analysisContexts.set(root, pending);
  return pending;
}

export function formatCapabilityArrivalFailures(failures: readonly CapabilityArrivalFailure[]): string {
  return failures.map((failure) => `- ${failure.message}`).join('\n');
}

async function main(): Promise<void> {
  const failures = await capabilityArrivalFailures();
  if (failures.length > 0) {
    console.error(
      `Capability-arrival coverage failed (${failures.length}):\n${formatCapabilityArrivalFailures(failures)}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `Capability-arrival coverage passed (${EXPECTED_TOTALS.examples} example cells, ${EXPECTED_TOTALS.functional} functional cells, ${EXPECTED_AGGREGATE.length} aggregate capabilities, ${EXPECTED_EXCLUDED.length} explicit enablers, ${EXPECTED_EXPLICIT_HOST.length} explicit Host capabilities).`,
  );
}

if (resolve(process.argv[1] ?? '') === resolve(import.meta.filename)) void main();
