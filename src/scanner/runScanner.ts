import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { loadScannerConfig } from './config.js';
import { startScanner } from './service.js';

const envConfig = loadConfig();
const scannerConfig = loadScannerConfig();
const logger = createLogger(envConfig);
const scanner = startScanner(envConfig, scannerConfig, logger);

const shutdown = (signal: string) => {
  logger.info('Shutdown requested', { signal });
  scanner.stop();
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

scanner.finished.catch((error) => {
  logger.error('Scanner crashed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
