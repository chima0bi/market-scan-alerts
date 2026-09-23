import { describe, expect, it } from 'vitest';
import { analyzeMarketStructure, calculatePremiumDiscount, detectFairValueGaps } from '../src/types/analysis.js';
import { detectEqualLevels, detectLiquiditySweeps } from '../src/analysis/liquidity.js';
import { calculateRisk } from '../src/types/risk.js';
import { detectCandlestickPatterns, detectChartPatterns } from '../src/analysis/patterns.js';
import { detectBreakerBlocks, detectChangeOfDelivery, detectOrderBlocks, detectSmtDivergence } from '../src/analysis/concepts.js';
import type { Candle } from '../src/types/market.js';

const candle = (timestamp: number, open: number, high: number, low: number, close: number): Candle => ({ timestamp, open, high, low, close, volume: 1, closed: true });

describe('deterministic analysis', () => {
  it('detects bullish FVG and filled state', () => {
    const candles = [candle(1, 100, 105, 99, 104), candle(2, 104, 110, 104, 109), candle(3, 109, 115, 108, 114), candle(4, 114, 116, 103, 104)];
    const gaps = detectFairValueGaps(candles, 1);
    expect(gaps[0]).toMatchObject({ direction: 'bullish', lower: 105, upper: 108, filled: true });
  });
  it('calculates risk and risk reward numerically', () => {
    const risk = calculateRisk(10000, 1, 100, 95, 110, 2);
    expect(risk.maximumAccountLoss).toBe(100); expect(risk.positionSize).toBe(20); expect(risk.riskReward).toBe(2); expect(risk.marginAtLeverage).toBe(1000);
  });
  it('detects equal highs and a confirmed rejection sweep', () => {
    const candles = [candle(1, 100, 110, 99, 105), candle(2, 105, 110.05, 103, 109), candle(3, 109, 112, 106, 108)];
    const levels = detectEqualLevels(candles, 0.01); const sweeps = detectLiquiditySweeps(candles, levels);
    expect(levels.some((level) => level.kind === 'equal-highs')).toBe(true); expect(sweeps.at(-1)?.confirmation).toBe('confirmed-rejection');
  });
  it('returns explicit premium and discount values', () => { expect(calculatePremiumDiscount(120, 100)).toEqual({ high: 120, low: 100, equilibrium: 110, premiumZone: { low: 110, high: 120 }, discountZone: { low: 100, high: 110 } }); });
  it('exposes structure parameters and events', () => { const candles = [candle(1, 100, 105, 99, 104), candle(2, 104, 108, 103, 107), candle(3, 107, 109, 104, 105), candle(4, 105, 111, 104, 110), candle(5, 110, 112, 108, 111), candle(6, 111, 113, 109, 112), candle(7, 112, 114, 110, 113)]; const structure = analyzeMarketStructure(candles, 1); expect(structure.swingMethod).toBe('confirmed-pivot'); expect(structure.lookback).toBe(1); });
  it('detects confirmed candle patterns without treating them as trade signals', () => {
    const candles = Array.from({ length: 21 }, (_, index) => candle(index, 100, 102, 99, 101));
    candles.push(candle(21, 101, 102, 90, 101.5));
    const patterns = detectCandlestickPatterns(candles);
    expect(patterns.find((pattern) => pattern.name === 'hammer-or-pin-bar')).toMatchObject({ detected: true, direction: 'bullish' });
  });
  it('returns chart-pattern observations only when enough candles exist', () => {
    expect(detectChartPatterns([candle(1, 1, 2, 0.5, 1)])).toEqual([]);
  });
  it('detects an order-block candidate and its invalidated breaker', () => {
    const candles = [candle(1, 100, 104, 98, 103), candle(2, 103, 104, 99, 100), candle(3, 100, 112, 99, 111), candle(4, 111, 113, 95, 97)];
    const blocks = detectOrderBlocks(candles, 1.2);
    expect(blocks[0]).toMatchObject({ direction: 'bullish', low: 99, high: 104 });
    expect(detectBreakerBlocks(candles, blocks)[0]).toMatchObject({ name: 'bearish-breaker-block', direction: 'bearish' });
  });
  it('detects a change in delivery and SMT divergence from synchronized candles', () => {
    const primary = [candle(1, 100, 105, 99, 104), candle(2, 104, 106, 103, 105), candle(3, 105, 110, 104, 109)];
    const comparison = [candle(1, 200, 205, 199, 204), candle(2, 204, 206, 203, 205), candle(3, 205, 205.5, 201, 202)];
    expect(detectChangeOfDelivery(primary, 2)[0]).toMatchObject({ detected: true, direction: 'bullish' });
    expect(detectSmtDivergence(primary, comparison)[0]).toMatchObject({ detected: true, direction: 'bearish' });
  });
});
