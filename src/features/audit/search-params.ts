import {
  createLoader,
  createSerializer,
  parseAsInteger,
  parseAsIsoDate,
  parseAsString,
} from "nuqs/server";

export const auditParams = {
  type: parseAsString,
  actor: parseAsString,
  from: parseAsIsoDate,
  to: parseAsIsoDate,
  page: parseAsInteger.withDefault(1),
};

export const loadAuditParams = createLoader(auditParams);
export const serializeAuditParams = createSerializer(auditParams);
export const AUDIT_PAGE_SIZE = 50;
