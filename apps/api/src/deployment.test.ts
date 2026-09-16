import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('production deployment contract', () => {
  it('exposes a production start command for the compiled API', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.start).toBe('node dist/server.js');
  });

  it('declares Railway build, start, and healthcheck settings', () => {
    const railwayConfig = readFileSync(
      new URL('../../../railway.toml', import.meta.url),
      'utf8',
    );

    expect(railwayConfig).toContain('buildCommand = "npm ci && npm run build"');
    expect(railwayConfig).toContain(
      'startCommand = "npm run start --workspace @caneca-facil/api"',
    );
    expect(railwayConfig).toContain('healthcheckPath = "/health"');
  });
});
