import type { Candle } from '../types/market.js';
import { averageTrueRange } from '../types/analysis.js';
import type { Displacement } from '../types/analysis.js';
export function detectDisplacement(candles: Candle[], atrPeriod = 14, bodyToAtrMin = 1.5, rangeToAtrMin = 1.8): Displacement[] {
  return candles.map((candle, index) => { const atr = averageTrueRange(candles.slice(0, index + 1), atrPeriod); const body = Math.abs(candle.close - candle.open); const range = candle.high - candle.low; return { detected: atr > 0 && body / atr >= bodyToAtrMin && range / atr >= rangeToAtrMin, ...(candle.close >= candle.open ? { direction: 'bullish' as const } : { direction: 'bearish' as const }), bodyToAtr: atr ? body / atr : 0, rangeToAtr: atr ? range / atr : 0, candleTimestamp: candle.timestamp, parameters: { atrPeriod, bodyToAtrMin, rangeToAtrMin } }; }).filter((item) => item.detected);
}
