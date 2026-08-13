import { getMailConfig, mailConfigToClient } from '#server/utils/mail'

export default defineEventHandler(async () => {
  return { ok: true, config: mailConfigToClient(await getMailConfig()) }
})
