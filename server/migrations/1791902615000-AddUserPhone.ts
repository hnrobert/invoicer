import { type MigrationInterface, type QueryRunner } from "typeorm";

/**
 * Contact phone (联系电话) on the Better Auth `user` table — editable from
 * Settings → Profile, consumed by the claim-form export. Hand-written because
 * the user table is managed by Better Auth (no TypeORM entity to diff against
 * for `migration:generate`).
 */
export class AddUserPhone1791902615000 implements MigrationInterface {
  name = "AddUserPhone1791902615000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "user" ADD COLUMN "phone" text');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "user" DROP COLUMN IF EXISTS "phone"');
  }
}
