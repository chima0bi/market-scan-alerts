import WebSocket from 'ws';
import type { Logger } from '../logger.js';
import type { Candle, Interval } from '../types/market.js';

export class BybitMarketStore {
  private socket: WebSocket | undefined;
  private stopped = true;
  private retry = 0;
  private readonly candles = new Map<string, Candle>();
  constructor(private readonly url: string, private readonly logger: Logger) {}
  start(symbols: string[], intervals: Interval[]) { this.stopped = false; this.connect(symbols, intervals); }
  stop() { this.stopped = true; this.socket?.close(); this.socket = undefined; }
  getLatest(symbol: string, interval: Interval) { return this.candles.get(`${symbol}:${interval}`); }
  private connect(symbols: string[], intervals: Interval[]) {
    if (this.stopped) return;
    const socket = new WebSocket(this.url); this.socket = socket;
    socket.on('open', () => { this.retry = 0; this.logger.info('Bybit WebSocket connected'); socket.send(JSON.stringify({ op: 'subscribe', args: intervals.map((interval) => `kline.${interval}.${symbols[0]}`) })); });
    socket.on('message', (raw) => this.handleMessage(raw.toString()));
    socket.on('error', (error) => this.logger.error('Bybit WebSocket error', { error: error.message }));
    socket.on('close', () => { this.logger.warn('Bybit WebSocket disconnected'); if (!this.stopped) { const delay = Math.min(30000, 1000 * 2 ** this.retry++); setTimeout(() => this.connect(symbols, intervals), delay); } });
  }
  private handleMessage(raw: string) {
    try {
      const message = JSON.parse(raw) as { topic?: string; data?: Array<Record<string, string | boolean>> };
      if (!message.topic?.startsWith('kline.') || !message.data?.[0]) return;
      const [, interval, symbol] = message.topic.split('.'); const item = message.data[0];
      if (!interval || !symbol) return;
      this.candles.set(`${symbol}:${interval}`, { timestamp: Number(item.start), open: Number(item.open), high: Number(item.high), low: Number(item.low), close: Number(item.close), volume: Number(item.volume), turnover: Number(item.turnover), closed: Boolean(item.confirm) });
    } catch (error) { this.logger.warn('Malformed Bybit WebSocket message', { error: error instanceof Error ? error.message : 'unknown' }); }
  }
}
