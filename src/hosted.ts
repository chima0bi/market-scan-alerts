import { loadConfig } from './config.js';
import { startHttpServer } from './http.js';
import { createLogger } from './logger.js';
import { loadScannerConfig } from './scanner/config.js';
import { startScanner } from './scanner/service.js';

const config = loadConfig();
const scannerConfig = loadScannerConfig();
const logger = createLogger(config);
const http = startHttpServer(config, logger);
const scanner = startScanner(config, scannerConfig, logger);

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Hosted service shutting down', { signal });
  scanner.stop();
  http.server.close();
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

scanner.finished.catch((error) => {
  logger.error('Hosted scanner crashed', { error: error instanceof Error ? error.message : String(error) });
  shutdown('scanner-error');
  process.exitCode = 1;
});