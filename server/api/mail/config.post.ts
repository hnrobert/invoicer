import {
  saveMailConfig,
  mailConfigToClient,
  type MailConfigInput,
} from "#server/utils/mail";

export default defineEventHandler(async (event) => {
  const body = await readBody<MailConfigInput>(event);
  const saved = await saveMailConfig(body ?? {});
  return { ok: true, config: mailConfigToClient(saved) };
});
