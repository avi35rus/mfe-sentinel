import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { Command } from 'commander';
import pc from 'picocolors';
import type { SentinelManifest } from '../types/index.js';
import {
  parsePackageJson,
  generateMockManifest,
  buildManifestFromMFConfig,
} from '../parsers/webpack.parser.js';

/**
 * Prints a SentinelManifest to the terminal with color formatting.
 */
function printManifest(manifest: SentinelManifest): void {
  console.log();
  console.log(pc.bold(pc.cyan('┌─ MFE Sentinel Manifest ─────────────────────────')));
  console.log(pc.bold(pc.cyan('│')));
  console.log(pc.bold(pc.cyan('│')) + '  ' + pc.bold('App:     ') + pc.white(manifest.name));
  console.log(pc.bold(pc.cyan('│')) + '  ' + pc.bold('Version: ') + pc.white(manifest.version));
  console.log(pc.bold(pc.cyan('│')) + '  ' + pc.bold('Generated: ') + pc.gray(manifest.generatedAt));

  // Exposes
  console.log(pc.bold(pc.cyan('│')));
  console.log(pc.bold(pc.cyan('│')) + '  ' + pc.bold(pc.green('▸ Exposes')) + pc.gray(` (${manifest.exposes.length})`));
  for (const mod of manifest.exposes) {
    console.log(
      pc.bold(pc.cyan('│')) + '    ' +
      pc.green(mod.name.padEnd(20)) +
      pc.gray('→ ') +
      pc.gray(mod.path),
    );
  }

  // Remotes
  console.log(pc.bold(pc.cyan('│')));
  console.log(pc.bold(pc.cyan('│')) + '  ' + pc.bold(pc.blue('▸ Remotes')) + pc.gray(` (${manifest.remotes.length})`));
  for (const remote of manifest.remotes) {
    console.log(
      pc.bold(pc.cyan('│')) + '    ' +
      pc.blue(remote.alias.padEnd(20)) +
      pc.gray(remote.url),
    );
    for (const mod of remote.modules) {
      console.log(pc.bold(pc.cyan('│')) + '      ' + pc.gray('↳ ') + pc.white(mod));
    }
  }

  // Shared
  console.log(pc.bold(pc.cyan('│')));
  console.log(pc.bold(pc.cyan('│')) + '  ' + pc.bold(pc.yellow('▸ Shared')) + pc.gray(` (${manifest.shared.length})`));
  for (const dep of manifest.shared) {
    const singletonBadge = dep.singleton
      ? pc.bold(pc.yellow(' [singleton]'))
      : pc.gray(' [scoped]');
    console.log(
      pc.bold(pc.cyan('│')) + '    ' +
      pc.yellow(dep.name.padEnd(20)) +
      pc.white(dep.version) +
      singletonBadge,
    );
  }

  console.log(pc.bold(pc.cyan('│')));
  console.log(pc.bold(pc.cyan('└──────────────────────────────────────────────────')));
  console.log();
}

/**
 * Saves the manifest to a JSON file and prints the output path.
 */
async function saveManifest(manifest: SentinelManifest, outputPath: string): Promise<void> {
  const absolutePath = resolve(outputPath);
  await writeFile(absolutePath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(pc.green('✔') + ' Manifest saved: ' + pc.bold(absolutePath));
}

/**
 * Registers the `sentinel scan` command.
 */
export function registerScanCommand(program: Command): void {
  program
    .command('scan')
    .description('Scan MFE config and generate a manifest')
    .option('-p, --package <path>',   'Path to package.json',                        './package.json')
    .option('-m, --mf-config <path>', 'Path to module-federation.config.js (real parse)')
    .option('-o, --output <path>',    'Output path for the manifest',                 './manifest.sentinel.json')
    .option('--no-save',              'Print manifest to stdout only, do not write file')
    .action(async (options: {
      package: string;
      mfConfig?: string;
      output: string;
      save: boolean;
    }) => {
      try {
        console.log(pc.bold('\n  sentinel scan') + pc.gray(' — scanning project...\n'));

        let manifest: SentinelManifest;

        if (options.mfConfig !== undefined) {
          // ── Real parse via MF config ──────────────────────────────────────
          process.stdout.write(pc.gray('  [1/3] Reading package.json...           '));
          const pkg = await parsePackageJson(options.package);
          console.log(pc.green('✔') + pc.gray(` ${pkg.name}@${pkg.version}`));

          process.stdout.write(pc.gray('  [2/3] Parsing module-federation.config... '));
          console.log(pc.green('✔') + pc.gray(` ${options.mfConfig}`));

          process.stdout.write(pc.gray('  [3/3] Building manifest...               '));
          manifest = await buildManifestFromMFConfig(options.mfConfig, options.package);
          console.log(pc.green('✔') + pc.bold(pc.green(' [real]')));

          // Warn about dependencies missing from package.json
          const missing = manifest.shared.filter((d) => d.version === '*');
          if (missing.length > 0) {
            console.log(
              pc.yellow('\n  ⚠ Versions not found in package.json (using "*"):'),
            );
            for (const d of missing) {
              console.log(pc.yellow(`    · ${d.name}`));
            }
          }
        } else {
          // ── Mock mode (fallback) ──────────────────────────────────────────
          process.stdout.write(pc.gray('  [1/2] Reading package.json... '));
          const pkg = await parsePackageJson(options.package);
          console.log(pc.green('✔') + pc.gray(` ${pkg.name}@${pkg.version}`));

          process.stdout.write(pc.gray('  [2/2] Generating manifest...  '));
          manifest = generateMockManifest(pkg.name, pkg.version);
          console.log(pc.green('✔') + pc.yellow(' [mock]') +
            pc.gray(' — use --mf-config for real parsing'));
        }

        // Print manifest
        printManifest(manifest);

        // Save to file
        if (options.save) {
          await saveManifest(manifest, options.output);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('\n' + pc.red('✖ Scan error: ') + message);
        process.exit(1);
      }
    });
}
