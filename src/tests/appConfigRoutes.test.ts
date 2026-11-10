// The force-update floor can lock every user out of the app, so the thing
// worth pinning down is that it fails OPEN: unset or malformed config must
// serve 0.0.0 rather than an error or a garbage floor.
import Hapi from '@hapi/hapi';
import { appConfigRoutes, resolveMinSupportedVersion } from '../routes/appConfigRoutes';

let server: Hapi.Server;
let logSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeAll(async () => {
  server = Hapi.server({ port: 0 });
  server.route(appConfigRoutes);
  await server.initialize();
});
afterAll(async () => { await server.stop(); });

beforeEach(() => {
  delete process.env.IOS_MIN_SUPPORTED_VERSION;
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('resolveMinSupportedVersion', () => {
  it('serves no floor when unset or blank', () => {
    expect(resolveMinSupportedVersion(undefined)).toBe('0.0.0');
    expect(resolveMinSupportedVersion('')).toBe('0.0.0');
    expect(resolveMinSupportedVersion('   ')).toBe('0.0.0');
  });

  it('passes a well-formed version through, trimmed', () => {
    expect(resolveMinSupportedVersion('6.5.1')).toBe('6.5.1');
    expect(resolveMinSupportedVersion(' 7.0 ')).toBe('7.0');
  });

  it('fails open and logs when malformed', () => {
    expect(resolveMinSupportedVersion('v6.5.1')).toBe('0.0.0');
    expect(resolveMinSupportedVersion('6.5.1-beta')).toBe('0.0.0');
    expect(resolveMinSupportedVersion('latest')).toBe('0.0.0');
    expect(errorSpy).toHaveBeenCalledTimes(3);
  });
});

describe('GET /app-config', () => {
  it('is public and returns the configured floor', async () => {
    process.env.IOS_MIN_SUPPORTED_VERSION = '6.5.0';
    const res = await server.inject({ method: 'GET', url: '/app-config' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ minSupportedVersion: '6.5.0' });
  });

  it('returns no floor when the env var is unset', async () => {
    const res = await server.inject({ method: 'GET', url: '/app-config?version=6.5.1&build=3' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ minSupportedVersion: '0.0.0' });
  });

  it('logs the client version so adoption can be measured', async () => {
    await server.inject({ method: 'GET', url: '/app-config?version=6.5.1&build=3' });
    const line = logSpy.mock.calls
      .map(args => { try { return JSON.parse(args[0]); } catch { return null; } })
      .find(entry => entry?.event === 'app_config_check');
    expect(line).toMatchObject({ clientVersion: '6.5.1', clientBuild: '3', platform: 'ios' });
  });

  const checkLine = () => logSpy.mock.calls
    .map(args => { try { return JSON.parse(args[0]); } catch { return null; } })
    .find(entry => entry?.event === 'app_config_check');

  it.each(['keychain', 'defaults', 'none'])('logs tokenSource=%s so the Keychain rollout can be measured', async (source) => {
    const res = await server.inject({ method: 'GET', url: `/app-config?version=6.6.1&build=1&tokenSource=${source}` });
    expect(res.statusCode).toBe(200);
    expect(checkLine()).toMatchObject({ clientVersion: '6.6.1', tokenSource: source });
  });

  it('logs a null tokenSource for clients that do not send one', async () => {
    const res = await server.inject({ method: 'GET', url: '/app-config?version=6.6.0&build=2' });
    expect(res.statusCode).toBe(200);
    expect(checkLine()).toHaveProperty('tokenSource', null);
  });

  it('rejects an unknown tokenSource instead of logging it', async () => {
    const res = await server.inject({ method: 'GET', url: '/app-config?tokenSource=%3Cscript%3E' });
    expect(res.statusCode).toBe(400);
    expect(checkLine()).toBeUndefined();
  });

  it('rejects a malformed client version instead of logging it', async () => {
    const res = await server.inject({ method: 'GET', url: '/app-config?version=%3Cscript%3E' });
    expect(res.statusCode).toBe(400);
  });
});
