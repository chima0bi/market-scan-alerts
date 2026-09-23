import express from 'express';
import rateLimit from 'express-rate-limit';
import type { Server } from 'node:http';
import type { Config } from './config.js';
import type { Logger } from './logger.js';
import { AlertStore } from './tradingview/alerts.js';
import { tradingViewWebhook } from './tradingview/webhook.js';

export function startHttpServer(config: Config, logger: Logger): { server: Server; alerts: AlertStore } {
  const app = express();
  const alerts = new AlertStore(config.ALERT_RETENTION);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error && (error as { status?: number }).status === 400) {
      response.status(400).json({ error: 'Malformed JSON payload' });
      return;
    }
    logger.error('HTTP request error', { error: error instanceof Error ? error.message : String(error) });
    response.status(500).json({ error: 'Internal server error' });
    void next;
  });

  app.get('/health', (_request, response) => response.json({ ok: true }));
  app.post(
    '/webhook/tradingview',
    rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }),
    tradingViewWebhook(config.TRADINGVIEW_WEBHOOK_SECRET, alerts, logger),
  );

  const server = app.listen(config.HTTP_PORT, config.HTTP_HOST, () =>
    logger.info('HTTP server listening', { host: config.HTTP_HOST, port: config.HTTP_PORT }),
  );

  return { server, alerts };
}
