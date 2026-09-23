import type { Candle } from '../types/market.js';

export interface PatternObservation {
  name: string;
  detected: boolean;
  direction?: 'bullish' | 'bearish' | 'neutral';
  timestamp?: number;
  evidence: string[];
  limitations: string;
}

const body = (candle: Candle) => Math.abs(candle.close - candle.open);
const range = (candle: Candle) => candle.high - candle.low;
const near = (left: number, right: number, tolerance: number) => Math.abs(left - right) <= Math.max(left, right) * tolerance;

function observation(name: string, detected: boolean, evidence: string[], direction?: PatternObservation['direction'], timestamp?: number): PatternObservation {
  return { name, detected, ...(direction ? { direction } : {}), ...(timestamp ? { timestamp } : {}), evidence, limitations: 'Heuristic candle-pattern observation; confirm with context and subsequent price action.' };
}

export function detectCandlestickPatterns(candles: Candle[]): PatternObservation[] {
  const current = candles.at(-1);
  if (!current) return [];
  const candleRange = range(current);
  if (candleRange <= 0) return [];
  const upperWick = current.high - Math.max(current.open, current.close);
  const lowerWick = Math.min(current.open, current.close) - current.low;
  const candleBody = body(current);
  const averageBody = candles.slice(-21, -1).reduce((sum, item) => sum + body(item), 0) / Math.max(1, Math.min(20, candles.length - 1));
  const prior = candles.at(-2);
  return [
    observation('shooting-star', upperWick >= candleBody * 2 && lowerWick <= candleBody && current.close < current.open, ['Upper wick is at least twice the body.', 'Close is below the open.'], 'bearish', current.timestamp),
    observation('hammer-or-pin-bar', lowerWick >= candleBody * 2 && upperWick <= candleBody && current.close > current.open, ['Lower wick is at least twice the body.', 'Close is above the open.'], 'bullish', current.timestamp),
    observation('doji', candleBody <= candleRange * 0.1, ['Body is no more than 10% of the candle range.'], 'neutral', current.timestamp),
    observation('bullish-engulfing', Boolean(prior && prior.close < prior.open && current.close > current.open && current.open <= prior.close && current.close >= prior.open), ['Latest bullish body engulfs the prior bearish body.'], 'bullish', current.timestamp),
    observation('bearish-engulfing', Boolean(prior && prior.close > prior.open && current.close < current.open && current.open >= prior.close && current.close <= prior.open), ['Latest bearish body engulfs the prior bullish body.'], 'bearish', current.timestamp),
    observation('displacement-candle', candleBody >= averageBody * 1.8 && candleBody >= candleRange * 0.6, ['Body is at least 1.8x the recent average body.', 'Body is at least 60% of the candle range.'], current.close > current.open ? 'bullish' : 'bearish', current.timestamp),
  ];
}

export function detectChartPatterns(candles: Candle[]): PatternObservation[] {
  if (candles.length < 12) return [];
  const recent = candles.slice(-12);
  const highs = recent.map((candle) => candle.high);
  const lows = recent.map((candle) => candle.low);
  const firstHigh = Math.max(...highs.slice(0, 4));
  const middleHigh = Math.max(...highs.slice(4, 8));
  const lastHigh = Math.max(...highs.slice(8));
  const firstLow = Math.min(...lows.slice(0, 4));
  const middleLow = Math.min(...lows.slice(4, 8));
  const lastLow = Math.min(...lows.slice(8));
  const tolerance = 0.003;
  return [
    observation('double-top-or-triple-top', near(firstHigh, lastHigh, tolerance) && middleHigh <= Math.max(firstHigh, lastHigh), ['Separated highs are within 0.3% of each other.'], 'bearish', recent.at(-1)?.timestamp),
    observation('double-bottom-or-triple-bottom', near(firstLow, lastLow, tolerance) && middleLow >= Math.min(firstLow, lastLow), ['Separated lows are within 0.3% of each other.'], 'bullish', recent.at(-1)?.timestamp),
    observation('head-and-shoulders-or-inverse', (middleHigh > firstHigh * 1.005 && middleHigh > lastHigh * 1.005) || (middleLow < firstLow * 0.995 && middleLow < lastLow * 0.995), ['The middle swing is materially beyond the outer swings.', 'Neckline confirmation is not inferred.'], middleHigh > firstHigh && middleHigh > lastHigh ? 'bearish' : 'bullish', recent.at(-1)?.timestamp),
    observation('ascending-or-descending-triangle', near(firstHigh, lastHigh, tolerance) || near(firstLow, lastLow, tolerance), ['One boundary is approximately flat over the observation window.', 'Breakout direction is not inferred.'], 'neutral', recent.at(-1)?.timestamp),
  ];
}