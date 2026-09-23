import { describe, expect, it } from 'vitest';
import { BybitMarketClient } from '../src/bybit/rest.js';
import type { Logger } from '../src/logger.js';

const logger: Logger = { debug: () => false, info: () => undefined, warn: () => undefined, error: () => undefined };
describe('Bybit normalization', () => {
  it('normalizes reverse-ordered klines chronologically and marks unfinished candle', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ retCode: 0, retMsg: 'OK', time: Date.now(), result: { list: [[String(Date.now()), '101', '102', '100', '101', '4', '404'], [String(Date.now() - 60000), '100', '101', '99', '100', '3', '300']] } }));
    const client = new BybitMarketClient('https://api.bybit.com', 30000, logger, fetchImpl as typeof fetch);
    const candles = await client.getKlines('BTCUSDT', 'linear', '1', 2);
    expect(candles[0]?.open).toBe(100); expect(candles[1]?.closed).toBe(false);
  });
});
