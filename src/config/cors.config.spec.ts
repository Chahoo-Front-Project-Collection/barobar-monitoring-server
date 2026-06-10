import { createCorsOptions, parseOriginList } from './cors.config';

describe('parseOriginList', () => {
  it('splits comma-separated origins and removes blanks', () => {
    expect(parseOriginList('https://a.test, https://b.test,, ')).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });
});

describe('createCorsOptions', () => {
  function checkOrigin(origin: string | undefined) {
    const options = createCorsOptions({
      DASHBOARD_ORIGIN: 'https://dashboard.test',
      REPLAY_ALLOWED_ORIGINS: 'https://service-a.test,https://service-b.test',
    });
    return new Promise<{ error: Error | null; allowed?: boolean }>((resolve) => {
      if (typeof options.origin !== 'function') {
        throw new Error('Expected dynamic CORS origin function');
      }
      options.origin(origin, (error, allowed) => {
        resolve({ error, allowed });
      });
    });
  }

  it('allows the dashboard origin', async () => {
    await expect(checkOrigin('https://dashboard.test')).resolves.toEqual({
      error: null,
      allowed: true,
    });
  });

  it('allows real service frontend origins', async () => {
    await expect(checkOrigin('https://service-b.test')).resolves.toEqual({
      error: null,
      allowed: true,
    });
  });

  it('allows server-to-server requests without an origin header', async () => {
    await expect(checkOrigin(undefined)).resolves.toEqual({
      error: null,
      allowed: true,
    });
  });

  it('rejects unknown browser origins', async () => {
    const result = await checkOrigin('https://evil.test');

    expect(result.allowed).toBe(false);
    expect(result.error?.message).toBe('Origin not allowed by CORS');
  });
});
