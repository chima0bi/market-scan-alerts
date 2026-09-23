import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Logger } from '../logger.js';
import type { Candidate } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MASTER_PROMPT = readFileSync(join(__dirname, 'master_prompt.md'), 'utf-8');

export interface SynthesisVerdict {
  alert_worthy: boolean;
  direction: 'long' | 'short' | 'none';
  confidence_note: 'STRONG' | 'MODERATE' | 'WEAK';
  independent_confirmations: string[];
  duplicated_evidence_removed: string[];
  conflicts: string[];
  key_levels: { support: number | null; resistance: number | null; invalidation: number | null };
  one_line_summary: string;
  what_would_strengthen_this?: string;
}

/**
 * Sends a scored candidate to the master-prompt review layer. This is a
 * SECOND filter on top of the rule-based scorer (architecture.md §2.7),
 * not a replacement for it — the scorer already enforced confirmed-only,
 * cross-timeframe, non-duplicated evidence; this step reasons about
 * *these specific candidates* before anything reaches a human.
 *
 * Returns null (never alert-worthy) on any API error — a synthesis
 * failure must never fail open into an alert.
 */
export async function reviewCandidate(
  candidate: Candidate,
  model: string,
  logger: Logger,
): Promise<SynthesisVerdict | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('LLM synthesis skipped: ANTHROPIC_API_KEY not set', { pair: candidate.pair });
    return null;
  }

  const payload = {
    pair: candidate.pair,
    direction_from_rule_based_scorer: candidate.direction,
    rule_based_score: candidate.score,
    confirming_timeframes: candidate.confirmingTimeframes,
    conflicting_timeframes: candidate.conflictingTimeframes,
    duplicated_evidence_already_collapsed_by_scorer: candidate.duplicatedEvidenceRemoved,
    raw_strategy_output_per_timeframe: candidate.raw,
  };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: MASTER_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
    });

    if (!response.ok) {
      logger.error('LLM synthesis request failed', { pair: candidate.pair, status: response.status });
      return null;
    }

    const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
    const text = data.content
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text)
      .join('\n')
      .trim();

    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    return JSON.parse(cleaned) as SynthesisVerdict;
  } catch (error) {
    logger.error('LLM synthesis error', { pair: candidate.pair, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}
