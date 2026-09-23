# Crypto Market Intelligence MCP

An analysis-only Model Context Protocol server for Bybit V5 public market data, deterministic market-structure calculations, TradingView alerts, and transparent strategy condition reporting. It never places orders, changes leverage, withdraws funds, or accesses private account endpoints.

## Architecture

`Claude -> MCP stdio -> tool layer -> normalized Bybit REST / analysis engine`; TradingView sends authenticated alerts to `POST /webhook/tradingview`. Analysis functions accept candles directly, so they can later be reused for backtests or other exchanges.

## Requirements and setup

Current Node.js LTS (22+ recommended) and PowerShell:

```powershell
Copy-Item .env.example .env
npm install
npm run build
npm test
npm run lint
npm run dev
```

The server reads public Bybit endpoints from `BYBIT_BASE_URL`; no API key is required. Keep `HTTP_HOST=127.0.0.1` unless a secured reverse proxy/tunnel provides HTTPS and access control. The default symbol is `NEARUSDT` for your usual altcoin workflow, but you can change it any time in `.env`.

## Configuration

See `.env.example`. `TRADINGVIEW_WEBHOOK_SECRET` must be at least 8 characters. Kline responses are reverse-ordered by Bybit and are normalized into chronological candles. The latest candle is marked `closed: false` until its interval has elapsed; no structure calculation should treat it as confirmed.

## MCP clients

For Claude Code, use its current MCP configuration mechanism and register the stdio command as `npm run dev` from this project directory. VS Code also includes `.vscode/mcp.json` with the same stdio command. Confirm the exact client-specific configuration location against the client documentation because Claude Desktop and Claude Code use different configuration surfaces.

Available tools: `get_current_price`, `get_ohlcv`, `get_multi_timeframe_data`, `get_orderbook`, `get_recent_trades`, `get_funding_rate`, `get_open_interest`, `get_market_summary`, `analyze_structure`, `analyze_strategies`, `get_trade_signal`, and `calculate_risk`. `get_trade_signal` runs the strategy registry and structure analysis across multiple timeframes, ignores unfinished candles, and returns only a conservative `LONG`, `SHORT`, or `WAIT` result with entry zone, invalidation, targets, evidence, and missing confirmations. It never places orders.

## TradingView webhook

Configure TradingView's alert webhook URL as `http://127.0.0.1:8787/webhook/tradingview` only when TradingView can reach the host; otherwise use an HTTPS reverse proxy, Cloudflare Tunnel, or ngrok. Example JSON:

```json
{"secret":"replace-with-your-secret","symbol":"BTCUSDT","timeframe":"15m","event":"liquidity_sweep","direction":"bullish","price":112450,"level":"previous_day_low","timestamp":1789900000}
```

The endpoint has a 32 KB body limit, rate limit, schema validation, secret validation, and bounded in-memory retention. Invalid secrets return 401.

## Analysis assumptions

- Swings are confirmed pivots requiring `lookback` candles on both sides.
- FVGs use a three-candle gap and a configurable minimum size; later wicks determine filled status.
- Liquidity labels mean candidate price levels, not proven psychological liquidity.
- Sweeps require a trade beyond a candidate level; a close back inside is a confirmed rejection, otherwise it is classified as a breakout.
- Displacement requires configurable body-to-ATR and range-to-ATR thresholds.
- ICT, CRT, and Turtle Soup outputs list conditions independently and return `NO VALID SETUP` when required conditions are incomplete.
- Risk sizing is deterministic; leverage changes required margin, not the underlying loss risk.
- The strategy registry also records price-action families such as doji, hammer/pin bar, shooting star, engulfing, double/triple tops and bottoms, head-and-shoulders candidates, and triangle candidates.
- ICT-style concept families are treated as observations: FVG, liquidity grabs/sweeps, BOS, CHoCH/MSS, premium/discount, order-block candidates, breaker/inversion-FVG candidates, propulsion blocks, BPR, CSD, breakaway gaps, and supply/demand zones. These labels require explicit detection evidence before they can affect a setup.
- SMT divergence is not asserted from one symbol. It requires synchronized data for a second correlated market, such as an index or related asset; the current public-data tool reports it as unconfirmed.

## Recommended workflow

Use `get_market_summary`, then `get_multi_timeframe_data` for `D`, `240`, `60`, `15`, and `5`. Inspect the compact structure and detected-pattern summaries first. Call `get_ohlcv` only when a narrower candle sample is needed. Then inspect candidate liquidity, sweeps, displacement, FVGs, derivatives context, and strategy conditions independently. Report evidence, conflicts, missing confirmations, and explicitly say `NO TRADE / WAIT` when a complete setup is absent.

## Automated multi-pair scanner (`npm run scan`)

`src/scanner/` wires the analysis engine above into the unattended watchlist
scanner described in `architecture.md`: it polls a configurable set of pairs
and timeframes on a cycle, scores confluence with the same rules you'd apply
manually (confirmed setups only, cross-timeframe agreement required,
duplicated evidence collapsed to one point per timeframe), optionally sends
surviving candidates through `master_prompt.md` as a second review layer via
the Anthropic API, and dispatches alerts to the console, `alert_log.jsonl`,
and (if configured) Telegram. **It only alerts — it never places orders.**

```powershell
Copy-Item .env.example .env   # add ANTHROPIC_API_KEY / TELEGRAM_* if you want them
npm install
npm run build
npm test
npm run scan          # dev mode (tsx), or: npm run build && npm run scan:start
```

- **Watchlist & tuning**: `scanner_config.json` is created on first run with a
  ten-pair default (`BTCUSDT, ETHUSDT, XRPUSDT, AVAXUSDT, ADAUSDT, SOLUSDT,
  LINKUSDT, DOGEUSDT, DOTUSDT, NEARUSDT`) across `D/240/60/15/5`. Edit pairs,
  timeframes, `cycleSeconds`, `cooldownMinutes`, and `minConfluenceScore`
  there — no code changes needed. Per architecture.md, treat the default
  threshold as a starting point to backtest, not a trustworthy live setting.
- **LLM synthesis is on by default** (`useLlmSynthesis: true`) and requires
  `ANTHROPIC_API_KEY`; set it to `false` to run on the rule-based scorer
  alone. A synthesis failure never fails open into an alert.
- **Telegram is optional** — set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
  to receive alerts there in addition to the console and `alert_log.jsonl`
  (the latter is written for every reviewed candidate, alert-worthy or not,
  as backtest data for tuning the scorer per architecture.md §2.8).
- `src/analysis/context.ts` is the single StrategyContext builder shared by
  the `analyze_strategies` MCP tool and the scanner, so the two never drift.
- Run `npm run scan` and the interactive MCP server (`npm run dev`) as two
  separate processes — the scanner does not go through MCP/stdio at all,
  since it needs to run unattended rather than in response to tool calls.
- The scanner and `get_trade_signal` share the same strategy context and
  confluence rules. A Telegram alert is sent only when a candidate has a
  closed-candle directional trigger, an unmitigated entry zone, an
  invalidation level, and at least one opposing confirmed swing target.

## Hosted scanner service

For a host that requires an HTTP service, the combined entry point runs the
HTTP health/webhook server and the scanner in one process:

```powershell
npm run build
npm run hosted:start
```

Set `HTTP_HOST=0.0.0.0` and `HTTP_PORT` to the host-provided port (Render
provides `PORT`) when configuring another platform. Render automatically uses
`0.0.0.0` and `PORT` when its `RENDER` environment variable is present. The
health check is `GET /health`; use `npm run hosted:start` as the Render start
command after `npm run build`.

## Limitations and future work

Definitions are heuristic and can create false positives. Public data can be delayed or stale, and TradingView alerts are user-supplied events rather than exchange truth. No strategy guarantees profitability. Version 1 has no execution capability. Future adapters can implement Binance, OKX, Coinbase, or Hyperliquid behind `MarketDataProvider`; persistence, backtesting, dashboards, and notifications can be added without coupling them to the MCP tools.
