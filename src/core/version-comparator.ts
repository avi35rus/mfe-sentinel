import semver from 'semver';
import type {
  ConflictSeverity,
  ValidationConflict,
  ValidationResult,
  SentinelManifest,
  SharedDependency,
} from '../types/index.js';

/**
 * Сравнивает semver-диапазон локальной зависимости с конкретной версией из remote.
 *
 * Возвращает уровень конфликта или null если совместимо.
 *
 * Алгоритм:
 *   1. semver.satisfies → null (полная совместимость)
 *   2. major отличается → 'major'  (CRITICAL, exit code 1)
 *   3. minor отличается → 'minor'  (WARNING)
 *   4. иначе           → 'patch'  (INFO)
 *
 * Использует semver.coerce() для нормализации произвольных диапазонов
 * ('>=18', '18.x', '^18.2.0') в конкретный SemVer-объект.
 */
export function compareVersions(
  localRange: string,
  remoteVersion: string,
): ConflictSeverity | null {
  const cleanRemote = semver.valid(semver.coerce(remoteVersion));
  if (cleanRemote === null) {
    // Если remote-версию нельзя распарсить — считаем major-конфликтом
    return 'major';
  }

  if (semver.satisfies(cleanRemote, localRange)) {
    return null;
  }

  const localBase = semver.coerce(localRange);
  if (localBase === null) {
    return 'major';
  }

  const remoteBase = semver.coerce(cleanRemote);
  if (remoteBase === null) {
    return 'major';
  }

  if (localBase.major !== remoteBase.major) {
    return 'major';
  }

  if (localBase.minor !== remoteBase.minor) {
    return 'minor';
  }

  return 'patch';
}

/**
 * Создаёт объект ValidationConflict с человекочитаемым сообщением.
 */
export function buildConflict(
  packageName: string,
  requiredVersion: string,
  providedVersion: string,
  severity: ConflictSeverity,
  singleton: boolean,
): ValidationConflict {
  const severityLabel: Record<ConflictSeverity, string> = {
    major: 'CRITICAL · Major Version Mismatch',
    minor: 'WARNING  · Minor Version Mismatch',
    patch: 'INFO     · Patch Version Mismatch',
  };

  const singletonNote = singleton ? ' [singleton — runtime conflict guaranteed]' : '';

  return {
    packageName,
    requiredVersion,
    providedVersion,
    severity,
    message:
      `[${severityLabel[severity]}] "${packageName}": ` +
      `local requires "${requiredVersion}", remote provides "${providedVersion}"` +
      singletonNote,
  };
}

/**
 * Сравнивает два манифеста и возвращает результат валидации.
 *
 * Логика согласно SENTINEL_SPEC.md (раздел "Алгоритм валидации контракта"):
 *
 *   - Сравниваются только shared-зависимости (секция 4 — Check Shared Deps).
 *   - Singleton-зависимости (singleton: true) проверяются строго:
 *     в рантайме будет использован только один экземпляр, поэтому
 *     версионный конфликт гарантированно сломает приложение.
 *   - Scoped-зависимости (singleton: false) пропускаются — каждый MFE
 *     может иметь свою копию без риска runtime-конфликта.
 *   - Major-конфликт → conflicts[] → passed = false (exit code 1 в CI)
 *   - Minor/Patch    → warnings[]  → passed = true  (только лог)
 *
 * @param local  — манифест нового билда (то, что пушим в CI)
 * @param remote — манифест production (то, что сейчас работает)
 */
export function compareManifests(
  local: SentinelManifest,
  remote: SentinelManifest,
): ValidationResult {
  const conflicts: ValidationConflict[] = [];
  const warnings: ValidationConflict[] = [];

  // Индекс remote-зависимостей для O(1)-поиска
  const remoteSharedMap = new Map<string, SharedDependency>(
    remote.shared.map((dep) => [dep.name, dep]),
  );

  for (const localDep of local.shared) {
    const remoteDep = remoteSharedMap.get(localDep.name);

    // Зависимость есть только в локальном манифесте — новая, конфликтов нет
    if (remoteDep === undefined) continue;

    // Scoped-зависимости (singleton: false) не конфликтуют в рантайме
    if (!localDep.singleton && !remoteDep.singleton) continue;

    const severity = compareVersions(localDep.version, remoteDep.version);

    // Версии совместимы
    if (severity === null) continue;

    const conflict = buildConflict(
      localDep.name,
      localDep.version,
      remoteDep.version,
      severity,
      localDep.singleton,
    );

    if (severity === 'major') {
      conflicts.push(conflict);
    } else {
      warnings.push(conflict);
    }
  }

  return {
    passed: conflicts.length === 0,
    conflicts,
    warnings,
  };
}
