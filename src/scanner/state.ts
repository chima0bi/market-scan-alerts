import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Tracks last-alert time per (pair, direction) for cooldown/dedup. */
export class StateStore {
  private data: Record<string, number> = {};

  constructor(private readonly path: string = 'scanner_state.json') {
    if (existsSync(path)) {
      this.data = JSON.parse(readFileSync(path, 'utf-8'));
    }
  }

  private key(pair: string, direction: string): string {
    return `${pair}:${direction}`;
  }

  shouldFire(pair: string, direction: string, cooldownSeconds: number): boolean {
    const last = this.data[this.key(pair, direction)];
    return last === undefined || Date.now() / 1000 - last >= cooldownSeconds;
  }

  record(pair: string, direction: string): void {
    this.data[this.key(pair, direction)] = Date.now() / 1000;
    writeFileSync(this.path, JSON.stringify(this.data, null, 2));
  }
}
