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
    ' — CLI-инструмент аудита контрактов Micro Frontend',
  )
  .version('0.1.0', '-v, --version', 'Показать текущую версию');

registerInitCommand(program);
registerScanCommand(program);
registerCheckCommand(program);

program.addHelpText(
  'after',
  `
${pc.gray('Примеры:')}
  ${pc.cyan('sentinel init')}                        Инициализировать конфиг в проекте
  ${pc.cyan('sentinel scan --config webpack.config.js')}  Сгенерировать манифест
  ${pc.cyan('sentinel check --manifest manifest.sentinel.json --remote remote-manifest.json')}  Проверить совместимость
`,
);

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(pc.red(`✖ Неожиданная ошибка: ${message}`));
  process.exit(1);
});
