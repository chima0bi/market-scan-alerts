import { averageTrueRange } from '../types/analysis.js';
import type { Direction, FairValueGap } from '../types/analysis.js';
import type { StrategyContext, StrategyResult } from '../types/strategies.js';

export type TradeSignalStatus = 'READY' | 'WAIT';

export interface TradeSignal {
  decision: 'LONG' | 'SHORT' | 'WAIT';
  status: TradeSignalStatus;
  symbol: string;
  timeframe: string;
  currentPrice: number | null;
  entryZone: { low: number; high: number } | null;
  trigger: string | null;
  invalidation: number | null;
  targets: number[];
  confirmingTimeframes: string[];
  reasons: string[];
  missing: string[];
}

const toDecision = (direction: Direction): 'LONG' | 'SHORT' => direction === 'bullish' ? 'LONG' : 'SHORT';

function matchingZone(context: StrategyContext, direction: Direction): { low: number; high: number } | null {
  const zone = context.zones
    .filter((candidate) => candidate.direction === direction && !candidate.mitigated)
    .at(-1);
  if (zone) return { low: zone.low, high: zone.high };

  const gap: FairValueGap | undefined = context.fvgs
    .filter((candidate) => candidate.direction === direction && !candidate.filled)
    .at(-1);
  return gap ? { low: gap.lower, high: gap.upper } : null;
}

function triggerFor(context: StrategyContext, direction: Direction): string | null {
  const latest = context.candles.at(-1);
  if (!latest?.closed) return null;
  const displacement = context.displacements.at(-1);
  if (displacement?.detected && displacement.direction === direction && displacement.candleTimestamp === latest.timestamp) {
    return `${direction} displacement on the latest closed candle`;
  }
  if (context.structure.lastBreak?.direction === direction && context.structure.lastBreak.timestamp === latest.timestamp) {
    return `${direction} break of structure on the latest closed candle`;
  }
  const sweep = context.sweeps.at(-1);
  if (sweep?.direction === direction && sweep.confirmation === 'confirmed-rejection' && sweep.candleTimestamp === latest.timestamp) {
    return `${direction} liquidity sweep rejection on the latest closed candle`;
  }
  return null;
}

function targets(context: StrategyContext, direction: Direction, currentPrice: number): number[] {
  const prices = context.structure.swings
    .filter((swing) => direction === 'bullish' ? swing.kind === 'high' && swing.price > currentPrice : swing.kind === 'low' && swing.price < currentPrice)
    .map((swing) => swing.price)
    .sort((a, b) => direction === 'bullish' ? a - b : b - a);
  return prices.slice(0, 2);
}

export function evaluateTradeSignal(
  symbol: string,
  direction: Direction,
  context: StrategyContext,
  confirmingTimeframes: string[],
  strategyResults: StrategyResult[] = [],
): TradeSignal {
  const latest = context.candles.at(-1);
  const zone = matchingZone(context, direction);
  const trigger = triggerFor(context, direction);
  const missing: string[] = [];
  const reasons: string[] = [];

  if (!latest?.closed) missing.push('latest candle is not closed');
  if (!zone) missing.push('no unmitigated entry zone or unfilled FVG');
  if (!trigger) missing.push('no directional trigger on the latest closed candle');
  if (context.structure.trend === direction) reasons.push(`${direction} market structure`);
  reasons.push(...strategyResults.filter((result) => result.validSetup && result.direction === direction).flatMap((result) => result.evidence.slice(0, 2)));
  if (trigger) reasons.push(trigger);

  const currentPrice = latest?.close ?? null;
  const atr = averageTrueRange(context.candles) * 0.25;
  const invalidation = zone && atr > 0
    ? direction === 'bullish' ? zone.low - atr : zone.high + atr
    : null;
  const signalTargets = currentPrice === null ? [] : targets(context, direction, currentPrice);
  const ready = missing.length === 0 && invalidation !== null && signalTargets.length > 0;

  if (invalidation === null) missing.push('unable to calculate invalidation');
  if (signalTargets.length === 0) missing.push('no opposing confirmed swing available for a target');

  return {
    decision: ready ? toDecision(direction) : 'WAIT',
    status: ready ? 'READY' : 'WAIT',
    symbol,
    timeframe: confirmingTimeframes.at(-1) ?? 'unknown',
    currentPrice,
    entryZone: zone,
    trigger,
    invalidation,
    targets: signalTargets,
    confirmingTimeframes,
    reasons: [...new Set(reasons)],
    missing: [...new Set(missing)],
  };
}