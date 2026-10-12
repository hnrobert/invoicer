import { In } from "typeorm";
import { AppDataSource } from "#server/utils/database";
import { CampaignItem } from "#server/entities/campaignItem.entity";
import { CampaignGroup } from "#server/entities/campaignGroup.entity";
import { Invoice } from "#server/entities/invoice.entity";
import type { Campaign } from "#server/entities/campaign.entity";
import { logAudit } from "#server/utils/audit";
import type {
  AssignItemBody,
  ItemCreateBody,
  ItemMutationResponse,
  ItemPublic,
  ItemsResponse,
  OkResponse,
} from "#shared/api";
import type { AuthUser, CampaignRights } from "#shared/types";

function requireManage(rights: CampaignRights): void {
  if (!rights.canManage) {
    throw createError({ statusCode: 403, statusMessage: "Managers only" });
  }
}

function toPublic(
  it: CampaignItem,
  actualTotal: number | null,
  invoiceCount: number,
): ItemPublic {
  return {
    id: it.id,
    name: it.name,
    groupId: it.groupId,
    payer: it.payer,
    note: it.note,
    actualTotal,
    invoiceCount,
  };
}

/**
 * Counted amount of one invoice for item rollups — the recognized amount
 * falling back to the operator-entered one, mirroring calcTotal/sumRows.
 */
function countedAmount(r: Pick<Invoice, "extractedAmount" | "manualAmount">) {
  return r.extractedAmount ?? r.manualAmount;
}

/**
 * List the campaign's items with rollups. `actualTotal` sums the counted
 * amounts of attached invoices (null when nothing attached counted yet);
 * `invoiceCount` counts every attached file, receipts included.
 */
export async function listItems(campaignId: number): Promise<ItemsResponse> {
  const items = await AppDataSource.getRepository(CampaignItem).find({
    where: { campaignId },
    order: { id: "asc" },
  });
  const ids = items.map((i) => i.id);
  const attached = ids.length
    ? await AppDataSource.getRepository(Invoice).find({
        where: { itemId: In(ids) },
      })
    : [];
  return {
    ok: true,
    items: items.map((it) => {
      const mine = attached.filter((r) => r.itemId === it.id);
      // Only FORMAL INVOICES count toward the item's actual total — an
      // attached order screenshot / quotation repeats the same purchase and
      // exists for reconciliation, summing both would double the item.
      const counted = mine
        .filter((r) => r.kind === "invoice")
        .map(countedAmount)
        .filter((a): a is number => a != null);
      return toPublic(
        it,
        counted.length
          ? Math.round(counted.reduce((s, a) => s + a, 0) * 100) / 100
          : null,
        mine.length,
      );
    }),
  };
}

async function loadItem(
  campaignId: number,
  itemId: number,
): Promise<CampaignItem> {
  const it = await AppDataSource.getRepository(CampaignItem).findOneBy({
    id: itemId,
    campaignId,
  });
  if (!it) throw createError({ statusCode: 404, statusMessage: "Not found" });
  return it;
}

async function validateGroupId(
  campaignId: number,
  groupId: number | null,
): Promise<void> {
  if (groupId == null) return;
  const g = await AppDataSource.getRepository(CampaignGroup).findOneBy({
    id: groupId,
    campaignId,
  });
  if (!g) {
    throw createError({ statusCode: 404, statusMessage: "Group not found" });
  }
}

async function savedItem(it: CampaignItem): Promise<ItemMutationResponse> {
  await validateGroupId(it.campaignId, it.groupId);
  const saved = await AppDataSource.getRepository(CampaignItem).save(it);
  const mine = await AppDataSource.getRepository(Invoice).find({
    where: { itemId: saved.id },
  });
  const counted = mine
    .filter((r) => r.kind === "invoice")
    .map(countedAmount)
    .filter((a): a is number => a != null);
  return {
    ok: true,
    item: toPublic(
      saved,
      counted.length
        ? Math.round(counted.reduce((s, a) => s + a, 0) * 100) / 100
        : null,
      mine.length,
    ),
  };
}

/** Create an item (manager only). */
export async function createItem(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  body: ItemCreateBody,
): Promise<ItemMutationResponse> {
  requireManage(rights);
  const name = (body?.name ?? "").trim().slice(0, 60);
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: "Name is required" });
  }
  const dup = await AppDataSource.getRepository(CampaignItem).findOneBy({
    campaignId: campaign.id,
    name,
  });
  if (dup) {
    throw createError({ statusCode: 400, statusMessage: "Name exists" });
  }
  const res = await savedItem({
    campaignId: campaign.id,
    name,
    groupId: body?.groupId == null ? null : Number(body.groupId),
    payer: (body?.payer ?? "").trim().slice(0, 40) || null,
    note: (body?.note ?? "").trim().slice(0, 200) || null,
  } as CampaignItem);
  logAudit({
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
    actorId: user.id,
    action: "campaign.item.create",
    target: name,
  });
  return res;
}

/** Update an item's mutable fields (manager only; omitted fields untouched). */
export async function updateItem(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  itemId: number,
  body: ItemCreateBody,
): Promise<ItemMutationResponse> {
  requireManage(rights);
  const it = await loadItem(campaign.id, itemId);
  if (body?.name != null) {
    const name = body.name.trim().slice(0, 60);
    if (!name) {
      throw createError({ statusCode: 400, statusMessage: "Name is required" });
    }
    it.name = name;
  }
  if ("groupId" in (body ?? {})) it.groupId = body?.groupId ?? null;
  if ("payer" in (body ?? {})) it.payer = (body?.payer ?? "").trim() || null;
  if ("note" in (body ?? {})) it.note = (body?.note ?? "").trim() || null;
  const res = await savedItem(it);
  logAudit({
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
    actorId: user.id,
    action: "campaign.item.update",
    target: it.name,
  });
  return res;
}

/** Delete an item: its invoices detach, files stay. */
export async function deleteItem(
  user: Pick<AuthUser, "id">,
  campaign: Campaign,
  rights: CampaignRights,
  itemId: number,
): Promise<OkResponse> {
  requireManage(rights);
  const it = await loadItem(campaign.id, itemId);
  await AppDataSource.getRepository(Invoice).update(
    { itemId },
    { itemId: null },
  );
  await AppDataSource.getRepository(CampaignItem).delete({ id: itemId });
  logAudit({
    organizationId: campaign.organizationId,
    campaignId: campaign.id,
    actorId: user.id,
    action: "campaign.item.delete",
    target: it.name,
  });
  return { ok: true };
}

/**
 * Attach invoices to an item (or detach with itemId: null). Manager only;
 * invoices must belong to this campaign and the item too.
 */
export async function assignInvoicesToItem(
  rights: CampaignRights,
  campaignId: number,
  body: AssignItemBody,
): Promise<OkResponse> {
  requireManage(rights);
  const ids = (body?.invoiceIds ?? []).filter((n) => Number.isFinite(n));
  if (!ids.length) {
    throw createError({ statusCode: 400, statusMessage: "No invoices given" });
  }
  const iid = body?.itemId == null ? null : Number(body.itemId);
  if (iid != null) await loadItem(campaignId, iid);
  await AppDataSource.getRepository(Invoice).update(
    { id: In(ids), campaignId },
    { itemId: iid },
  );
  return { ok: true };
}
