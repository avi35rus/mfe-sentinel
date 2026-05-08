import { readFile } from 'fs/promises';
import { resolve, dirname, join } from 'path';
import { createRequire } from 'module';
import type { SentinelManifest, ExposedModule, RemoteApp, SharedDependency } from '../types/index.js';

// ─── Типы для MF-конфига ──────────────────────────────────────────────────────

/**
 * Настройки одной shared-зависимости внутри module-federation.config.js.
 * Все поля опциональны — разработчик может указать только `{ singleton: true }`.
 */
interface MFSharedEntryConfig {
  singleton?: boolean;
  strictVersion?: boolean;
  requiredVersion?: string;
  eager?: boolean;
}

/**
 * Значение поля `shared` в конфиге MF:
 *   "react"                           → строка (имя = версия из pkg)
 *   { singleton: true }               → объект без явной версии
 *   { singleton: true, requiredVersion: '^18' } → объект с версией
 */
type MFSharedEntry = string | MFSharedEntryConfig;

/**
 * Нормализованный объект MF-конфига после загрузки из .js-файла.
 */
export interface MFConfigRaw {
  name: string;
  exposes: Record<string, string>;
  remotes: Record<string, string>;
  /** shared может быть объектом {pkgName: config} или массивом ['react', 'lodash'] */
  shared: Record<string, MFSharedEntry> | string[];
}

// ─── Вспомогательные типы ─────────────────────────────────────────────────────

/**
 * Структура, извлечённая из package.json.
 */
export interface PackageJsonMeta {
  name: string;
  version: string;
  /** Все зависимости (dependencies + devDependencies) для поиска версий */
  allDependencies: Record<string, string>;
}

// ─── parsePackageJson ─────────────────────────────────────────────────────────

/**
 * Читает package.json и извлекает name, version и все зависимости.
 */
export async function parsePackageJson(filePath: string): Promise<PackageJsonMeta> {
  const absolutePath = resolve(filePath);

  let raw: string;
  try {
    raw = await readFile(absolutePath, 'utf-8');
  } catch {
    throw new Error(`Не удалось прочитать package.json: ${absolutePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Некорректный JSON в файле: ${absolutePath}`);
  }

  if (
    typeof parsed !== 'object' || parsed === null ||
    !('name' in parsed) || !('version' in parsed) ||
    typeof (parsed as Record<string, unknown>)['name'] !== 'string' ||
    typeof (parsed as Record<string, unknown>)['version'] !== 'string'
  ) {
    throw new Error(`Поля "name" и "version" обязательны в ${absolutePath}`);
  }

  const pkg = parsed as {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  return {
    name: pkg.name,
    version: pkg.version,
    allDependencies: {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    },
  };
}

// ─── parseMFConfig ────────────────────────────────────────────────────────────

/**
 * Загружает module-federation.config.js (CommonJS) через createRequire
 * и возвращает нормализованный MFConfigRaw.
 *
 * Поддерживаемый формат файла: `module.exports = { name, exposes, remotes, shared }`
 */
export function parseMFConfig(filePath: string): MFConfigRaw {
  const absolutePath = resolve(filePath);

  // createRequire позволяет загружать CJS-модули из ESM-окружения
  const requireCJS = createRequire(import.meta.url);

  let raw: unknown;
  try {
    raw = requireCJS(absolutePath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Не удалось загрузить MF-конфиг "${absolutePath}": ${msg}`);
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`MF-конфиг должен экспортировать объект: ${absolutePath}`);
  }

  const cfg = raw as Record<string, unknown>;

  if (typeof cfg['name'] !== 'string' || cfg['name'].trim() === '') {
    throw new Error(`Поле "name" обязательно в MF-конфиге: ${absolutePath}`);
  }

  return {
    name: cfg['name'],
    exposes:  isStringRecord(cfg['exposes'])  ? cfg['exposes']  : {},
    remotes:  isStringRecord(cfg['remotes'])  ? cfg['remotes']  : {},
    shared:   normalizeMFShared(cfg['shared']),
  };
}

/** Проверяет, что значение — объект со строковыми значениями */
function isStringRecord(val: unknown): val is Record<string, string> {
  return typeof val === 'object' && val !== null && !Array.isArray(val) &&
    Object.values(val as Record<string, unknown>).every((v) => typeof v === 'string');
}

/**
 * Нормализует поле `shared` из разных форматов в единый Record<string, MFSharedEntry>.
 * Поддерживает: массив строк и объект с конфигом.
 */
function normalizeMFShared(
  shared: unknown,
): Record<string, MFSharedEntry> {
  if (Array.isArray(shared)) {
    // ['react', 'lodash'] → { react: {}, lodash: {} }
    const result: Record<string, MFSharedEntry> = {};
    for (const item of shared) {
      if (typeof item === 'string') result[item] = {};
    }
    return result;
  }

  if (typeof shared === 'object' && shared !== null) {
    return shared as Record<string, MFSharedEntry>;
  }

  return {};
}

// ─── buildSharedDeps ──────────────────────────────────────────────────────────

/**
 * Сопоставляет список shared из MF-конфига с реальными версиями из package.json.
 *
 * Алгоритм для каждой зависимости:
 *   1. Ищем версию в allDependencies (package.json) → используем её (source of truth)
 *   2. Нет в package.json, но есть requiredVersion в конфиге → используем её
 *   3. Нигде нет → версия '*' (предупреждение будет в логах команды)
 */
export function buildSharedDeps(
  mfShared: Record<string, MFSharedEntry>,
  allDependencies: Record<string, string>,
): SharedDependency[] {
  const deps: SharedDependency[] = [];

  for (const [pkgName, entryRaw] of Object.entries(mfShared)) {
    const entry: MFSharedEntryConfig =
      typeof entryRaw === 'string'
        ? { requiredVersion: entryRaw }
        : (entryRaw as MFSharedEntryConfig);

    // Приоритет версии: package.json > requiredVersion в конфиге > '*'
    const version =
      allDependencies[pkgName] ??
      entry.requiredVersion ??
      '*';

    deps.push({
      name: pkgName,
      version,
      singleton: entry.singleton ?? false,
      strictVersion: entry.strictVersion ?? false,
      ...(entry.requiredVersion !== undefined
        ? { requiredVersion: entry.requiredVersion }
        : {}),
    });
  }

  return deps;
}

// ─── buildManifestFromMFConfig ────────────────────────────────────────────────

/**
 * Главный оркестратор реального парсинга:
 *   1. parsePackageJson  → имя, версия, все зависимости
 *   2. parseMFConfig     → exposes, remotes, shared (ключи)
 *   3. buildSharedDeps   → только те shared, что объявлены в MF-конфиге,
 *                          с версиями из package.json
 *
 * @param mfConfigPath   путь до module-federation.config.js
 * @param packagePath    путь до package.json того же проекта
 */
export async function buildManifestFromMFConfig(
  mfConfigPath: string,
  packagePath: string,
): Promise<SentinelManifest> {
  const pkg = await parsePackageJson(packagePath);
  const mf  = parseMFConfig(mfConfigPath);

  const exposes: ExposedModule[] = Object.entries(mf.exposes).map(
    ([name, path]) => ({ name, path }),
  );

  // remote-строки бывают вида "alias@url" или просто "url"
  const remotes: RemoteApp[] = Object.entries(mf.remotes).map(([alias, value]) => {
    const atIdx = value.indexOf('@');
    const url   = atIdx !== -1 ? value.slice(atIdx + 1) : value;
    return { alias, url, modules: [] };
  });

  const normalizedShared = normalizeMFShared(mf.shared);
  const shared = buildSharedDeps(normalizedShared, pkg.allDependencies);

  return {
    name:        mf.name,
    version:     pkg.version,
    generatedAt: new Date().toISOString(),
    exposes,
    remotes,
    shared,
  };
}

// ─── generateMockManifest (fallback) ─────────────────────────────────────────

/**
 * Fallback: генерирует тестовый манифест без реального конфига.
 * Используется командой scan когда --mf-config не указан.
 */
export function generateMockManifest(name: string, version: string): SentinelManifest {
  return {
    name,
    version,
    generatedAt: new Date().toISOString(),
    exposes: [
      { name: './Button', path: './src/components/Button' },
      { name: './Header', path: './src/components/Header' },
    ],
    remotes: [
      {
        alias: 'shell',
        url: 'https://cdn.example.com/shell/remoteEntry.js',
        modules: ['./Layout'],
      },
    ],
    shared: [
      { name: 'react',     version: '^18.2.0', singleton: true,  strictVersion: false },
      { name: 'react-dom', version: '^18.2.0', singleton: true,  strictVersion: false },
      { name: 'lodash',    version: '^4.17.21', singleton: false, strictVersion: false },
    ],
  };
}

// ─── parseWebpackConfig (скелет для будущего AST-парсера) ─────────────────────

export interface WebpackParserOptions {
  configPath: string;
  appName?: string;
}

/**
 * TODO (Фаза 2): Реализовать AST-парсинг remoteEntry.js и webpack.config.js.
 * Сейчас используй buildManifestFromMFConfig для отдельного MF-конфига.
 */
export async function parseWebpackConfig(
  options: WebpackParserOptions,
): Promise<SentinelManifest> {
  // Автоматически ищем module-federation.config.js рядом с webpack.config.js
  const dir = dirname(resolve(options.configPath));
  const mfConfigPath = join(dir, 'module-federation.config.js');
  const packagePath  = join(dir, 'package.json');

  return buildManifestFromMFConfig(mfConfigPath, packagePath);
}
