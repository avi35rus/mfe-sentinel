#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import pc from 'picocolors';
import { registerInitCommand } from './commands/init.command.js';
import { registerScanCommand } from './commands/scan.command.js';
import { registerCheckCommand } from './commands/check.command.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('mfe-sentinel')
  .description(
    pc.bold('MFE Sentinel') +
    ' — CLI tool for Micro-Frontend contract auditing',
  )
  .version(version, '-v, --version', 'Show current version');

registerInitCommand(program);
registerScanCommand(program);
registerCheckCommand(program);

program.addHelpText(
  'after',
  `
${pc.gray('Examples:')}
  ${pc.cyan('mfe-sentinel init')}                                                    Initialize config in project
  ${pc.cyan('mfe-sentinel scan --mf-config module-federation.config.js')}            Generate manifest
  ${pc.cyan('mfe-sentinel check --manifest manifest.sentinel.json --remote remote-manifest.json')}  Validate compatibility
`,
);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red(`✖ Unexpected error: ${message}`));
  process.exit(1);
});
