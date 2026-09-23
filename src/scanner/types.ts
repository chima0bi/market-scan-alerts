import type { Interval } from '../types/market.js';
import type { StrategyResult } from '../types/strategies.js';
import type { StrategyContext } from '../types/strategies.js';

/** Result of running the full strategy registry on one (pair, timeframe). */
export interface TimeframeResult {
  timeframe: Interval;
  latestCandleTimestamp: number;
  context: StrategyContext;
  strategyResults: StrategyResult[];
}

/** A single timeframe's contribution to a candidate: which strategies fired,
 *  already collapsed so multiple strategies on the same timeframe count once. */
export interface TimeframeConfirmation {
  timeframe: Interval;
  direction: 'bullish' | 'bearish';
  firingStrategies: string[];
}

/** A scored, pre-LLM candidate produced by the confluence scorer. */
export interface Candidate {
  pair: string;
  direction: 'bullish' | 'bearish';
  score: number;
  confirmingTimeframes: TimeframeConfirmation[];
  conflictingTimeframes: TimeframeConfirmation[];
  duplicatedEvidenceRemoved: string[];
  raw: Record<Interval, StrategyResult[]>;
}

export interface ScannerConfig {
  pairs: string[];
  timeframes: Interval[];
  category: 'spot' | 'linear' | 'inverse' | 'option';
  candlesPerTimeframe: number;
  cycleSeconds: number;
  cooldownMinutes: number;
  minConfluenceScore: number;
  maxConcurrentPairs: number;
  requestDelaySeconds: number;
  useLlmSynthesis: boolean;
  llmModel: string;
}
