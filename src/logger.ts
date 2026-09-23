import type { Config } from './config.js';

export function createLogger(config: Config) {
  const write = (level: string, message: string, context?: Record<string, unknown>) => {
    const payload = { timestamp: new Date().toISOString(), level, message, ...context };
    const output = JSON.stringify(payload);
    console.error(output);
  };
  return { debug: (message: string, context?: Record<string, unknown>) => config.LOG_LEVEL === 'debug' && write('debug', message, context), info: (message: string, context?: Record<string, unknown>) => write('info', message, context), warn: (message: string, context?: Record<string, unknown>) => write('warn', message, context), error: (message: string, context?: Record<string, unknown>) => write('error', message, context) };
}
export type Logger = ReturnType<typeof createLogger>;
