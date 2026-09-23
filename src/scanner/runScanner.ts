import { BybitMarketClient } from '../bybit/rest.js';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { loadScannerConfig } from './config.js';
import { StateStore } from './state.js';
import { runCycle } from './orchestrator.js';

const envConfig = loadConfig();
const scannerConfig = loadScannerConfig();
const logger = createLogger(envConfig);
const client = new BybitMarketClient(envConfig.BYBIT_BASE_URL, envConfig.STALE_DATA_THRESHOLD_MS, logger);
const state = new StateStore();

let shuttingDown = false;
const shutdown = (signal: string) => {
  logger.info('Shutdown requested', { signal });
  shuttingDown = true;
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

async function main(): Promise<void> {
  logger.info('Scanner starting', {
    pairs: scannerConfig.pairs.length,
    watchlist: scannerConfig.pairs,
    timeframes: scannerConfig.timeframes,
    cycleSeconds: scannerConfig.cycleSeconds,
    minConfluenceScore: scannerConfig.minConfluenceScore,
    llmSynthesis: scannerConfig.useLlmSynthesis,
  });

  while (!shuttingDown) {
    const cycleStart = Date.now();
    await runCycle(scannerConfig, client, state, logger);
    const elapsedSeconds = (Date.now() - cycleStart) / 1000;
    const sleepSeconds = Math.max(0, scannerConfig.cycleSeconds - elapsedSeconds);
    logger.info('Cycle done', { elapsedSeconds: Number(elapsedSeconds.toFixed(1)), sleepSeconds: Number(sleepSeconds.toFixed(1)) });
    await new Promise((resolve) => setTimeout(resolve, sleepSeconds * 1000));
  }

  logger.info('Scanner stopped');
  process.exit(0);
}

main().catch((error) => {
  logger.error('Scanner crashed', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
