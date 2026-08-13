import { AppDataSource } from '#server/utils/database'
import { ReviewSession } from '#server/entities/reviewSession.entity'

/** Create an audit session: the expected buyer title + tax id to check against. */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: string; tax_id?: string }>(event)
  const title = (body?.title ?? '').trim()
  const taxId = (body?.tax_id ?? '').trim()
  if (!title && !taxId) {
    throw createError({ statusCode: 400, statusMessage: '请至少填写发票抬头或税号' })
  }
  const session = await AppDataSource.getRepository(ReviewSession).save({
    expectedTitle: title,
    expectedTaxId: taxId || null,
  })
  return { ok: true, session_id: session.id }
})
