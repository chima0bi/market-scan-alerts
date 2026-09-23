export interface RiskCalculation {
  maximumAccountLoss: number;
  riskDistance: number;
  positionSize: number;
  positionNotional: number;
  potentialProfit: number;
  riskReward: number;
  marginAtLeverage?: number;
}

export function calculateRisk(accountBalance: number, riskPercent: number, entry: number, stopLoss: number, takeProfit: number, leverage?: number): RiskCalculation {
  if (accountBalance <= 0 || riskPercent <= 0 || riskPercent > 100) throw new Error('Account balance and risk percent must be positive; risk percent must be <= 100');
  const riskDistance = Math.abs(entry - stopLoss);
  if (riskDistance === 0 || entry <= 0 || takeProfit <= 0) throw new Error('Entry, stop loss, and take profit must be valid and stop loss must differ from entry');
  const maximumAccountLoss = accountBalance * riskPercent / 100;
  const positionSize = maximumAccountLoss / riskDistance;
  const positionNotional = positionSize * entry;
  const potentialProfit = positionSize * Math.abs(takeProfit - entry);
  return { maximumAccountLoss, riskDistance, positionSize, positionNotional, potentialProfit, riskReward: potentialProfit / maximumAccountLoss, ...(leverage && leverage > 0 ? { marginAtLeverage: positionNotional / leverage } : {}) };
}
