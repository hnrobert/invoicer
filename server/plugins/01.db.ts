import { initDataSource } from "#server/utils/database";

// Boots the TypeORM DataSource before any API route runs. The `01.` prefix
// orders this ahead of other plugins (Nitro runs plugins in filename order).
//
// The local deployment's database is a SEPARATE host container
// (invoicer-pg-test) that Docker may start AFTER this app — a hard await
// here would leave the app boot-crashed or degraded until a manual restart.
// Retry with backoff instead: the app comes healthy the moment the database
// answers, whatever the start order.
export default defineNitroPlugin(async () => {
  const deadline = Date.now() + 5 * 60_000;
  for (let attempt = 1; ; attempt++) {
    try {
      await initDataSource();
      return;
    } catch (e) {
      if (Date.now() > deadline) {
        console.error("[db] unreachable after 5 min of retries, giving up");
        throw e;
      }
      console.warn(
        `[db] init attempt ${attempt} failed (${e instanceof Error ? e.message : e}); retrying in 3s`,
      );
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
});
