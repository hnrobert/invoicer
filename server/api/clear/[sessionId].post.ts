import { unlink } from 'node:fs/promises'
import { AppDataSource } from '#server/utils/database'
import { Invoice } from '#server/entities/invoice.entity'

/** Remove all uploaded files + records in a session, keeping the session itself. */
export default defineEventHandler(async (event) => {
  const sessionId = Number(getRouterParam(event, 'sessionId'))
  const repo = AppDataSource.getRepository(Invoice)
  const rows = await repo.find({ where: { sessionId } })
  for (const r of rows) await unlink(r.savedPath).catch(() => {})
  await repo.delete({ sessionId })
  return { ok: true, msg: '已清除上传文件' }
})
