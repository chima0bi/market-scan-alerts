import { MarketDataError } from '../errors.js';
import type { Logger } from '../logger.js';
import type { Category, Candle, FundingRate, Interval, MarketDataProvider, OpenInterestPoint, OrderBook, RecentTrade, Ticker } from '../types/market.js';

const intervalMinutes: Record<Interval, number> = { '1': 1, '3': 3, '5': 5, '15': 15, '30': 30, '60': 60, '120': 120, '240': 240, '360': 360, '720': 720, D: 1440, W: 10080 };

type BybitEnvelope<T> = { retCode: number; retMsg: string; result: T; time: number };

export class BybitMarketClient implements MarketDataProvider {
  constructor(private readonly baseUrl: string, private readonly staleThresholdMs: number, private readonly logger: Logger, private readonly fetchImpl: typeof fetch = fetch) {}

  private async request<T>(path: string, params: Record<string, string | number>): Promise<BybitEnvelope<T>> {
    const url = new URL(path, this.baseUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const response = await this.fetchImpl(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new MarketDataError(`Bybit HTTP error ${response.status}`, response.status);
    const body = await response.json() as BybitEnvelope<T>;
    if (body.retCode !== 0) throw new MarketDataError(`Bybit API error: ${body.retMsg}`, response.status, { retCode: body.retCode });
    return body;
  }

  private freshness(timestamp: number, candleStatus?: 'closed' | 'unfinished' | 'not-applicable') {
    return { dataTimestamp: timestamp, source: 'bybit-rest' as const, stale: Date.now() - timestamp > this.staleThresholdMs, ...(candleStatus ? { candleStatus } : {}) };
  }

  async getTicker(symbol: string, category: Category): Promise<Ticker> {
    const response = await this.request<{ list: Array<Record<string, string>> }>('/v5/market/tickers', { category, symbol });
    const raw = response.result.list[0];
    if (!raw || !raw.symbol) throw new MarketDataError(`No ticker returned for ${symbol}`);
    const timestamp = response.time;
    const numberOrUndefined = (value: string | undefined) => value && value !== '' ? Number(value) : undefined;
    const optional = (outputKey: string, rawKey: string) => { const value = numberOrUndefined(raw[rawKey]); return value === undefined ? {} : { [outputKey]: value }; };
    return { symbol: raw.symbol, lastPrice: Number(raw.lastPrice), ...optional('bid', 'bid1Price'), ...optional('ask', 'ask1Price'), ...optional('change24hPercent', 'price24hPcnt'), ...optional('high24h', 'highPrice24h'), ...optional('low24h', 'lowPrice24h'), ...optional('volume24h', 'volume24h'), ...optional('turnover24h', 'turnover24h'), ...optional('fundingRate', 'fundingRate'), ...optional('nextFundingTime', 'nextFundingTime'), ...optional('openInterest', 'openInterest'), timestamp, freshness: this.freshness(timestamp, 'not-applicable') };
  }

  async getKlines(symbol: string, category: Category, interval: Interval, limit: number): Promise<Candle[]> {
    const response = await this.request<{ list: string[][] }>('/v5/market/kline', { category, symbol, interval, limit });
    const now = Date.now(); const duration = intervalMinutes[interval] * 60_000;
    return response.result.list.flatMap((raw) => {
      if (raw.length < 6) return [];
      const timestamp = Number(raw[0]);
      return [{ timestamp, open: Number(raw[1]), high: Number(raw[2]), low: Number(raw[3]), close: Number(raw[4]), volume: Number(raw[5]), ...(raw[6] !== undefined ? { turnover: Number(raw[6]) } : {}), closed: timestamp + duration <= now }];
    }).sort((a, b) => a.timestamp - b.timestamp);
  }

  async getOrderbook(symbol: string, category: Category, depth: number): Promise<OrderBook> {
    const response = await this.request<{ s: string; b: string[][]; a: string[][]; ts: number; u?: number }>('/v5/market/orderbook', { category, symbol, limit: depth });
    const result = response.result;
    return { symbol: result.s, bids: result.b.flatMap(([price, size]) => price !== undefined && size !== undefined ? [{ price: Number(price), size: Number(size) }] : []), asks: result.a.flatMap(([price, size]) => price !== undefined && size !== undefined ? [{ price: Number(price), size: Number(size) }] : []), timestamp: result.ts, ...(result.u !== undefined ? { updateId: result.u } : {}), freshness: this.freshness(result.ts, 'not-applicable') };
  }

  async getRecentTrades(symbol: string, category: Category, limit: number): Promise<RecentTrade[]> {
    const response = await this.request<{ list: Array<{ symbol: string; price: string; size: string; side: 'Buy' | 'Sell'; time: string }> }>('/v5/market/recent-trade', { category, symbol, limit });
    return response.result.list.map((trade) => ({ symbol: trade.symbol, price: Number(trade.price), size: Number(trade.size), side: trade.side, timestamp: Number(trade.time) }));
  }

  async getFundingRate(symbol: string, category: Category): Promise<FundingRate> {
    const ticker = await this.getTicker(symbol, category);
    if (ticker.fundingRate === undefined) throw new MarketDataError(`Funding rate unavailable for ${symbol}`);
    return { symbol, fundingRate: ticker.fundingRate, fundingTimestamp: ticker.timestamp, ...(ticker.nextFundingTime !== undefined ? { nextFundingTime: ticker.nextFundingTime } : {}), freshness: ticker.freshness };
  }

  async getOpenInterest(symbol: string, category: Category, interval: string, limit: number): Promise<OpenInterestPoint[]> {
    const response = await this.request<{ list: Array<{ openInterest: string; timestamp: string }> }>('/v5/market/open-interest', { category, symbol, intervalTime: interval, limit });
    return response.result.list.map((point) => ({ symbol, openInterest: Number(point.openInterest), timestamp: Number(point.timestamp) })).sort((a, b) => a.timestamp - b.timestamp);
  }
}
