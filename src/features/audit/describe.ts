/** Human wording for audit entries. Unknown actions fall back to their code. */

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  organization: "Organisation",
  shop: "Shop",
  warehouse: "Warehouse",
  member: "Team member",
  invitation: "Invitation",
  product: "Product",
  category: "Category",
};

const VERBS: Record<string, string> = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
  sent: "sent",
  accepted: "accepted",
  revoked: "revoked",
};

const FIELD_LABELS: Record<string, string> = {
  is_active: "active",
  all_shops: "all-shop access",
  order_prefix: "order prefix",
  custom_domain: "domain",
  gst_rate: "GST rate",
  hsn_code: "HSN code",
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return "updated";
  const text = String(value);
  return text.length > 40 ? `${text.slice(0, 37)}…` : text;
}

export type AuditDescription = { summary: string; details: string[] };

export function describeAudit(action: string, metadata: unknown): AuditDescription {
  const [entity = "", verb = ""] = action.split(".");
  const meta = (typeof metadata === "object" && metadata !== null ? metadata : {}) as Record<
    string,
    unknown
  >;
  const entityLabel = (AUDIT_ENTITY_LABELS[entity] ?? entity).toLowerCase();

  let summary = `${VERBS[verb] ? `${VERBS[verb][0]!.toUpperCase()}${VERBS[verb].slice(1)}` : verb} ${entityLabel}`;
  if (action === "invitation.sent" && typeof meta.email === "string")
    summary = `Invited ${meta.email} as ${String(meta.role ?? "")}`.trim();
  if (action === "invitation.accepted" && typeof meta.email === "string")
    summary = `${meta.email} joined the team`;
  if (action === "invitation.revoked" && typeof meta.email === "string")
    summary = `Withdrew the invitation to ${meta.email}`;
  if (action === "organization.created") summary = "Created the organisation";

  const details: string[] = [];
  const changed = meta.changed;
  if (typeof changed === "object" && changed !== null) {
    for (const [key, value] of Object.entries(changed as Record<string, unknown>)) {
      if (key === "settings") details.push("storefront settings changed");
      else details.push(`${FIELD_LABELS[key] ?? key.replace(/_/g, " ")} → ${formatValue(value)}`);
    }
  }
  if (typeof meta.variants === "number")
    details.push(`${meta.variants} variant${meta.variants === 1 ? "" : "s"}`);
  return { summary, details };
}
