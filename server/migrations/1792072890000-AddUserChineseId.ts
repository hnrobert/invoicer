import { type MigrationInterface, type QueryRunner } from "typeorm";

/**
 * Chinese ID number (身份证号) on the Better Auth `user` table — editable
 * under Settings → Profile together with the real name / phone; prepayment
 * claims transfer to a BOC account and require it. Better Auth convention:
 * camelCase column; hand-written (Better Auth-managed table).
 */
export class AddUserChineseId1792072890000 implements MigrationInterface {
  name = "AddUserChineseId1792072890000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "user" ADD COLUMN "chineseId" text');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "user" DROP COLUMN IF EXISTS "chineseId"',
    );
  }
}
