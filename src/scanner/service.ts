import { BybitMarketClient } from '../bybit/rest.js';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import { runCycle } from './orchestrator.js';
import type { ScannerConfig } from './types.js';
import { StateStore } from './state.js';

export function startScanner(envConfig: Config, scannerConfig: ScannerConfig, logger: Logger): { stop: () => void; finished: Promise<void> } {
  const client = new BybitMarketClient(envConfig.BYBIT_BASE_URL, envConfig.STALE_DATA_THRESHOLD_MS, logger);
  const state = new StateStore();
  let stopped = false;
  let resolveSleep: (() => void) | undefined;

  const stop = () => {
    stopped = true;
    resolveSleep?.();
  };

  const finished = (async () => {
    logger.info('Scanner starting', {
      pairs: scannerConfig.pairs.length,
      watchlist: scannerConfig.pairs,
      timeframes: scannerConfig.timeframes,
      cycleSeconds: scannerConfig.cycleSeconds,
      minConfluenceScore: scannerConfig.minConfluenceScore,
      llmSynthesis: scannerConfig.useLlmSynthesis,
    });

    while (!stopped) {
      const cycleStart = Date.now();
      await runCycle(scannerConfig, client, state, logger);
      const elapsedSeconds = (Date.now() - cycleStart) / 1000;
      const sleepSeconds = Math.max(0, scannerConfig.cycleSeconds - elapsedSeconds);
      logger.info('Cycle done', { elapsedSeconds: Number(elapsedSeconds.toFixed(1)), sleepSeconds: Number(sleepSeconds.toFixed(1)) });
      if (stopped || sleepSeconds <= 0) continue;
      await new Promise<void>((resolve) => {
        resolveSleep = resolve;
        setTimeout(resolve, sleepSeconds * 1000);
      });
      resolveSleep = undefined;
    }

    logger.info('Scanner stopped');
  })();

  return { stop, finished };
}