/**
 * First administrator for a new installation, or a way back in when every
 * administrator is locked out.
 *
 *   node dist/apps/api/src/cli/create-admin.js \
 *     --organization "City General Hospital" \
 *     --email admin@citygeneral.example --first Asha --last Rao
 *
 *   ... --email admin@citygeneral.example --reset   (new one-time password)
 *
 * Prints a one-time password; the person chooses their own at first sign-in.
 */
import { PrismaClient } from '@prisma/client';

import { hashPassword } from '@biotrakr/utils';

import { temporaryPassword } from '../admin/admin.service';

type Args = Record<string, string | true>;

export function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key.slice(2)] = true;
    } else {
      args[key.slice(2)] = next;
      i++;
    }
  }
  return args;
}

const text = (args: Args, key: string): string | undefined => {
  const v = args[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createAdmin(
  prisma: PrismaClient,
  args: Args,
): Promise<{ email: string; password: string; created: boolean }> {
  const email = text(args, 'email')?.toLowerCase();
  if (!email || !EMAIL.test(email)) {
    throw new Error('Give --email with a valid work email');
  }
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });
  const password = temporaryPassword();

  if (existing) {
    if (!args.reset) {
      throw new Error(
        `${email} already exists. Add --reset to give it a new one-time password.`,
      );
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: await hashPassword(password),
          passwordChangeRequired: true,
          failedLoginAttempts: 0,
          accountLockedUntil: null,
          isActive: true,
          role: 'admin',
        },
      }),
      prisma.authSession.updateMany({
        where: { userId: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' },
      }),
    ]);
    return { email, password, created: false };
  }

  const first = text(args, 'first');
  const last = text(args, 'last');
  if (!first || !last) throw new Error('Give --first and --last names');

  const organizations = await prisma.organization.findMany({
    select: { id: true, name: true },
    take: 2,
  });
  const orgName = text(args, 'organization');
  let organizationId: string;
  if (orgName) {
    const found = await prisma.organization.findFirst({
      where: { name: { equals: orgName, mode: 'insensitive' } },
      select: { id: true },
    });
    organizationId =
      found?.id ??
      (
        await prisma.organization.create({
          data: { name: orgName, type: 'hospital' },
          select: { id: true },
        })
      ).id;
  } else if (organizations.length === 1) {
    organizationId = organizations[0].id;
  } else {
    throw new Error(
      organizations.length === 0
        ? 'New installation: give --organization "Your hospital name"'
        : 'There are several organizations: say which with --organization',
    );
  }

  await prisma.user.create({
    data: {
      organizationId,
      email,
      username: email,
      firstName: first,
      lastName: last,
      role: 'admin',
      jobTitle: 'Administrator',
      passwordHash: await hashPassword(password),
      passwordChangeRequired: true,
    },
  });
  return { email, password, created: true };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await createAdmin(prisma, parseArgs(process.argv.slice(2)));
    console.log(
      [
        '',
        result.created
          ? `Administrator created: ${result.email}`
          : `New one-time password for ${result.email} (signed out everywhere)`,
        `One-time password: ${result.password}`,
        '',
        'Sign in with it in the browser; you will be asked to choose your own.',
        'It is not stored anywhere: copy it now.',
        '',
      ].join('\n'),
    );
  } catch (error) {
    console.error(`\n${(error as Error).message}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
