import { saveMailConfig } from "#server/utils/mail";
import { FieldMapSchema } from "email-poster";

/**
 * Save the post-schemas library (the named field-map palette behind the
 * editor). The active webhook format stays in `postFieldMap` (saved with the
 * rest of the mail config); schemas persist here independently so the editor
 * can auto-sync them as the operator adds / renames / deletes. Stored
 * server-side — shared, not per-browser.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event);
  const body = await readBody<Record<string, unknown>>(event);
  const raw = Array.isArray(body?.schemas) ? body.schemas : [];

  // Validate each schema: id + name strings, fields a valid email-poster
  // FieldMap (known logical keys, body XOR). Store canonical JSON.
  const clean: { id: string; name: string; fields: Record<string, string> }[] =
    [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const id =
      typeof (t as { id?: unknown }).id === "string"
        ? (t as { id: string }).id
        : "";
    const name =
      typeof (t as { name?: unknown }).name === "string"
        ? (t as { name: string }).name
        : "";
    const fm = FieldMapSchema.safeParse(
      (t as { fields?: unknown }).fields ?? {},
    );
    if (!id || !fm.success) continue;
    clean.push({ id, name, fields: fm.data });
  }

  await saveMailConfig({ postSchemas: JSON.stringify(clean) });
  return { ok: true };
});
