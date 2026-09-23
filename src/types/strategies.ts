import type { Candle } from './market.js';
import type { Direction, FairValueGap, LiquiditySweep, MarketStructure, Displacement } from './analysis.js';
import type { PatternObservation } from '../analysis/patterns.js';
import type { ConceptObservation, PriceZone } from '../analysis/concepts.js';

export interface StrategyContext {
  candles: Candle[];
  structure: MarketStructure;
  sweeps: LiquiditySweep[];
  displacements: Displacement[];
  fvgs: FairValueGap[];
  patterns: PatternObservation[];
  concepts: Record<string, boolean>;
  conceptObservations: ConceptObservation[];
  zones: PriceZone[];
}

export interface StrategyResult {
  strategy: string;
  validSetup: boolean;
  setupStage: string;
  conditions: Record<string, boolean>;
  direction?: Direction;
  evidence: string[];
  limitations: string[];
  timeframeGuidance?: string[];
}

export interface StrategyAnalyzer { name: string; analyze(context: StrategyContext): StrategyResult; }
