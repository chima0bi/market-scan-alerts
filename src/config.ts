import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MCP_SERVER_NAME: z.string().min(1).default('crypto-market-mcp'),
  BYBIT_TESTNET: z.coerce.boolean().default(false),
  BYBIT_BASE_URL: z.string().url().default('https://api.bybit.com'),
  TRADINGVIEW_WEBHOOK_SECRET: z.string().min(8).default('change_me'),
  DEFAULT_SYMBOL: z.string().regex(/^[A-Z0-9]+$/).default('NEARUSDT'),
  DEFAULT_CATEGORY: z.enum(['spot', 'linear', 'inverse', 'option']).default('linear'),
  HTTP_HOST: z.string().default('127.0.0.1'),
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  STALE_DATA_THRESHOLD_MS: z.coerce.number().int().positive().default(30000),
  ALERT_RETENTION: z.coerce.number().int().positive().max(10000).default(100),
});

export type Config = z.infer<typeof envSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config { return envSchema.parse(env); }
