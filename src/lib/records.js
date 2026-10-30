export const storageKey = "green-shield-crm-v1";
export const stages = [
  "Draft",
  "Ready for review",
  "Approved",
  "Sent",
  "Replied",
  "Qualified",
  "Paused",
  "Closed",
];
export const approvals = ["Not reviewed", "Needs changes", "Approved"];
export const organizationTypes = [
  "Broker",
  "Trader / processor",
  "Specialty importer",
  "Specialty trader",
  "Other",
];
export const channels = ["Email", "Contact form", "Other"];
const fields = [
  "id",
  "company",
  "organizationType",
  "geography",
  "fit",
  "website",
  "contactName",
  "contactEmail",
  "plannedChannel",
  "sourceNotes",
  "emailSubject",
  "emailBody",
  "followUpDraft",
  "approval",
  "approvedBy",
  "approvedAt",
  "stage",
  "sender",
  "sentAt",
  "replyAt",
  "replySummary",
  "threadUrl",
  "nextFollowUp",
  "nextAction",
  "sampleStatus",
  "requirements",
  "notes",
  "complianceGate",
  "updatedAt",
];
const dateFields = ["approvedAt", "sentAt", "replyAt", "nextFollowUp"];

/** @param {string} [id] @returns {import('./types').Lead} */
export function blankLead(id = "") {
  const record = Object.fromEntries(fields.map((field) => [field, ""]));
  return /** @type {import('./types').Lead} */ (
    /** @type {unknown} */ ({
      ...record,
      id,
      sources: [],
      organizationType: "Other",
      plannedChannel: "Email",
      approval: "Not reviewed",
      stage: "Draft",
    })
  );
}

/** @param {unknown} value @returns {string | null} */
export function safeUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** @param {string} value */
export function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

/** @param {unknown} input @returns {import('./types').Lead[]} */
export function parseBackup(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Choose a Green Shield CRM JSON backup.");
  const envelope = /** @type {Record<string,unknown>} */ (input);
  if (envelope.schemaVersion !== 1 || !Array.isArray(envelope.records))
    throw new Error(
      "This file is not a supported CRM backup (schemaVersion 1).",
    );
  if (envelope.records.length > 2000)
    throw new Error("This prototype supports up to 2,000 records per backup.");
  const ids = new Set();
  return envelope.records.map((input, index) => {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error(`Record ${index + 1} is invalid.`);
    const raw = /** @type {Record<string,unknown>} */ (input);
    const record = blankLead();
    for (const field of fields) {
      const value = raw[field];
      if (value !== undefined && typeof value !== "string")
        throw new Error(`Record ${index + 1}: ${field} must be text.`);
      if (typeof value === "string" && value.length > 60000)
        throw new Error(`Record ${index + 1}: ${field} is too long.`);
      if (typeof value === "string")
        /** @type {Record<string,unknown>} */ (/** @type {unknown} */ (record))[
          field
        ] = value;
    }
    record.id = record.id.trim();
    record.company = record.company.trim();
    if (
      !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(record.id) ||
      ["constructor", "prototype", "__proto__"].includes(record.id)
    )
      throw new Error(`Record ${index + 1} has an unsafe or invalid ID.`);
    if (!record.id || !record.company)
      throw new Error(`Record ${index + 1} needs an ID and company name.`);
    if (ids.has(record.id))
      throw new Error(`Duplicate record ID: ${record.id}`);
    ids.add(record.id);
    if (
      !stages.includes(record.stage) ||
      !approvals.includes(record.approval) ||
      !organizationTypes.includes(record.organizationType) ||
      !channels.includes(record.plannedChannel)
    )
      throw new Error(
        `Record ${index + 1} has an unsupported stage, approval, organization type or channel.`,
      );
    for (const field of dateFields) {
      const value = /** @type {Record<string,string>} */ (
        /** @type {unknown} */ (record)
      )[field];
      if (!validDate(value))
        throw new Error(
          `Record ${index + 1}: ${field} needs YYYY-MM-DD or a blank value.`,
        );
    }
    if (
      raw.sources !== undefined &&
      (!Array.isArray(raw.sources) ||
        raw.sources.length > 100 ||
        raw.sources.some(
          (value) => typeof value !== "string" || value.length > 3000,
        ))
    )
      throw new Error(
        `Record ${index + 1}: sources must be a list of up to 100 URL strings.`,
      );
    record.sources = Array.isArray(raw.sources)
      ? raw.sources.map((value) => String(value).trim()).filter(Boolean)
      : [];
    return record;
  });
}

/** @param {string} value */
export function csvCell(value) {
  const safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

/** @param {import('./types').Lead[]} records */
export function summaryCsv(records) {
  const keys = [
    "company",
    "organizationType",
    "geography",
    "contactName",
    "contactEmail",
    "plannedChannel",
    "approval",
    "stage",
    "sender",
    "sentAt",
    "replyAt",
    "nextFollowUp",
    "nextAction",
  ];
  const rows = [keys.map(csvCell).join(",")];
  for (const record of records)
    rows.push(
      keys
        .map((key) =>
          csvCell(
            /** @type {Record<string,string>} */ (
              /** @type {unknown} */ (record)
            )[key] || "",
          ),
        )
        .join(","),
    );
  return "\uFEFF" + rows.join("\r\n");
}

/** @param {import('./types').Lead} record @param {string} today */
export function followUpState(record, today) {
  if (!record.nextFollowUp || ["Closed", "Paused"].includes(record.stage))
    return "none";
  return record.nextFollowUp < today
    ? "overdue"
    : record.nextFollowUp === today
      ? "today"
      : "upcoming";
}
