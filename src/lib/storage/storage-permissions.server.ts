import { getSql } from '@/lib/db';

export async function assertPlatformAdmin(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ auth_user_id: string }>`
    select auth_user_id
    from platform_admins
    where auth_user_id = ${userId}
    limit 1
  `;

  if (!rows.length) throw new Error('FORBIDDEN');
  return sql;
}
