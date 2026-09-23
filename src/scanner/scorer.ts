import type { Interval } from '../types/market.js';
import type { StrategyResult } from '../types/strategies.js';
import type { Candidate, TimeframeConfirmation, TimeframeResult } from './types.js';

/**
 * Turns raw per-timeframe strategy output into scored candidates.
 *
 * Rules (architecture.md §2.5, master_prompt.md §"WHAT TO CHECK"):
 *  1. Only a strategy's own `validSetup` flag counts — "3 of 4 conditions"
 *     is a watchlist item, not a signal (this is why Turtle Soup, whose
 *     `confirmation` condition is hardcoded false in the current registry,
 *     never contributes evidence here).
 *  2. Multiple strategies firing on the SAME timeframe are treated as one
 *     point of evidence for that timeframe, not summed — several detectors
 *     confirming off the same recent candles is exactly the kind of
 *     duplicated evidence architecture.md warns about (e.g. a displacement
 *     candle that also triggers a CRT expansion). Collapsing to
 *     one-vote-per-timeframe makes that duplication structurally impossible
 *     rather than trying to detect it after the fact.
 *  3. A candidate only exists when at least `minConfluenceScore` DISTINCT
 *     timeframes agree on direction — one timeframe echoing itself down to
 *     a lower zoom level does not count as confirmation.
 *  4. If both directions clear the bar (or tie), that's a genuine conflict:
 *     no candidate is produced, because picking a side would be guessing.
 */
export function scorePair(
  pair: string,
  timeframeResults: TimeframeResult[],
  minConfluenceScore: number,
): Candidate[] {
  const byDirection: Record<'bullish' | 'bearish', TimeframeConfirmation[]> = { bullish: [], bearish: [] };
  const duplicatedEvidenceRemoved: string[] = [];
  const raw: Record<Interval, StrategyResult[]> = {} as Record<Interval, StrategyResult[]>;

  for (const { timeframe, strategyResults } of timeframeResults) {
    raw[timeframe] = strategyResults;
    const confirmed = strategyResults.filter(
      (result): result is StrategyResult & { direction: 'bullish' | 'bearish' } =>
        result.validSetup && (result.direction === 'bullish' || result.direction === 'bearish'),
    );
    for (const direction of ['bullish', 'bearish'] as const) {
      const firing = confirmed.filter((result) => result.direction === direction);
      if (firing.length === 0) continue;
      if (firing.length > 1) {
        duplicatedEvidenceRemoved.push(
          `${timeframe}: collapsed ${firing.length} confirming strategies (${firing.map((r) => r.strategy).join(', ')}) into one point of evidence`,
        );
      }
      byDirection[direction].push({ timeframe, direction, firingStrategies: firing.map((r) => r.strategy) });
    }
  }

  const bullishScore = byDirection.bullish.length;
  const bearishScore = byDirection.bearish.length;

  if (bullishScore === bearishScore) {
    // Either nothing fired, or the two directions are tied — never guess.
    return [];
  }

  const winner: 'bullish' | 'bearish' = bullishScore > bearishScore ? 'bullish' : 'bearish';
  const loser: 'bullish' | 'bearish' = winner === 'bullish' ? 'bearish' : 'bullish';
  const score = byDirection[winner].length;

  if (score < minConfluenceScore) return [];

  return [
    {
      pair,
      direction: winner,
      score,
      confirmingTimeframes: byDirection[winner],
      conflictingTimeframes: byDirection[loser],
      duplicatedEvidenceRemoved,
      raw,
    },
  ];
}
