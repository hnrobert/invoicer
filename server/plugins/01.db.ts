import { initDataSource } from "#server/utils/database";

// Boots the TypeORM DataSource before any API route runs. The `01.` prefix
// orders this ahead of other plugins (Nitro runs plugins in filename order).
export default defineNitroPlugin(async () => {
  await initDataSource();
});
