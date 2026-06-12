import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantGuardService } from './tenant-guard.service';

describe('TenantGuardService', () => {
  it('returns the tenant matched by public key when origin is allowed', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      allowedOrigins: ['https://service.test'],
      tenant: {
        id: 'tenant_1',
        slug: 'barobar-prod',
      },
    });
    const prisma = {
      apiKey: {
        findUnique,
      },
    } as unknown as PrismaService;
    const service = new TenantGuardService(prisma);

    await expect(
      service.validate('public', 'https://service.test'),
    ).resolves.toEqual({
      id: 'tenant_1',
      slug: 'barobar-prod',
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { publicKey: 'public' },
      include: { tenant: true },
    });
  });

  it('rejects an unknown public key', async () => {
    const prisma = {
      apiKey: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const service = new TenantGuardService(prisma);

    await expect(
      service.validate('unknown', 'https://service.test'),
    ).rejects.toThrow(new UnauthorizedException('Invalid public_key'));
  });

  it('rejects origins outside the public key allowlist', async () => {
    const prisma = {
      apiKey: {
        findUnique: jest.fn().mockResolvedValue({
          allowedOrigins: ['https://service.test'],
          tenant: {
            id: 'tenant_1',
            slug: 'barobar-prod',
          },
        }),
      },
    } as unknown as PrismaService;
    const service = new TenantGuardService(prisma);

    await expect(
      service.validate('public', 'https://unknown.test'),
    ).rejects.toThrow(new UnauthorizedException('Origin not allowed'));
  });
});
