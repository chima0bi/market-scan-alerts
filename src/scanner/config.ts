import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { intervals } from '../types/market.js';
import type { ScannerConfig } from './types.js';

const scannerConfigSchema = z.object({
  // Ten liquid Bybit USDT perps spanning majors + the alts you named
  // (xrp, avax, ada, eth, btc) plus a few more with reliably deep books.
  // Edit freely — this is just a sane starting watchlist, not a recommendation.
  pairs: z.array(z.string().regex(/^[A-Z0-9]+$/)).min(1).max(50).default([
    'BTCUSDT',
    'ETHUSDT',
    'XRPUSDT',
    'AVAXUSDT',
    'ADAUSDT',
    'SOLUSDT',
    'LINKUSDT',
    'DOGEUSDT',
    'DOTUSDT',
    'NEARUSDT',
  ]),
  // Daily bias, 4H/1H structure, 15m/5m trigger — mirrors the manual workflow
  // described in the README's "Recommended workflow" section.
  timeframes: z.array(z.enum(intervals)).min(2).max(8).default(['D', '240', '60', '15', '5']),
  category: z.enum(['spot', 'linear', 'inverse', 'option']).default('linear'),
  candlesPerTimeframe: z.number().int().min(20).max(300).default(120),
  cycleSeconds: z.number().int().min(15).default(2700),
  cooldownMinutes: z.number().int().min(1).default(45),
  // How many DISTINCT timeframes must agree on direction before something
  // is even a candidate. 2 is the architecture.md floor; raise it after
  // you've backtested and it's still firing too often.
  minConfluenceScore: z.number().int().min(2).default(2),
  maxConcurrentPairs: z.number().int().min(1).default(5),
  requestDelaySeconds: z.number().min(0).default(0.25),
  // The rule-based scorer narrows the watchlist down to candidates; this
  // decides whether each candidate is then passed to master_prompt.md for
  // the independence/duplication/conflict review before anything alerts.
  // Requires ANTHROPIC_API_KEY. Defaults on — the rule-based scorer alone
  // is intentionally permissive (see architecture.md §2.7).
  useLlmSynthesis: z.boolean().default(true),
  llmModel: z.string().default('claude-sonnet-4-6'),
});

const CONFIG_PATH = 'scanner_config.json';

export function loadScannerConfig(path: string = CONFIG_PATH): ScannerConfig {
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    return scannerConfigSchema.parse(raw);
  }
  const defaults = scannerConfigSchema.parse({});
  writeFileSync(path, JSON.stringify(defaults, null, 2));
  return defaults;
}
