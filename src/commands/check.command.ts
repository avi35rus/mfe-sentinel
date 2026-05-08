import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Command } from 'commander';
import pc from 'picocolors';
import type { SentinelManifest, ValidationConflict, ValidationResult } from '../types/index.js';
import { compareManifests } from '../core/version-comparator.js';

// ─── Загрузка манифеста ───────────────────────────────────────────────────────

async function loadManifest(filePath: string, label: string): Promise<SentinelManifest> {
  const absolutePath = resolve(filePath);
  let raw: string;
  try {
    raw = await readFile(absolutePath, 'utf-8');
  } catch {
    throw new Error(`Не удалось прочитать ${label} манифест: ${absolutePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Некорректный JSON в ${label} манифесте: ${absolutePath}`);
  }

  if (
    typeof parsed !== 'object' || parsed === null ||
    !('name' in parsed) || !('version' in parsed) ||
    !('shared' in parsed) || !Array.isArray((parsed as Record<string, unknown>)['shared'])
  ) {
    throw new Error(`Файл "${absolutePath}" не является валидным SentinelManifest`);
  }

  return parsed as SentinelManifest;
}

// ─── Вывод результатов ────────────────────────────────────────────────────────

function printConflicts(conflicts: ValidationConflict[]): void {
  for (const c of conflicts) {
    console.log(
      pc.red('  ✖ ') +
      pc.bold(pc.red(c.packageName)) +
      pc.gray('  requires ') + pc.white(c.requiredVersion) +
      pc.gray('  ·  provided ') + pc.red(c.providedVersion),
    );
    console.log(pc.gray('    ' + c.message));
  }
}

function printWarnings(warnings: ValidationConflict[]): void {
  for (const w of warnings) {
    console.log(
      pc.yellow('  ⚠ ') +
      pc.bold(pc.yellow(w.packageName)) +
      pc.gray('  requires ') + pc.white(w.requiredVersion) +
      pc.gray('  ·  provided ') + pc.yellow(w.providedVersion),
    );
    console.log(pc.gray('    ' + w.message));
  }
}

function printSummary(result: ValidationResult, localName: string, remoteName: string): void {
  console.log();
  console.log(
    pc.bold(pc.cyan('┌─ sentinel check ─────────────────────────────────')),
  );
  console.log(
    pc.bold(pc.cyan('│')) + '  ' +
    pc.gray('local  → ') + pc.white(localName) + '   ' +
    pc.gray('remote → ') + pc.white(remoteName),
  );
  console.log(pc.bold(pc.cyan('│')));

  if (result.conflicts.length > 0) {
    console.log(
      pc.bold(pc.cyan('│')) + '  ' +
      pc.bold(pc.red(`✖ CRITICAL  (${result.conflicts.length})`)),
    );
    printConflicts(result.conflicts);
  }

  if (result.warnings.length > 0) {
    if (result.conflicts.length > 0) console.log(pc.bold(pc.cyan('│')));
    console.log(
      pc.bold(pc.cyan('│')) + '  ' +
      pc.bold(pc.yellow(`⚠ WARNINGS  (${result.warnings.length})`)),
    );
    printWarnings(result.warnings);
  }

  if (result.conflicts.length === 0 && result.warnings.length === 0) {
    console.log(
      pc.bold(pc.cyan('│')) + '  ' +
      pc.bold(pc.green('✔ All shared dependencies are compatible')),
    );
  }

  console.log(pc.bold(pc.cyan('│')));

  const status = result.passed
    ? pc.bold(pc.green('✔ PASSED'))
    : pc.bold(pc.red('✖ FAILED'));
  const hint = result.passed
    ? pc.gray('(deploy can proceed)')
    : pc.gray('(pipeline blocked — fix Major conflicts before deploying)');

  console.log(pc.bold(pc.cyan('│')) + '  ' + status + '  ' + hint);
  console.log(pc.bold(pc.cyan('└──────────────────────────────────────────────────')));
  console.log();
}

// ─── Регистрация команды ──────────────────────────────────────────────────────

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Проверить совместимость манифеста с production-графом')
    .option(
      '-m, --manifest <path>',
      'Путь до локального манифеста',
      './manifest.sentinel.json',
    )
    .option(
      '-r, --remote <path>',
      'Путь до remote/production манифеста',
      './remote-manifest.json',
    )
    .option(
      '--fail-on-warning',
      'Завершать с exit code 1 при Warning (не только Major)',
      false,
    )
    .action(async (options: { manifest: string; remote: string; failOnWarning: boolean }) => {
      try {
        console.log(pc.bold('\n  sentinel check') + pc.gray(' — валидация совместимости...\n'));

        process.stdout.write(pc.gray('  [1/3] Загрузка локального манифеста... '));
        const localManifest = await loadManifest(options.manifest, 'локальный');
        console.log(pc.green('✔') + pc.gray(` ${localManifest.name}@${localManifest.version}`));

        process.stdout.write(pc.gray('  [2/3] Загрузка remote манифеста...    '));
        const remoteManifest = await loadManifest(options.remote, 'remote');
        console.log(pc.green('✔') + pc.gray(` ${remoteManifest.name}@${remoteManifest.version}`));

        process.stdout.write(pc.gray('  [3/3] Сравнение зависимостей...       '));
        const result = compareManifests(localManifest, remoteManifest);
        console.log(pc.green('✔'));

        printSummary(result, localManifest.name, remoteManifest.name);

        const shouldFail = !result.passed || (options.failOnWarning && result.warnings.length > 0);

        if (shouldFail) {
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('\n' + pc.red('✖ Ошибка валидации: ') + message);
        process.exit(1);
      }
    });
}
