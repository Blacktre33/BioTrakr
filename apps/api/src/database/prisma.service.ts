import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async cleanDatabase(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean database in production!');
    }

    // Fetch all public tables so we can issue a single TRUNCATE while skipping
    // Prisma bookkeeping tables. Using raw SQL avoids relying on the Prisma
    // client type system for dynamic model lookups, which keeps the build step
    // free from `deleteMany` index access errors.
    const records = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `;

    const tables = records
      .map(({ tablename }) => tablename)
      .filter((name) => name !== '_prisma_migrations');

    if (!tables.length) {
      return;
    }

    const formattedTableList = tables.map((name) => `"${name}"`).join(', ');
    await this.$executeRawUnsafe(
      `TRUNCATE TABLE ${formattedTableList} RESTART IDENTITY CASCADE;`,
    );
  }
}
