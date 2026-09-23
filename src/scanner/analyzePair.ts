import type { BybitMarketClient } from '../bybit/rest.js';
import { buildAnalysisContext } from '../analysis/context.js';
import { strategyRegistry } from '../strategies/registry.js';
import type { ScannerConfig, TimeframeResult } from './types.js';
import type { RateLimiter } from './rateLimiter.js';

/**
 * Fetches candles and runs the full strategy registry for one pair across
 * every configured timeframe. Pure data-in/data-out aside from the network
 * call, so it stays easy to unit test against synthetic candles later.
 */
export async function analyzePair(
  pair: string,
  config: ScannerConfig,
  client: BybitMarketClient,
  rateLimiter: RateLimiter,
): Promise<TimeframeResult[]> {
  const results: TimeframeResult[] = [];
  for (const timeframe of config.timeframes) {
    await rateLimiter.wait();
    const candles = await client.getKlines(pair, config.category, timeframe, config.candlesPerTimeframe);
    if (candles.length === 0) continue;
    const analysisCandles = candles.at(-1)?.closed === false ? candles.slice(0, -1) : candles;
    if (analysisCandles.length === 0) continue;
    const context = buildAnalysisContext(analysisCandles);
    results.push({
      timeframe,
      latestCandleTimestamp: analysisCandles.at(-1)?.timestamp ?? 0,
      context,
      strategyResults: strategyRegistry.map((strategy) => strategy.analyze(context)),
    });
  }
  return results;
}
