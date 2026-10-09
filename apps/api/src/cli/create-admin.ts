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
 * --reset only works for an administrator. To make someone else an
 * administrator add --make-admin; a deactivated account also needs
 * --reactivate. A new organization name needs --create-organization (so a
 * typo does not create an empty organization).
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
): Promise<{
  email: string;
  password: string;
  created: boolean;
  changes: string[];
}> {
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
    const isAdmin = existing.role.toLowerCase() === 'admin';
    if (!isAdmin && !args['make-admin']) {
      throw new Error(
        `${email} is not an administrator (role: ${existing.role}). Reset their password in Settings > People, or add --make-admin to make them an administrator.`,
      );
    }
    if (!existing.isActive && !args.reactivate) {
      throw new Error(
        `${email} is deactivated. Add --reactivate if they should have access again.`,
      );
    }
    const changes: string[] = [];
    if (!isAdmin) changes.push(`role changed from ${existing.role} to admin`);
    if (!existing.isActive) changes.push('account reactivated');
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: await hashPassword(password),
          passwordChangeRequired: true,
          failedLoginAttempts: 0,
          accountLockedUntil: null,
          ...(existing.isActive ? {} : { isActive: true }),
          ...(isAdmin ? {} : { role: 'admin' }),
        },
      }),
      prisma.authSession.updateMany({
        where: { userId: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' },
      }),
    ]);
    return { email, password, created: false, changes };
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
    if (found) {
      organizationId = found.id;
    } else if (organizations.length === 0 || args['create-organization']) {
      organizationId = (
        await prisma.organization.create({
          data: { name: orgName, type: 'hospital' },
          select: { id: true },
        })
      ).id;
    } else {
      throw new Error(
        `No organization is called "${orgName}" (existing: ${organizations.map((o) => o.name).join(', ')}${organizations.length > 1 ? ', ...' : ''}). Check the spelling, or add --create-organization.`,
      );
    }
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
  return { email, password, created: true, changes: [] };
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
        ...result.changes.map((c) => `Also: ${c}`),
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
