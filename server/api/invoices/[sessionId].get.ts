import { AppDataSource } from '#server/utils/database'
import { Invoice } from '#server/entities/invoice.entity'
import { ReviewSession } from '#server/entities/reviewSession.entity'
import { calcTotal, invoiceToPublic } from '#server/utils/serialize'

/** List all invoices in a session with the running total and a "still processing" flag. */
export default defineEventHandler(async (event) => {
  const sessionId = Number(getRouterParam(event, 'sessionId'))
  const session = await AppDataSource.getRepository(ReviewSession).findOneBy({ id: sessionId })
  if (!session) throw createError({ statusCode: 404, statusMessage: '会话不存在' })

  const invoices = await AppDataSource.getRepository(Invoice).find({
    where: { sessionId },
    order: { id: 'asc' },
  })

  return {
    ok: true,
    expected_title: session.expectedTitle,
    expected_tax_id: session.expectedTaxId,
    invoices: invoices.map(invoiceToPublic),
    total_amount: await calcTotal(sessionId),
    has_pending: invoices.some((i) => i.status === 'pending' || i.status === 'processing'),
  }
})
