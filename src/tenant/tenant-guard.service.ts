import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(tenantId: string, publicKey: string, origin: string | undefined): Promise<string> {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { publicKey, tenant: { slug: tenantId } },
      include: { tenant: true },
    });

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
