import {
  Injectable,
  UnauthorizedException,
  GatewayTimeoutException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DB_TIMEOUT_MS = 5000;

@Injectable()
export class TenantGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(
    tenantId: string,
    publicKey: string,
    origin: string | undefined,
  ): Promise<string> {
    const query = this.prisma.apiKey.findFirst({
      where: { publicKey, tenant: { slug: tenantId } },
      include: { tenant: true },
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new GatewayTimeoutException('DB query timeout')),
        DB_TIMEOUT_MS,
      ),
    );
    const apiKey = await Promise.race([query, timeout]);

    if (!apiKey) {
      throw new UnauthorizedException('Invalid tenant_id or public_key');
    }

    if (origin && apiKey.allowedOrigins.length > 0) {
      const allowed = apiKey.allowedOrigins.some((o) => o === origin);
      if (!allowed) {
        throw new UnauthorizedException(`Origin not allowed: ${origin}`);
      }
    }

    return apiKey.tenant.id;
  }
}
