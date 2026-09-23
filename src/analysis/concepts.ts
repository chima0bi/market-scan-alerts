import type { Candle } from '../types/market.js';
import type { Direction, FairValueGap, MarketStructure } from '../types/analysis.js';

export interface PriceZone {
  name: string;
  direction: Direction;
  high: number;
  low: number;
  originTimestamp: number;
  mitigated: boolean;
  evidence: string[];
}

export interface ConceptObservation {
  name: string;
  detected: boolean;
  direction?: Direction;
  timestamp?: number;
  evidence: string[];
  limitations: string;
}

const directionOf = (candle: Candle): Direction => candle.close >= candle.open ? 'bullish' : 'bearish';
const body = (candle: Candle) => Math.abs(candle.close - candle.open);
const averageBody = (candles: Candle[], end: number, period = 10) => {
  const values = candles.slice(Math.max(0, end - period), end).map(body);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
};

export function detectOrderBlocks(candles: Candle[], minimumImpulseMultiple = 1.5): PriceZone[] {
  const zones: PriceZone[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const origin = candles[index - 1];
    const impulse = candles[index];
    if (!origin || !impulse) continue;
    const baseline = averageBody(candles, index - 1);
    if (baseline <= 0 || body(impulse) < baseline * minimumImpulseMultiple) continue;
    const direction = directionOf(impulse);
    if (direction === directionOf(origin)) continue;
    const later = candles.slice(index + 1);
    zones.push({ name: `potential-${direction === 'bullish' ? 'bullish' : 'bearish'}-order-block`, direction, high: origin.high, low: origin.low, originTimestamp: origin.timestamp, mitigated: later.some((candle) => candle.low <= origin.high && candle.high >= origin.low), evidence: ['Opposite-direction origin candle preceded a range-expanding impulse.', `Impulse body was at least ${minimumImpulseMultiple}x the recent average body.`] });
  }
  return zones;
}

export function detectInversionFvgs(candles: Candle[], fvgs: FairValueGap[]): ConceptObservation[] {
  return fvgs.filter((gap) => gap.filled).map((gap) => {
    const later = candles.find((candle) => candle.timestamp > gap.timestamp && (gap.direction === 'bullish' ? candle.close < gap.lower : candle.close > gap.upper));
    return { name: 'inversion-fvg', detected: Boolean(later), direction: gap.direction === 'bullish' ? 'bearish' : 'bullish', timestamp: later?.timestamp ?? gap.timestamp, evidence: ['A previously identified FVG was filled.', 'Price subsequently closed through the former gap boundary.'], limitations: 'Inversion is a heuristic failure/reclaim concept; it is not proof of support or resistance.' };
  });
}

export function detectBreakerBlocks(candles: Candle[], orderBlocks: PriceZone[]): PriceZone[] {
  return orderBlocks.filter((zone) => {
    const originIndex = candles.findIndex((candle) => candle.timestamp === zone.originTimestamp);
    if (originIndex < 0) return false;
    const later = candles.slice(originIndex + 1);
    return later.some((candle) => zone.direction === 'bullish' ? candle.close < zone.low : candle.close > zone.high);
  }).map((zone) => ({ ...zone, name: `${zone.direction === 'bullish' ? 'bearish' : 'bullish'}-breaker-block`, direction: zone.direction === 'bullish' ? 'bearish' : 'bullish', evidence: [...zone.evidence, 'The originating order-block zone was invalidated by a close beyond its boundary.'] }));
}

export function detectPropulsionBlocks(candles: Candle[], orderBlocks: PriceZone[]): PriceZone[] {
  return orderBlocks.filter((zone) => {
    const index = candles.findIndex((candle) => candle.timestamp === zone.originTimestamp);
    const next = candles[index + 1];
    const following = candles[index + 2];
    return Boolean(next && following && directionOf(next) === zone.direction && directionOf(following) === zone.direction && body(next) > body(candles[index] ?? next));
  }).map((zone) => ({ ...zone, name: 'propulsion-block', evidence: [...zone.evidence, 'Two subsequent candles continued in the impulse direction.'] }));
}

export function detectBalancedPriceRanges(fvgs: FairValueGap[]): ConceptObservation[] {
  const observations: ConceptObservation[] = [];
  for (const first of fvgs) {
    const opposing = fvgs.find((second) => second.direction !== first.direction && second.timestamp > first.timestamp && Math.max(first.lower, second.lower) < Math.min(first.upper, second.upper));
    if (opposing) observations.push({ name: 'balanced-price-range', detected: true, timestamp: opposing.timestamp, evidence: ['Opposing FVG boundaries overlap.', 'The overlap is treated as a candidate balanced price range.'], limitations: 'BPR detection depends on the selected FVG definition and does not predict reaction.' });
  }
  return observations;
}

export function detectBreakawayGaps(candles: Candle[]): ConceptObservation[] {
  return candles.slice(1).flatMap((current, index) => {
    const previous = candles[index];
    if (!previous) return [];
    const gapUp = current.open > previous.high && current.close > current.open;
    const gapDown = current.open < previous.low && current.close < current.open;
    return gapUp || gapDown ? [{ name: 'breakaway-gap', detected: true, direction: gapUp ? 'bullish' as const : 'bearish' as const, timestamp: current.timestamp, evidence: ['The candle opened beyond the prior range and closed in the gap direction.'], limitations: 'Crypto trades continuously, so apparent gaps can reflect sparse candles or data boundaries.' }] : [];
  });
}

export function detectSupplyDemandZones(candles: Candle[], minimumImpulseMultiple = 1.8): PriceZone[] {
  return detectOrderBlocks(candles, minimumImpulseMultiple).map((zone) => ({ ...zone, name: zone.direction === 'bullish' ? 'candidate-demand-zone' : 'candidate-supply-zone', evidence: [...zone.evidence, 'Zone is a base/origin candle heuristic, not proof of institutional inventory.'] }));
}

export function detectChangeOfDelivery(candles: Candle[], lookback = 5): ConceptObservation[] {
  const current = candles.at(-1);
  if (!current || candles.length < lookback + 1) return [];
  const prior = candles.slice(-lookback - 1, -1);
  const rangeHigh = Math.max(...prior.map((candle) => candle.high));
  const rangeLow = Math.min(...prior.map((candle) => candle.low));
  const bullish = current.close > rangeHigh;
  const bearish = current.close < rangeLow;
  return [{ name: 'change-in-state-of-delivery', detected: bullish || bearish, ...(bullish || bearish ? { direction: bullish ? 'bullish' as const : 'bearish' as const } : {}), timestamp: current.timestamp, evidence: [`Latest close ${bullish ? 'exited above' : bearish ? 'exited below' : 'did not exit'} the prior ${lookback}-candle range.`], limitations: 'CSD is represented as a range-delivery transition and requires follow-through for confirmation.' }];
}

export function detectSmtDivergence(primary: Candle[], comparison: Candle[]): ConceptObservation[] {
  const first = primary.at(-1); const second = comparison.at(-1);
  const primaryPrior = primary.at(-2); const comparisonPrior = comparison.at(-2);
  if (!first || !second || !primaryPrior || !comparisonPrior) return [{ name: 'smt-divergence', detected: false, evidence: ['At least two synchronized candles per instrument are required.'], limitations: 'SMT requires synchronized correlated instruments and matching session/timeframe data.' }];
  const primaryHigher = first.high > primaryPrior.high;
  const comparisonHigher = second.high > comparisonPrior.high;
  const primaryLower = first.low < primaryPrior.low;
  const comparisonLower = second.low < comparisonPrior.low;
  const detected = (primaryHigher !== comparisonHigher) || (primaryLower !== comparisonLower);
  return [{ name: 'smt-divergence', detected, ...((primaryHigher && !comparisonHigher) || (primaryLower && !comparisonLower) ? { direction: primaryHigher && !comparisonHigher ? 'bearish' as const : 'bullish' as const } : {}), timestamp: first.timestamp, evidence: [`Primary high/low expansion: ${primaryHigher || primaryLower}.`, `Comparison high/low expansion: ${comparisonHigher || comparisonLower}.`], limitations: 'This is a minimal two-candle divergence heuristic; use matched instruments and longer swing structure for research.' }];
}

export function detectStructureShift(structure: MarketStructure): ConceptObservation[] {
  const lastBreak = structure.lastBreak;
  if (!lastBreak) return [{ name: 'CHoCH/MSS', detected: false, evidence: ['No confirmed close beyond the latest pivot.'], limitations: 'A structure shift requires a confirmed close beyond a pivot against the prior trend.' }];
  const priorEvents = structure.events.filter((event) => event.index < lastBreak.index);
  const priorBullish = priorEvents.filter((event) => event.direction === 'bullish').length;
  const priorBearish = priorEvents.filter((event) => event.direction === 'bearish').length;
  const priorTrend = priorBullish > priorBearish ? 'bullish' : priorBearish > priorBullish ? 'bearish' : 'range';
  const shift = (priorTrend === 'bearish' && lastBreak.direction === 'bullish') || (priorTrend === 'bullish' && lastBreak.direction === 'bearish');
  return [{ name: shift ? 'CHoCH/MSS' : 'BOS', detected: true, direction: lastBreak.direction, timestamp: lastBreak.timestamp, evidence: [`Prior event bias was ${priorTrend}.`, `Latest break was ${lastBreak.direction}.`], limitations: 'CHoCH/MSS and BOS labels depend on pivot lookback and are not universal definitions.' }];
}