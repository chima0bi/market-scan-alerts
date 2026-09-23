import type { Candle } from '../types/market.js';
import type { LiquidityLevel, LiquiditySweep } from '../types/analysis.js';

export function detectEqualLevels(candles: Candle[], tolerance = 0.001): LiquidityLevel[] {
  const levels: LiquidityLevel[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1]; const current = candles[index];
    if (!previous || !current) continue;
    if (Math.abs(current.high - previous.high) / previous.high <= tolerance) levels.push({ kind: 'equal-highs', price: (current.high + previous.high) / 2, timestamp: current.timestamp, description: 'Candidate equal-high liquidity' });
    if (Math.abs(current.low - previous.low) / previous.low <= tolerance) levels.push({ kind: 'equal-lows', price: (current.low + previous.low) / 2, timestamp: current.timestamp, description: 'Candidate equal-low liquidity' });
  }
  return levels;
}
export function detectLiquiditySweeps(candles: Candle[], levels: LiquidityLevel[], tolerance = 0): LiquiditySweep[] {
  const sweeps: LiquiditySweep[] = [];
  candles.forEach((candle) => levels.forEach((level) => {
    if (level.kind.includes('high') && candle.high > level.price + tolerance) sweeps.push({ level: level.price, sweepPrice: candle.high, candleTimestamp: candle.timestamp, direction: 'bearish', confirmation: candle.close < level.price ? 'confirmed-rejection' : 'breakout' });
    if (level.kind.includes('low') && candle.low < level.price - tolerance) sweeps.push({ level: level.price, sweepPrice: candle.low, candleTimestamp: candle.timestamp, direction: 'bullish', confirmation: candle.close > level.price ? 'confirmed-rejection' : 'breakout' });
  }));
  return sweeps;
}
