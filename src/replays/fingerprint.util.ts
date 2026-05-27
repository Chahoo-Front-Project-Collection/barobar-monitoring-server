import * as crypto from 'crypto';

export function buildFingerprint(params: {
  tenantId: string;
  errorName: string;
  requestUrl: string;
  statusCode: number;
}): string {
  const raw = [params.tenantId, params.errorName, params.requestUrl, String(params.statusCode)].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}
