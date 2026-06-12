import {
  Injectable,
  UnauthorizedException,
  GatewayTimeoutException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DB_TIMEOUT_MS = 5000;

export interface ValidatedTenant {
  id: string;
  slug: string;
}

@Injectable()
export class TenantGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(
    publicKey: string,
    origin: string | undefined,
  ): Promise<ValidatedTenant> {
    const query = this.prisma.apiKey.findUnique({
      where: { publicKey },
      include: { tenant: true },
    });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>(
      (_, reject) =>
        (timeoutId = setTimeout(
          () => reject(new GatewayTimeoutException('DB query timeout')),
          DB_TIMEOUT_MS,
        )),
    );
    const apiKey = await Promise.race([query, timeout]).finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid public_key');
    }

    if (apiKey.allowedOrigins.length > 0) {
      if (!origin || !apiKey.allowedOrigins.includes(origin)) {
        throw new UnauthorizedException('Origin not allowed');
      }
    }

    return {
      id: apiKey.tenant.id,
      slug: apiKey.tenant.slug,
    };
  }
}
