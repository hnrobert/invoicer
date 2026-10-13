import { type MigrationInterface, type QueryRunner } from "typeorm";

/**
 * Real-name (姓名) on the Better Auth `user` table, separate from the
 * username chosen at sign-up. Grouped with the contact phone under Settings
 * → Profile; the claim-form export's Applicant uses it (falls back to the
 * username). Hand-written — the user table is Better Auth-managed (no
 * TypeORM entity for migration:generate to diff).
 */
export class AddUserDisplayName1791988800000 implements MigrationInterface {
  name = "AddUserDisplayName1791988800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "user" ADD COLUMN "displayName" text');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user" DROP COLUMN IF EXISTS "displayName"',
    );
  }
}
