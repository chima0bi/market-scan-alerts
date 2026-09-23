import type { Candle } from './market.js';

export type Direction = 'bullish' | 'bearish';
export type Trend = 'bullish' | 'bearish' | 'range' | 'unknown';

export interface SwingPoint {
  index: number;
  timestamp: number;
  price: number;
  kind: 'high' | 'low';
  major: boolean;
}

export interface StructureEvent {
  type: 'HH' | 'HL' | 'LH' | 'LL' | 'BOS' | 'MSS';
  direction: Direction;
  price: number;
  timestamp: number;
  index: number;
}

export interface MarketStructure {
  trend: Trend;
  swingMethod: 'confirmed-pivot';
  lookback: number;
  swings: SwingPoint[];
  events: StructureEvent[];
  lastBreak?: StructureEvent;
}

export interface LiquidityLevel {
  kind: 'equal-highs' | 'equal-lows' | 'swing-high' | 'swing-low' | 'previous-day-high' | 'previous-day-low';
  price: number;
  timestamp?: number;
  description: string;
}

export interface LiquiditySweep {
  level: number;
  sweepPrice: number;
  candleTimestamp: number;
  direction: Direction;
  confirmation: 'wick-sweep' | 'confirmed-rejection' | 'breakout';
}

export interface FairValueGap {
  direction: Direction;
  upper: number;
  lower: number;
  size: number;
  timestamp: number;
  filled: boolean;
}

export interface Displacement {
  detected: boolean;
  direction?: Direction;
  bodyToAtr: number;
  rangeToAtr: number;
  candleTimestamp: number;
  parameters: { atrPeriod: number; bodyToAtrMin: number; rangeToAtrMin: number };
}

export interface PremiumDiscount {
  high: number;
  low: number;
  equilibrium: number;
  premiumZone: { low: number; high: number };
  discountZone: { low: number; high: number };
}

export function averageTrueRange(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const ranges = candles.slice(1).map((candle, index) => {
    const previous = candles[index];
    if (!previous) return 0;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close));
  });
  const selected = ranges.slice(-period);
  return selected.length === 0 ? 0 : selected.reduce((sum, value) => sum + value, 0) / selected.length;
}

export function detectSwings(candles: Candle[], lookback = 3): SwingPoint[] {
  if (lookback < 1 || candles.length < lookback * 2 + 1) return [];
  const swings: SwingPoint[] = [];
  for (let index = lookback; index < candles.length - lookback; index += 1) {
    const candle = candles[index];
    if (!candle) continue;
    const left = candles.slice(index - lookback, index);
    const right = candles.slice(index + 1, index + lookback + 1);
    if (left.every((item) => candle.high > item.high) && right.every((item) => candle.high > item.high)) {
      swings.push({ index, timestamp: candle.timestamp, price: candle.high, kind: 'high', major: lookback >= 3 });
    }
    if (left.every((item) => candle.low < item.low) && right.every((item) => candle.low < item.low)) {
      swings.push({ index, timestamp: candle.timestamp, price: candle.low, kind: 'low', major: lookback >= 3 });
    }
  }
  return swings;
}

export function analyzeMarketStructure(candles: Candle[], lookback = 3): MarketStructure {
  const swings = detectSwings(candles, lookback);
  const highs = swings.filter((swing) => swing.kind === 'high');
  const lows = swings.filter((swing) => swing.kind === 'low');
  const events: StructureEvent[] = [];
  for (let index = 1; index < highs.length; index += 1) {
    const current = highs[index]; const previous = highs[index - 1];
    if (!current || !previous) continue;
    events.push({ type: current.price > previous.price ? 'HH' : 'LH', direction: current.price > previous.price ? 'bullish' : 'bearish', price: current.price, timestamp: current.timestamp, index: current.index });
  }
  for (let index = 1; index < lows.length; index += 1) {
    const current = lows[index]; const previous = lows[index - 1];
    if (!current || !previous) continue;
    events.push({ type: current.price > previous.price ? 'HL' : 'LL', direction: current.price > previous.price ? 'bullish' : 'bearish', price: current.price, timestamp: current.timestamp, index: current.index });
  }
  events.sort((a, b) => a.index - b.index);
  const last = candles.at(-1);
  const lastHigh = highs.at(-1); const lastLow = lows.at(-1);
  let lastBreak: StructureEvent | undefined;
  if (last && lastHigh && last.close > lastHigh.price) lastBreak = { type: 'BOS', direction: 'bullish', price: lastHigh.price, timestamp: last.timestamp, index: candles.length - 1 };
  if (last && lastLow && last.close < lastLow.price) lastBreak = { type: 'BOS', direction: 'bearish', price: lastLow.price, timestamp: last.timestamp, index: candles.length - 1 };
  if (lastBreak) events.push(lastBreak);
  const bullish = events.filter((event) => event.direction === 'bullish').length;
  const bearish = events.filter((event) => event.direction === 'bearish').length;
  return { trend: bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'range', swingMethod: 'confirmed-pivot', lookback, swings, events, ...(lastBreak ? { lastBreak } : {}) };
}

export function detectFairValueGaps(candles: Candle[], minimumSize = 0): FairValueGap[] {
  const gaps: FairValueGap[] = [];
  for (let index = 2; index < candles.length; index += 1) {
    const first = candles[index - 2]; const middle = candles[index - 1]; const third = candles[index];
    if (!first || !middle || !third) continue;
    if (third.low > first.high && third.low - first.high >= minimumSize) gaps.push({ direction: 'bullish', lower: first.high, upper: third.low, size: third.low - first.high, timestamp: third.timestamp, filled: candles.slice(index + 1).some((candle) => candle.low <= first.high) });
    if (third.high < first.low && first.low - third.high >= minimumSize) gaps.push({ direction: 'bearish', lower: third.high, upper: first.low, size: first.low - third.high, timestamp: third.timestamp, filled: candles.slice(index + 1).some((candle) => candle.high >= first.low) });
  }
  return gaps;
}

export function calculatePremiumDiscount(high: number, low: number): PremiumDiscount {
  if (!(high > low)) throw new Error('Range high must be greater than range low');
  const equilibrium = low + (high - low) / 2;
  return { high, low, equilibrium, premiumZone: { low: equilibrium, high }, discountZone: { low, high: equilibrium } };
}
