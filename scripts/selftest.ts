/**
 * Standalone domain-logic self-test. Exercises the invoice field extraction +
 * matching core against synthetic invoice text, so a `pnpm selftest` (or the
 * tsup-bundled build) gives a fast yes/no that the ported regex/match logic is
 * intact without needing a running server or database.
 *
 * Pure utils only — deliberately avoids Nuxt/Nitro aliases and reflect-metadata
 * so it runs under plain `tsx` and bundles cleanly with tsup.
 */
import { extractInvoiceFields } from '../server/utils/fields'
import { matchInvoice } from '../server/utils/match'

type Case = {
  name: string
  text: string
  expect: {
    status: 'qualified' | 'review' | 'unqualified'
    title?: string
    taxId?: string
    amount?: number
  }
}

const CASES: Case[] = [
  {
    name: 'full qualified invoice (价税合计)',
    text: `购买方名称:腾讯科技（深圳）有限公司/纳税人识别号:91440300708461136T
价税合计（大写）壹仟元整 ¥1000.00`,
    expect: { status: 'qualified', taxId: '91440300708461136T', amount: 1000 },
  },
  {
    name: 'title matches, tax differs → review',
    text: `名称:腾讯科技（深圳）有限公司/
纳税人识别号:11111111111111111X
小写 ¥250.50`,
    expect: { status: 'review' },
  },
  {
    name: 'neither matches → unqualified',
    text: `名称:某不知名公司/
纳税人识别号:00000000000000000A
价税合计 ¥88.88`,
    expect: { status: 'unqualified' },
  },
  {
    name: 'matched title+tax but no amount → review',
    text: `名称:腾讯科技（深圳）有限公司/
纳税人识别号:91440300708461136T`,
    expect: { status: 'review', taxId: '91440300708461136T' },
  },
  {
    name: 'amount with thousands separator',
    text: `购买方名称:腾讯科技（深圳）有限公司/纳税人识别号:91440300708461136T
价税合计 ¥1,234,567.89`,
    expect: { status: 'qualified', amount: 1234567.89 },
  },
]

const EXPECTED_TITLE = '腾讯科技（深圳）有限公司'
const EXPECTED_TAX = '91440300708461136T'

let failed = 0
for (const c of CASES) {
  const fields = extractInvoiceFields(c.text)
  const { status } = matchInvoice(fields, EXPECTED_TITLE, EXPECTED_TAX)

  const checks: boolean[] = [status === c.expect.status]
  if (c.expect.taxId != null) checks.push(fields.taxId === c.expect.taxId)
  if (c.expect.amount != null)
    checks.push(fields.amount != null && Math.abs(fields.amount - c.expect.amount) < 1e-6)

  const ok = checks.every(Boolean)
  if (!ok) failed++
  console.log(
    `${ok ? '✓' : '✗'} ${c.name} → status=${status}` +
      (ok ? '' : `  [fields title=${fields.title} taxId=${fields.taxId} amount=${fields.amount}]`),
  )
}

if (failed) {
  console.error(`\n${failed} self-test(s) FAILED`)
  process.exit(1)
}
console.log(`\nAll ${CASES.length} self-tests passed.`)
