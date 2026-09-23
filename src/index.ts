import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { BybitMarketClient } from './bybit/rest.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createMcpServer } from './server.js';
import { startHttpServer } from './http.js';

const config = loadConfig();
const logger = createLogger(config);
const client = new BybitMarketClient(config.BYBIT_BASE_URL, config.STALE_DATA_THRESHOLD_MS, logger);
const mcpServer = createMcpServer(client, config, logger);
const http = startHttpServer(config, logger);
const transport = new StdioServerTransport();

const shutdown = async (signal: string) => { logger.info('Shutdown requested', { signal }); http.server.close(); await mcpServer.close(); process.exit(0); };
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
await mcpServer.connect(transport);
logger.info('MCP server connected over stdio');
