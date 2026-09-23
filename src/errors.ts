export class MarketDataError extends Error {
  constructor(message: string, public readonly statusCode?: number, public readonly details?: unknown) { super(message); this.name = 'MarketDataError'; }
}
