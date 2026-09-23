import { appendFileSync } from 'node:fs';
import type { Logger } from '../logger.js';
import type { Candidate } from './types.js';
import type { SynthesisVerdict } from './llmSynthesis.js';
import type { TradeSignal } from '../analysis/tradeSignal.js';

const ALERT_LOG_PATH = 'alert_log.jsonl';

/**
 * Every candidate that reaches this point is logged (even ones later
 * suppressed) — that log is the backtest data for tuning the scorer,
 * per architecture.md §2.8.
 */
export async function dispatchCandidate(
  candidate: Candidate,
  verdict: SynthesisVerdict | null,
  logger: Logger,
  signal: TradeSignal,
): Promise<void> {
  const alertWorthy = verdict ? verdict.alert_worthy : true; // no LLM configured -> rule-based score alone decides
  const record = {
    ts: new Date().toISOString(),
    pair: candidate.pair,
    direction: candidate.direction,
    ruleBasedScore: candidate.score,
    confirmingTimeframes: candidate.confirmingTimeframes.map((c) => c.timeframe),
    alertWorthy,
    verdict,
    signal,
  };

  appendFileSync(ALERT_LOG_PATH, JSON.stringify(record) + '\n');

  if (!alertWorthy) {
    logger.info('Candidate reviewed but not alert-worthy', {
      pair: candidate.pair,
      direction: candidate.direction,
      reason: verdict?.one_line_summary ?? verdict?.what_would_strengthen_this,
    });
    return;
  }

  const summary = verdict?.one_line_summary
    ?? `${signal.decision} ${candidate.pair} @ ${signal.currentPrice} | entry ${signal.entryZone?.low}-${signal.entryZone?.high} | invalidation ${signal.invalidation} | targets ${signal.targets.join(', ')}`;

  logger.info('ALERT', { pair: candidate.pair, direction: candidate.direction, summary, confidence: verdict?.confidence_note });

  await sendTelegram(summary, verdict, signal);
}

async function sendTelegram(summary: string, verdict: SynthesisVerdict | null, signal: TradeSignal): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return; // Telegram is optional; console + log always fire above.

  const lines = [summary];
  if (verdict?.key_levels) {
    const { support, resistance, invalidation } = verdict.key_levels;
    lines.push(`support=${support ?? '—'} resistance=${resistance ?? '—'} invalidation=${invalidation ?? '—'}`);
  }
  if (verdict?.conflicts?.length) lines.push(`conflicts: ${verdict.conflicts.join('; ')}`);
  lines.push(`entry=${signal.entryZone?.low}-${signal.entryZone?.high} invalidation=${signal.invalidation} targets=${signal.targets.join(', ')}`);

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n') }),
    });
  } catch {
    // Telegram delivery failing must never crash the scan loop — it's
    // already logged to console + alert_log.jsonl above.
  }
}
