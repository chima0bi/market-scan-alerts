import type { BybitMarketClient } from '../bybit/rest.js';
import type { Logger } from '../logger.js';
import { analyzePair } from './analyzePair.js';
import { scorePair } from './scorer.js';
import { reviewCandidate } from './llmSynthesis.js';
import { dispatchCandidate } from './alertDispatcher.js';
import type { StateStore } from './state.js';
import { RateLimiter } from './rateLimiter.js';
import { evaluateTradeSignal } from '../analysis/tradeSignal.js';
import type { ScannerConfig } from './types.js';

async function scanOnePair(
  pair: string,
  config: ScannerConfig,
  client: BybitMarketClient,
  state: StateStore,
  rateLimiter: RateLimiter,
  logger: Logger,
): Promise<void> {
  try {
    const timeframeResults = await analyzePair(pair, config, client, rateLimiter);
    const candidates = scorePair(pair, timeframeResults, config.minConfluenceScore);

    for (const candidate of candidates) {
      if (!state.shouldFire(candidate.pair, candidate.direction, config.cooldownMinutes * 60)) {
        logger.debug('Candidate in cooldown, skipping', { pair: candidate.pair, direction: candidate.direction });
        continue;
      }

      const triggerResult = [...timeframeResults]
        .filter((result) => candidate.confirmingTimeframes.some((confirmation) => confirmation.timeframe === result.timeframe))
        .at(-1);
      if (!triggerResult) continue;
      const signal = evaluateTradeSignal(
        pair,
        candidate.direction,
        triggerResult.context,
        candidate.confirmingTimeframes.map((confirmation) => confirmation.timeframe),
        triggerResult.strategyResults,
      );
      if (signal.status !== 'READY') {
        logger.info('Candidate did not produce an entry signal', { pair, direction: candidate.direction, missing: signal.missing });
        continue;
      }

      const verdict = config.useLlmSynthesis ? await reviewCandidate(candidate, config.llmModel, logger) : null;
      await dispatchCandidate(candidate, verdict, logger, signal);
      state.record(candidate.pair, candidate.direction);
    }
  } catch (error) {
    logger.error('Error scanning pair', { pair, error: error instanceof Error ? error.message : String(error) });
  }
}

/** Runs one full pass over the watchlist, `maxConcurrentPairs` at a time. */
export async function runCycle(
  config: ScannerConfig,
  client: BybitMarketClient,
  state: StateStore,
  logger: Logger,
): Promise<void> {
  const rateLimiter = new RateLimiter(config.requestDelaySeconds);
  const queue = [...config.pairs];
  const workers = Array.from({ length: Math.min(config.maxConcurrentPairs, queue.length) }, async () => {
    for (;;) {
      const pair = queue.shift();
      if (pair === undefined) return;
      await scanOnePair(pair, config, client, state, rateLimiter, logger);
    }
  });
  await Promise.all(workers);
}
