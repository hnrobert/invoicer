import { Column, Entity, PrimaryColumn } from "typeorm";

/** Generic site-wide key/value store (JSON value under a dotted text key). */
@Entity({ name: "app_settings" })
export class AppSetting {
  @PrimaryColumn({ type: "text", primaryKeyConstraintName: "pk_app_settings" })
  key!: string;

  @Column({ type: "text", nullable: false, default: "{}" })
  value!: string;
}
