import { describe, expect, it } from 'vitest';
import { scorePair } from '../src/scanner/scorer.js';
import { StateStore } from '../src/scanner/state.js';
import type { StrategyResult } from '../src/types/strategies.js';
import type { TimeframeResult } from '../src/scanner/types.js';
import { createStrategyContext } from '../src/strategies/registry.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const strategy = (name: string, validSetup: boolean, direction?: 'bullish' | 'bearish'): StrategyResult => ({
  strategy: name,
  validSetup,
  setupStage: validSetup ? 'confirmed_conditions' : 'NO VALID SETUP',
  conditions: {},
  ...(direction ? { direction } : {}),
  evidence: [],
  limitations: [],
});

const tf = (timeframe: TimeframeResult['timeframe'], strategyResults: StrategyResult[]): TimeframeResult => ({
  timeframe,
  latestCandleTimestamp: 0,
  context: createStrategyContext([]),
  strategyResults,
});

describe('scorePair', () => {
  it('produces no candidate when nothing is confirmed', () => {
    const results = [tf('D', [strategy('ICT-inspired', false), strategy('CRT-inspired', true, undefined)])];
    expect(scorePair('BTCUSDT', results, 2)).toEqual([]);
  });

  it('does not treat one timeframe echoing itself as confluence', () => {
    // Two strategies confirm bullish, but only on a single timeframe.
    const results = [tf('15', [strategy('CRT-inspired', true, 'bullish'), strategy('Price-action patterns', true, 'bullish')])];
    expect(scorePair('BTCUSDT', results, 2)).toEqual([]);
  });

  it('collapses multiple confirming strategies on one timeframe into one point of evidence', () => {
    const results = [
      tf('D', [strategy('CRT-inspired', true, 'bullish'), strategy('Price-action patterns', true, 'bullish')]),
      tf('60', [strategy('ICT-inspired', true, 'bullish')]),
    ];
    const candidates = scorePair('BTCUSDT', results, 2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.score).toBe(2); // two DISTINCT timeframes, not three strategy hits
    expect(candidates[0]?.duplicatedEvidenceRemoved).toHaveLength(1);
    expect(candidates[0]?.duplicatedEvidenceRemoved[0]).toContain('D:');
  });

  it('requires the configured minimum number of distinct timeframes', () => {
    const results = [
      tf('D', [strategy('CRT-inspired', true, 'bullish')]),
      tf('60', [strategy('ICT-inspired', true, 'bullish')]),
    ];
    expect(scorePair('BTCUSDT', results, 3)).toEqual([]);
    expect(scorePair('BTCUSDT', results, 2)).toHaveLength(1);
  });

  it('refuses to pick a side when directions tie', () => {
    const results = [
      tf('D', [strategy('CRT-inspired', true, 'bullish')]),
      tf('60', [strategy('ICT-inspired', true, 'bearish')]),
    ];
    expect(scorePair('BTCUSDT', results, 1)).toEqual([]);
  });

  it('reports the losing direction as conflicting evidence when the winner still clears the bar', () => {
    const results = [
      tf('D', [strategy('CRT-inspired', true, 'bullish')]),
      tf('240', [strategy('Price-action patterns', true, 'bullish')]),
      tf('60', [strategy('ICT-inspired', true, 'bearish')]),
    ];
    const candidates = scorePair('BTCUSDT', results, 2);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.direction).toBe('bullish');
    expect(candidates[0]?.conflictingTimeframes).toHaveLength(1);
    expect(candidates[0]?.conflictingTimeframes[0]?.timeframe).toBe('60');
  });
});

describe('StateStore cooldown', () => {
  it('fires once then respects cooldown until it elapses', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'scanner-state-')), 'state.json');
    const state = new StateStore(path);
    expect(state.shouldFire('BTCUSDT', 'bullish', 3600)).toBe(true);
    state.record('BTCUSDT', 'bullish');
    expect(state.shouldFire('BTCUSDT', 'bullish', 3600)).toBe(false);
    expect(state.shouldFire('BTCUSDT', 'bearish', 3600)).toBe(true); // different direction, independent cooldown
  });
});
