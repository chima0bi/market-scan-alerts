import type { Candle } from '../types/market.js';
import { analyzeMarketStructure, detectFairValueGaps } from '../types/analysis.js';
import { detectEqualLevels, detectLiquiditySweeps } from './liquidity.js';
import { detectDisplacement } from './displacement.js';
import { detectCandlestickPatterns, detectChartPatterns } from './patterns.js';
import {
  detectBalancedPriceRanges,
  detectBreakawayGaps,
  detectBreakerBlocks,
  detectChangeOfDelivery,
  detectInversionFvgs,
  detectOrderBlocks,
  detectPropulsionBlocks,
  detectSmtDivergence,
  detectStructureShift,
  detectSupplyDemandZones,
} from './concepts.js';
import type { StrategyContext } from '../types/strategies.js';

/**
 * Builds the same StrategyContext the `analyze_strategies` MCP tool assembles,
 * so the interactive tool and the unattended scanner never drift apart.
 */
export function buildAnalysisContext(candles: Candle[], comparisonCandles: Candle[] = []): StrategyContext {
  const levels = detectEqualLevels(candles);
  const structure = analyzeMarketStructure(candles);
  const sweeps = detectLiquiditySweeps(candles, levels);
  const displacements = detectDisplacement(candles);
  const fvgs = detectFairValueGaps(candles);
  const orderBlocks = detectOrderBlocks(candles);
  const conceptObservations = [
    ...detectInversionFvgs(candles, fvgs),
    ...detectBalancedPriceRanges(fvgs),
    ...detectBreakawayGaps(candles),
    ...detectChangeOfDelivery(candles),
    ...detectStructureShift(structure),
    ...(comparisonCandles.length ? detectSmtDivergence(candles, comparisonCandles) : []),
  ];
  const zones = [
    ...orderBlocks,
    ...detectBreakerBlocks(candles, orderBlocks),
    ...detectPropulsionBlocks(candles, orderBlocks),
    ...detectSupplyDemandZones(candles),
  ];
  return {
    candles,
    structure,
    sweeps,
    displacements,
    fvgs,
    patterns: [...detectCandlestickPatterns(candles), ...detectChartPatterns(candles)],
    concepts: {
      equalHighsOrLows: levels.length > 0,
      liquiditySweep: sweeps.length > 0,
      fvg: fvgs.length > 0,
      smtDivergence: conceptObservations.some((observation) => observation.name === 'smt-divergence' && observation.detected),
    },
    conceptObservations,
    zones,
  };
}
