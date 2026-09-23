import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AlertStore } from './alerts.js';
import type { Logger } from '../logger.js';

const alertSchema = z.object({ secret: z.string(), symbol: z.string().regex(/^[A-Z0-9]+$/), timeframe: z.string().min(1), event: z.string().min(1), direction: z.enum(['bullish', 'bearish']).optional(), price: z.number().positive().optional(), level: z.string().optional(), timestamp: z.number().int().positive().optional(), metadata: z.record(z.string(), z.unknown()).optional() });
export function tradingViewWebhook(secret: string, store: AlertStore, logger: Logger) {
  return (request: Request, response: Response) => {
    const parsed = alertSchema.safeParse(request.body);
    if (!parsed.success || parsed.data.secret !== secret) { response.status(401).json({ error: 'Invalid webhook credentials or payload' }); return; }
    const payload = parsed.data;
    store.add({ symbol: payload.symbol, timeframe: payload.timeframe, event: payload.event, timestamp: payload.timestamp ?? Date.now(), ...(payload.direction ? { direction: payload.direction } : {}), ...(payload.price !== undefined ? { price: payload.price } : {}), ...(payload.level ? { level: payload.level } : {}), ...(payload.metadata ? { metadata: payload.metadata } : {}) });
    logger.info('TradingView alert accepted', { symbol: payload.symbol, event: payload.event });
    response.status(202).json({ accepted: true });
  };
}
