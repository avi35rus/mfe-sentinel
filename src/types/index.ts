/**
 * Модуль, который MFE экспортирует наружу (секция `exposes` в MF-конфиге).
 */
export interface ExposedModule {
  /** Публичный алиас, напр. "./Button" */
  name: string;
  /** Относительный путь к файлу, напр. "./src/components/Button" */
  path: string;
}

/**
 * Удалённое приложение, которое MFE потребляет (секция `remotes`).
 */
export interface RemoteApp {
  /** Локальный алиас в хост-приложении, напр. "header" */
  alias: string;
  /** URL до remoteEntry.js, напр. "https://cdn.example.com/header/remoteEntry.js" */
  url: string;
  /** Список потребляемых модулей из этого remote, напр. ["./Nav", "./Logo"] */
  modules: string[];
}

/**
 * Shared-зависимость (singleton-библиотека) из секции `shared`.
 */
export interface SharedDependency {
  /** Имя пакета, напр. "react" */
  name: string;
  /** Semver-диапазон, напр. "^18.0.0" */
  version: string;
  /** Должна ли библиотека быть единственным экземпляром в рантайме */
  singleton: boolean;
  /** Требовать точного совпадения версии */
  strictVersion: boolean;
  /** Минимально требуемая версия (опционально) */
  requiredVersion?: string;
}

/**
 * Главный JSON-слепок (Manifest) одного MFE-билда.
 * Описывает контракт: что отдаёт, что потребляет, какие singleton-зависимости ожидает.
 */
export interface SentinelManifest {
  /** Имя приложения, напр. "checkout" */
  name: string;
  /** Хэш билда или semver-версия, напр. "1.2.3" или "abc123f" */
  version: string;
  /** ISO 8601 timestamp генерации манифеста */
  generatedAt: string;
  /** Модули, которые этот MFE предоставляет другим */
  exposes: ExposedModule[];
  /** Удалённые приложения, которые этот MFE потребляет */
  remotes: RemoteApp[];
  /** Shared-зависимости, которые этот MFE ожидает в рантайме */
  shared: SharedDependency[];
}

/**
 * Степень серьёзности конфликта версий согласно semver.
 * - major: критический, прерывает пайплайн (exit code 1)
 * - minor: предупреждение, логируется в stdout
 * - patch: информационное предупреждение
 */
export type ConflictSeverity = 'major' | 'minor' | 'patch';

/**
 * Один конфликт, обнаруженный при валидации контракта.
 */
export interface ValidationConflict {
  /** Имя пакета, по которому возник конфликт */
  packageName: string;
  /** Версия, которую требует проверяемый MFE */
  requiredVersion: string;
  /** Версия, которую предоставляет хост/другой MFE */
  providedVersion: string;
  severity: ConflictSeverity;
  /** Человекочитаемое описание конфликта */
  message: string;
}

/**
 * Итоговый результат команды `sentinel check`.
 */
export interface ValidationResult {
  /** Прошла ли валидация без критических конфликтов */
  passed: boolean;
  conflicts: ValidationConflict[];
  warnings: ValidationConflict[];
}
