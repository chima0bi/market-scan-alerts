export const categories = ['spot', 'linear', 'inverse', 'option'] as const;
export type Category = (typeof categories)[number];

export const intervals = ['1', '3', '5', '15', '30', '60', '120', '240', '360', '720', 'D', 'W'] as const;
export type Interval = (typeof intervals)[number];

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover?: number;
  closed: boolean;
}

export interface DataFreshness {
  dataTimestamp: number;
  source: 'bybit-rest' | 'bybit-websocket' | 'tradingview';
  stale: boolean;
  candleStatus?: 'closed' | 'unfinished' | 'not-applicable';
}

export interface Ticker {
  symbol: string;
  lastPrice: number;
  bid?: number;
  ask?: number;
  change24hPercent?: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  turnover24h?: number;
  fundingRate?: number;
  nextFundingTime?: number;
  openInterest?: number;
  timestamp: number;
  freshness: DataFreshness;
}

export interface OrderBookLevel { price: number; size: number; }
export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  updateId?: number;
  freshness: DataFreshness;
}

export interface RecentTrade {
  symbol: string;
  price: number;
  size: number;
  side: 'Buy' | 'Sell';
  timestamp: number;
}

export interface FundingRate {
  symbol: string;
  fundingRate: number;
  fundingTimestamp: number;
  nextFundingTime?: number;
  freshness: DataFreshness;
}

export interface OpenInterestPoint {
  symbol: string;
  openInterest: number;
  timestamp: number;
}

export interface MarketDataProvider {
  getTicker(symbol: string, category: Category): Promise<Ticker>;
  getKlines(symbol: string, category: Category, interval: Interval, limit: number): Promise<Candle[]>;
  getOrderbook(symbol: string, category: Category, depth: number): Promise<OrderBook>;
  getRecentTrades(symbol: string, category: Category, limit: number): Promise<RecentTrade[]>;
  getFundingRate(symbol: string, category: Category): Promise<FundingRate>;
  getOpenInterest(symbol: string, category: Category, interval: string, limit: number): Promise<OpenInterestPoint[]>;
}
