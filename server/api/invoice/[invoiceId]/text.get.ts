import { AppDataSource } from '#server/utils/database'
import { Invoice } from '#server/entities/invoice.entity'

/** Return the raw extracted text / OCR result for an invoice (for the detail view). */
export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'invoiceId'))
  const inv = await AppDataSource.getRepository(Invoice).findOneBy({ id })
  if (!inv) throw createError({ statusCode: 404, statusMessage: '未找到该发票' })
  return { ok: true, filename: inv.filename, text: inv.rawText ?? '' }
})
