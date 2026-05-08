#!/usr/bin/env node
import { Command } from 'commander';
import pc from 'picocolors';
import { registerInitCommand } from './commands/init.command.js';
import { registerScanCommand } from './commands/scan.command.js';
import { registerCheckCommand } from './commands/check.command.js';

const program = new Command();

program
  .name('sentinel')
  .description(
    pc.bold('MFE Sentinel') +
    ' — CLI tool for Micro-Frontend contract auditing',
  )
  .version('0.1.0', '-v, --version', 'Show current version');

registerInitCommand(program);
registerScanCommand(program);
registerCheckCommand(program);

program.addHelpText(
  'after',
  `
${pc.gray('Examples:')}
  ${pc.cyan('sentinel init')}                                                    Initialize config in project
  ${pc.cyan('sentinel scan --mf-config module-federation.config.js')}            Generate manifest
  ${pc.cyan('sentinel check --manifest manifest.sentinel.json --remote remote-manifest.json')}  Validate compatibility
`,
);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red(`✖ Unexpected error: ${message}`));
  process.exit(1);
});
