import { In } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { Invoice } from "#server/entities/invoice.entity";
import { CampaignItem } from "#server/entities/campaignItem.entity";
import { logAudit } from "#server/utils/audit";

/**
 * Automatic invoice ↔ evidence pairing and item creation — the "one upload,
 * everything matched" pass. Once a campaign's upload batch finishes
 * processing (no rows left pending/processing — see the debounced hook in
 * utils/process.ts), this pairs each quotation / receipt with its invoice
 * and creates one item per cluster. Signals run strongest-first; every pass
 * requires an UNAMBIGUOUS candidate — a wrong auto-pair is worse than a
 * file left for manual attach:
 *
 *   1. order number quoted in the invoice body
 *   2. evidence = SUM of 2-3 same-seller invoices (before exact: a ¥1341
 *      screenshot documents 2× ¥670.50 invoices, not the lone ¥1341 one)
 *   3. exact amount, seller-bridged when several evidences compete
 *   4. net-vs-gross (evidence = invoice / (1+VAT))
 *   5. N:M same-seller amount windows of equal size (2 screenshots ~¥800 ↔
 *      2 invoices ¥800 — which pairs with which is unknowable, pair in order)
 *   6. near amount (unique within max(¥1, 2.5%)), seller-bridge as fallback
 *   7. invoice = SUM of 2 leftover evidences (¥140 + ¥50 deposit = ¥190)
 *
 * Leftover invoices each become an item; leftover evidence stays unattached
 * (waiting for its invoice, not a claim row). Idempotent: only touches
 * invoices with itemId = null and never modifies existing items.
 */

interface Bill {
  row: Invoice;
  amount: number | null;
  text: string;
}
interface Ev {
  row: Invoice;
  amount: number | null;
  orderNo: string | null;
  text: string;
}

const amountOf = (i: Invoice): number | null =>
  i.extractedAmount ?? i.manualAmount;
const squash = (s: string) => s.replace(/[\s]/g, "");

/** Invoice goods name ("*文具*卡套 规格…" → "卡套 规格…") for the item name. */
function goodsName(b: Bill): string | null {
  const m = b.text.match(/\*[^*\n]{1,14}\*(.{1,24}?)\s+\d/);
  const name = m?.[1]
    ?.replace(/\s*[把张个件套次箱支盒]\s*$/, "")
    .replace(/[\s.。·]+$/, "")
    .trim();
  return name && name.length >= 2 ? name : null;
}

/** Bill's SELLER name (stored extractedMerchant) found as a 3-char run in
 *  the evidence's text. OCR mangles the first chars ("苑南县益丽" vs "苍南县
 *  益丽"), so n-gram overlap, not full-name match. Parsing the seller out of
 *  the bill's raw text instead grabs the BUYER first — positional e-invoice
 *  layouts interleave 购/销 columns and squashing joins the buyer's name onto
 *  the label. One direction only: order screenshots carry no 名称: label. */
function sellerBridge(ev: Ev | Bill, bill: Bill | Ev): boolean {
  const merchant = bill.row.extractedMerchant;
  if (!merchant) return false;
  const t = squash(ev.text);
  for (let i = 0; i + 3 <= merchant.length; i++) {
    if (t.includes(merchant.slice(i, i + 3))) return true;
  }
  return false;
}

const VAT_RATES = [0.13, 0.09, 0.06, 0.01];

export async function autoMatchItems(campaignId: number): Promise<void> {
  const repo = AppDataSource.getRepository(Invoice);
  const all = await repo.find({ where: { campaignId }, order: { id: "asc" } });
  // Anything still mid-recognition? The debounced hook only fires on idle,
  // but a re-check keeps this safe when called directly.
  if (all.some((i) => i.status === "pending" || i.status === "processing"))
    return;

  const bills: Bill[] = all
    .filter((i) => i.kind === "invoice" && i.itemId == null)
    .map((row) => ({ row, amount: amountOf(row), text: row.rawText ?? "" }));
  const evs: Ev[] = all
    .filter(
      (i) =>
        (i.kind === "quotation" || i.kind === "receipt") && i.itemId == null,
    )
    .map((row) => ({
      row,
      amount: amountOf(row),
      orderNo: row.extractedOrderNo,
      text: row.rawText ?? "",
    }));
  if (!bills.length) return;

  // Clusters become ONE item each; extra evidences append to a cluster.
  const clusters: { bills: Bill[]; evs: Ev[] }[] = [];
  const billCluster = new Map<number, number>();
  const evTaken = new Set<number>();
  const take = (bs: Bill[], es: Ev[]) => {
    const ix = clusters.length;
    clusters.push({ bills: [...bs], evs: [...es] });
    bs.forEach((x) => billCluster.set(x.row.id, ix));
    es.forEach((x) => evTaken.add(x.row.id));
  };
  const open = () => bills.filter((b) => !billCluster.has(b.row.id));

  // ---- pass 1: order number quoted in the invoice body ----
  for (const ev of evs) {
    if (evTaken.has(ev.row.id) || !ev.orderNo) continue;
    const digits = squash(ev.orderNo);
    if (digits.length < 8) continue;
    const hit = open().filter((b) => squash(b.text).includes(digits));
    if (hit.length === 1) take([hit[0]!], [ev]);
  }

  // ---- pass 2: evidence = SUM of 2-3 same-seller invoices (±0.05) ----
  for (const ev of evs) {
    if (evTaken.has(ev.row.id) || ev.amount == null) continue;
    const o = open();
    let found: Bill[] | null = null;
    for (let i = 0; i < o.length && !found; i++) {
      for (let j = i + 1; j < o.length && !found; j++) {
        const p1 = o[i]!,
          p2 = o[j]!;
        if (
          p1.row.extractedMerchant === p2.row.extractedMerchant &&
          Math.abs((p1.amount ?? 0) + (p2.amount ?? 0) - ev.amount) <= 0.05
        ) {
          found = [p1, p2];
          break;
        }
        for (let k = j + 1; k < o.length; k++) {
          const p3 = o[k]!;
          if (
            p1.row.extractedMerchant === p3.row.extractedMerchant &&
            Math.abs(
              (p1.amount ?? 0) +
                (p2.amount ?? 0) +
                (p3.amount ?? 0) -
                ev.amount,
            ) <= 0.05
          ) {
            found = [p1, p2, p3];
            break;
          }
        }
      }
    }
    if (found) take(found, [ev]);
  }

  // ---- pass 3: exact amount. When several evidences compete for one bill
  //      the seller-bridged evidence wins; equal-count groups pair in id
  //      order (which of two same-amount screenshots belongs to which of two
  //      same-amount invoices is not derivable from the data). ----
  {
    const byAmount = (arr: { amount: number | null }[]) =>
      arr.filter((x) => x.amount != null) as { amount: number }[];
    const openExact = (amt: number) =>
      byAmount(open()).filter(
        (b) => Math.abs((b as Bill).amount! - amt) <= 0.005,
      ) as Bill[];
    const evExact = (amt: number) =>
      byAmount(evs.filter((e) => !evTaken.has(e.row.id))).filter(
        (e) => Math.abs((e as Ev).amount! - amt) <= 0.005,
      ) as Ev[];
    const seen = new Set<string>();
    for (const ev of [...evs]) {
      if (evTaken.has(ev.row.id) || ev.amount == null) continue;
      const key = ev.amount.toFixed(2);
      if (seen.has(key)) continue;
      seen.add(key);
      const es = evExact(ev.amount);
      const bs = openExact(ev.amount);
      if (!es.length || !bs.length) continue;
      if (es.length === 1 && bs.length === 1) {
        take([bs[0]!], [es[0]!]);
      } else if (bs.length === 1) {
        // several evidences claim the same bill → the bridged one wins
        const bridged = es.filter((e) => sellerBridge(e, bs[0]!));
        if (bridged.length === 1) take([bs[0]!], [bridged[0]!]);
      } else if (es.length === bs.length) {
        const sb = [...bs].sort((a, b) => a.row.id - b.row.id);
        const se = [...es].sort((a, b) => a.row.id - b.row.id);
        sb.forEach((b, i) => take([b], [se[i]!]));
      }
    }
  }

  // ---- pass 4: net vs gross — per BILL, pick the evidence with the
  //      TIGHTEST b/(1+r) fit. A loose 13% relation also matched a stray
  //      ¥50 deposit screenshot to a ¥56.47 invoice (56.47/1.13 = 49.97)
  //      while the real 1% net (55.91) existed — the tightest fit wins. ----
  for (const bill of open()) {
    if (bill.amount == null) continue;
    const fits: { ev: Ev; err: number }[] = [];
    for (const ev of evs) {
      if (evTaken.has(ev.row.id) || ev.amount == null) continue;
      for (const r of VAT_RATES) {
        const err = Math.abs(bill.amount / (1 + r) - ev.amount);
        if (err <= 0.05) fits.push({ ev, err });
      }
    }
    if (!fits.length) continue;
    fits.sort((a, b) => a.err - b.err);
    const best = fits[0]!;
    const runner = fits[1];
    // clearly tightest (a 1% net matches to the cent; a coincidental 13%
    // relation is loose) — otherwise leave both for manual attach
    if (best.err <= 0.01 && (runner == null || best.err < runner.err / 2)) {
      take([bill], [best.ev]);
    }
  }

  // ---- pass 5: N:M same-seller amount windows of equal size — e.g. two
  //      ~¥800 screenshots against two ¥800 invoices ----
  {
    const sellers = new Set(
      open()
        .filter((b) => b.amount != null && b.row.extractedMerchant)
        .map((b) => b.row.extractedMerchant),
    );
    for (const s of sellers) {
      const o = open().filter(
        (b) => b.amount != null && b.row.extractedMerchant === s,
      );
      if (o.length < 2) continue;
      const lo = Math.min(...o.map((b) => b.amount!));
      const gw = o.filter(
        (b) => b.amount! >= lo * 0.97 && b.amount! <= lo * 1.06,
      );
      if (gw.length < 2) continue;
      const hi = Math.max(...gw.map((b) => b.amount!));
      const win = evs.filter(
        (ev) =>
          !evTaken.has(ev.row.id) &&
          ev.amount != null &&
          ev.amount >= lo * 0.94 &&
          ev.amount <= hi * 1.06,
      );
      if (win.length === gw.length) {
        const sb = [...gw].sort((a, b) => a.row.id - b.row.id);
        const se = [...win].sort((a, b) => a.row.id - b.row.id);
        sb.forEach((b, i) => take([b], [se[i]!]));
      }
    }
  }

  // ---- pass 6: near amount — unique within max(¥1, 2.5%), seller-bridged
  //      fallback when several bills sit inside the window ----
  for (const ev of evs) {
    if (evTaken.has(ev.row.id) || ev.amount == null) continue;
    const evAmt = ev.amount;
    const tol = Math.max(1, 0.03 * evAmt);
    const near = open().filter(
      (b) => b.amount != null && Math.abs(b.amount - evAmt) <= tol,
    );
    if (!near.length) continue;
    if (
      near.length === 1 &&
      !evs.some(
        (o) =>
          o !== ev &&
          !evTaken.has(o.row.id) &&
          o.amount != null &&
          Math.abs(o.amount - evAmt) <= tol,
      )
    ) {
      take([near[0]!], [ev]);
      continue;
    }
    const bridged = near.filter((b) => sellerBridge(ev, b));
    if (bridged.length === 1) take([bridged[0]!], [ev]);
  }

  // ---- pass 7: invoice = SUM of 2 leftover evidences (±0.05) — a ¥190
  //      invoice against a ¥140 payment + ¥50 top-up/deposit screenshot ----
  for (const bill of [...bills]) {
    if (billCluster.has(bill.row.id) || bill.amount == null) continue;
    const left = evs.filter((ev) => !evTaken.has(ev.row.id));
    let done = false;
    for (let i = 0; i < left.length && !done; i++) {
      for (let j = i + 1; j < left.length && !done; j++) {
        if (
          left[i]!.amount != null &&
          left[j]!.amount != null &&
          Math.abs(left[i]!.amount! + left[j]!.amount! - bill.amount) <= 0.05
        ) {
          take([bill], [left[i]!, left[j]!]);
          done = true;
        }
      }
    }
  }

  // ---- pass 8: adopt leftover evidence into an existing cluster (the
  //      evidence's text names the cluster's goods/seller, or its amount
  //      equals the cluster's invoice sum) ----
  for (const ev of evs.filter((e) => !evTaken.has(e.row.id))) {
    const squashed = squash(ev.text);
    for (let ci = 0; ci < clusters.length; ci++) {
      const c = clusters[ci]!;
      if (!c.bills.length) continue;
      const sumB = c.bills.reduce((x, b) => x + (b.amount ?? 0), 0);
      const sumHit = ev.amount != null && Math.abs(sumB - ev.amount) <= 0.05;
      const tokHit = c.bills.some((b) => {
        const g = goodsName(b);
        return g != null && squashed.includes(g.slice(0, 2));
      });
      if (sumHit || tokHit) {
        c.evs.push(ev);
        evTaken.add(ev.row.id);
        break;
      }
    }
  }

  // ---- pass 9: merge clusters whose main bills share a concrete goods
  //      token — two 卡套 purchases from two sellers are ONE project, and so
  //      are the two 酷态科 power banks. Guards against over-merging:
  //      the joining cluster must carry evidence (a bare invoice joining a
  //      complete pair is a superseded duplicate); identical goods token
  //      sets never merge (a re-purchase is a separate claim row — two
  //      陶瓷杯 orders, 文件袋 × 2 sellers); a joining bill whose amount
  //      equals the target's invoice sum is the replaced old invoice. ----
  {
    const GENERIC = [
      "餐饮费",
      "餐饮服务",
      "其他食品",
      "食品",
      "服务",
      "设计",
      "制作",
      "文宣品",
      "印刷",
    ];
    const tokenOf = (c: { bills: Bill[] }) => {
      const g = goodsName(c.bills[0]!) ?? "";
      if (GENERIC.some((w) => g.includes(w) && g.length <= w.length + 3))
        return [] as string[];
      return [...g.matchAll(/[一-鿿]{2,6}/g)]
        .map((m) => m[0]!)
        .filter((t) => !GENERIC.includes(t));
    };
    const tokenSets: (string[] | null)[] = clusters.map((c) => tokenOf(c));
    const clusterSum = (c: { bills: Bill[] }) =>
      c.bills.reduce((x, b) => x + (b.amount ?? 0), 0);
    for (let i = 0; i < clusters.length; i++) {
      const ti = tokenSets[i] ?? [];
      if (!ti.length || !clusters[i]!.evs.length) continue;
      for (let j = i + 1; j < clusters.length; j++) {
        const tj = tokenSets[j] ?? [];
        if (!tj.length || !clusters[j]!.evs.length) continue;
        const sameSet =
          ti.length === tj.length && ti.every((t) => tj.includes(t));
        if (sameSet) {
          // identical goods: still ONE project when the same seller sold a
          // couple of single units (2× 酷态科 power banks); a re-purchase
          // (2× 100-piece 陶瓷杯 orders) stays separate claim rows.
          const sameSeller =
            clusters[i]!.bills[0]!.row.extractedMerchant ===
            clusters[j]!.bills[0]!.row.extractedMerchant;
          const qty = (b: Bill) => {
            const m = b.text.match(/\*[^*\n]{1,14}\*.{1,24}?\s+([0-9]{1,4})\b/);
            return m?.[1] ? Number(m[1]) : null;
          };
          const qties = [...clusters[i]!.bills, ...clusters[j]!.bills]
            .map(qty)
            .filter((q): q is number => q != null);
          const smallQty =
            qties.length ===
              clusters[i]!.bills.length + clusters[j]!.bills.length &&
            qties.reduce((x, y) => x + y, 0) <= 3;
          if (!(sameSeller && smallQty)) continue;
        }
        const shares = ti.some(
          (t) =>
            tj.includes(t) || tj.some((u) => u.includes(t) || t.includes(u)),
        );
        if (!shares) continue;
        // joining single bill whose amount equals the target's sum → the
        // superseded old invoice; leave it for its own judgement
        const jb = clusters[j]!.bills;
        if (
          jb.length === 1 &&
          Math.abs((jb[0]!.amount ?? 0) - clusterSum(clusters[i]!)) <= 0.05
        )
          continue;
        clusters[i]!.bills.push(...clusters[j]!.bills);
        clusters[i]!.evs.push(...clusters[j]!.evs);
        clusters[j]!.bills = [];
        clusters[j]!.evs = [];
        tokenSets[j] = [];
      }
    }
  }

  // ---- leftovers: unattached invoices become items; a bill whose amount
  //      equals an existing cluster's invoice sum is a superseded duplicate
  //      (the ¥1341 invoice the two ¥670.50 replacements retired) and stays
  //      unattached rather than becoming a phantom item. Evidence waits. ----
  for (const b of open()) {
    const dup = clusters.some(
      (c) =>
        c.bills.length &&
        Math.abs(
          c.bills.reduce((x, y) => x + (y.amount ?? 0), 0) - (b.amount ?? -1),
        ) <= 0.05,
    );
    if (!dup) take([b], []);
  }

  // ---- materialise items ----
  const itemRepo = AppDataSource.getRepository(CampaignItem);
  for (const c of clusters) {
    if (!c.bills.length) continue; // merged into another cluster
    const main = c.bills[0]!;
    const name =
      goodsName(main) ??
      main.row.filename.replace(/\.[a-z0-9]+$/i, "").slice(0, 60);
    const item = await itemRepo.save({
      campaignId,
      name,
      groupId: null,
      payer: null,
      note: null,
    });
    await repo.update(
      {
        id: In(c.bills.map((b) => b.row.id).concat(c.evs.map((e) => e.row.id))),
      },
      { itemId: item.id },
    );
  }
  logAudit({
    organizationId: null,
    campaignId,
    actorId: "system",
    action: "campaign.automatch",
    target: `campaign #${campaignId}`,
    meta: { items: clusters.length },
  });
}

/** Debounced idle check: the last finishing processInvoice in a campaign
 *  schedules this; if nothing is left pending it runs the auto-match. */
const timers = new Map<number, ReturnType<typeof setTimeout>>();
export function scheduleAutoMatch(campaignId: number): void {
  const old = timers.get(campaignId);
  if (old) clearTimeout(old);
  timers.set(
    campaignId,
    setTimeout(() => {
      timers.delete(campaignId);
      autoMatchItems(campaignId).catch((e) =>
        console.error(`[automatch] campaign ${campaignId} failed:`, e),
      );
    }, 2500),
  );
}
