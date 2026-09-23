import type { Direction } from '../types/analysis.js';

export interface TradingViewAlert { timestamp: number; symbol: string; timeframe: string; event: string; direction?: Direction; price?: number; level?: string; metadata?: Record<string, unknown>; }
export class AlertStore {
  private readonly alerts: TradingViewAlert[] = [];
  constructor(private readonly retention: number) {}
  add(alert: TradingViewAlert) { this.alerts.push(alert); while (this.alerts.length > this.retention) this.alerts.shift(); }
  list(symbol?: string) { return this.alerts.filter((alert) => !symbol || alert.symbol === symbol); }
}
