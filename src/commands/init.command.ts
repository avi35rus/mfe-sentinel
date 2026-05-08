import { writeFile, access } from 'fs/promises';
import { resolve } from 'path';
import type { Command } from 'commander';
import pc from 'picocolors';

const CONFIG_FILENAME = 'sentinel.config.json';

interface SentinelConfig {
  version: string;
  manifestOutput: string;
  mfConfigPath: string;
  packageJsonPath: string;
  failOnWarning: boolean;
  remote: {
    url: string | null;
    manifestPath: string;
  };
}

const DEFAULT_CONFIG: SentinelConfig = {
  version: '1',
  manifestOutput: './manifest.sentinel.json',
  mfConfigPath: './module-federation.config.js',
  packageJsonPath: './package.json',
  failOnWarning: false,
  remote: {
    url: null,
    manifestPath: './remote-manifest.json',
  },
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize Sentinel in the current project')
    .option('--force', 'Overwrite existing config', false)
    .action(async (options: { force: boolean }) => {
      try {
        const outputPath = resolve(CONFIG_FILENAME);
        const exists = await fileExists(outputPath);

        if (exists && !options.force) {
          console.log(
            pc.yellow('\n  ⚠ ') +
            pc.bold(`${CONFIG_FILENAME} already exists.`) +
            pc.gray(' Use --force to overwrite.\n'),
          );
          process.exit(0);
        }

        const content = JSON.stringify(DEFAULT_CONFIG, null, 2);
        await writeFile(outputPath, content, 'utf-8');

        console.log();
        console.log(pc.bold(pc.cyan('┌─ sentinel init ──────────────────────────────────')));
        console.log(pc.bold(pc.cyan('│')));
        console.log(
          pc.bold(pc.cyan('│')) + '  ' +
          pc.green('✔') + '  ' + pc.bold(`${CONFIG_FILENAME}`) + pc.gray(' created'),
        );
        console.log(pc.bold(pc.cyan('│')));
        console.log(pc.bold(pc.cyan('│')) + '  ' + pc.gray('Next steps:'));
        console.log(
          pc.bold(pc.cyan('│')) + '    ' +
          pc.cyan('1.') + '  Set the MF config path in ' + pc.bold('mfConfigPath'),
        );
        console.log(
          pc.bold(pc.cyan('│')) + '    ' +
          pc.cyan('2.') + '  Run ' + pc.bold('sentinel scan') + ' to generate the manifest',
        );
        console.log(
          pc.bold(pc.cyan('│')) + '    ' +
          pc.cyan('3.') + '  Add ' + pc.bold('sentinel check') + ' to your CI/CD pipeline',
        );
        console.log(pc.bold(pc.cyan('│')));
        console.log(pc.bold(pc.cyan('└──────────────────────────────────────────────────')));
        console.log();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(pc.red(`\n✖ Initialization error: ${message}\n`));
        process.exit(1);
      }
    });
}
