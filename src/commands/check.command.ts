import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Command } from 'commander';
import pc from 'picocolors';
import type { SentinelManifest, ValidationConflict, ValidationResult } from '../types/index.js';
import { compareManifests } from '../core/version-comparator.js';

// ─── Manifest loader ──────────────────────────────────────────────────────────

async function loadManifest(filePath: string, label: string): Promise<SentinelManifest> {
  const absolutePath = resolve(filePath);
  let raw: string;
  try {
    raw = await readFile(absolutePath, 'utf-8');
  } catch {
    throw new Error(`Failed to read ${label} manifest: ${absolutePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${label} manifest: ${absolutePath}`);
  }

  if (
    typeof parsed !== 'object' || parsed === null ||
    !('name' in parsed) || !('version' in parsed) ||
    !('shared' in parsed) || !Array.isArray((parsed as Record<string, unknown>)['shared'])
  ) {
    throw new Error(`File "${absolutePath}" is not a valid SentinelManifest`);
  }

  return parsed as SentinelManifest;
}

// ─── Output formatters ────────────────────────────────────────────────────────

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

// ─── Command registration ─────────────────────────────────────────────────────

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Compare local manifest against the production dependency graph')
    .option(
      '-m, --manifest <path>',
      'Path to local manifest',
      './manifest.sentinel.json',
    )
    .option(
      '-r, --remote <path>',
      'Path to remote/production manifest',
      './remote-manifest.json',
    )
    .option(
      '--fail-on-warning',
      'Exit with code 1 on warnings (not only major conflicts)',
      false,
    )
    .action(async (options: { manifest: string; remote: string; failOnWarning: boolean }) => {
      try {
        console.log(pc.bold('\n  sentinel check') + pc.gray(' — validating compatibility...\n'));

        process.stdout.write(pc.gray('  [1/3] Loading local manifest...         '));
        const localManifest = await loadManifest(options.manifest, 'local');
        console.log(pc.green('✔') + pc.gray(` ${localManifest.name}@${localManifest.version}`));

        process.stdout.write(pc.gray('  [2/3] Loading remote manifest...        '));
        const remoteManifest = await loadManifest(options.remote, 'remote');
        console.log(pc.green('✔') + pc.gray(` ${remoteManifest.name}@${remoteManifest.version}`));

        process.stdout.write(pc.gray('  [3/3] Comparing dependencies...         '));
        const result = compareManifests(localManifest, remoteManifest);
        console.log(pc.green('✔'));

        printSummary(result, localManifest.name, remoteManifest.name);

        const shouldFail = !result.passed || (options.failOnWarning && result.warnings.length > 0);

        if (shouldFail) {
          process.exit(1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('\n' + pc.red('✖ Validation error: ') + message);
        process.exit(1);
      }
    });
}
