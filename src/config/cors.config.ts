import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

type EnvLike = Pick<NodeJS.ProcessEnv, 'DASHBOARD_ORIGIN' | 'REPLAY_ALLOWED_ORIGINS'>;

export function createCorsOptions(env: EnvLike = process.env): CorsOptions {
  const allowedOrigins = new Set([
    ...parseOriginList(env.DASHBOARD_ORIGIN),
    ...parseOriginList(env.REPLAY_ALLOWED_ORIGINS),
  ]);

  return {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'), false);
    },
  };
}

export function parseOriginList(value?: string) {
  return (
    value
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}
