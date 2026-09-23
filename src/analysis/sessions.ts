export interface SessionWindow { name: 'Asia' | 'London' | 'New York'; startUtcHour: number; endUtcHour: number; }
export const defaultSessions: SessionWindow[] = [{ name: 'Asia', startUtcHour: 0, endUtcHour: 8 }, { name: 'London', startUtcHour: 8, endUtcHour: 13 }, { name: 'New York', startUtcHour: 13, endUtcHour: 21 }];
export function sessionForUtc(date: Date, sessions = defaultSessions): SessionWindow | undefined { const hour = date.getUTCHours(); return sessions.find((session) => hour >= session.startUtcHour && hour < session.endUtcHour); }
