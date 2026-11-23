"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Lead } from "@/lib/types";
import {
  approvals,
  blankLead,
  channels,
  commodities,
  followUpState,
  organizationTypes,
  parseBackup,
  safeUrl,
  sortForWork,
  stages,
  summaryCsv,
  whatsappNumber,
} from "@/lib/records";
import { translate, type Lang } from "@/lib/i18n";

type View = "all" | "review" | "due" | "replies";
type Tab = "company" | "sources" | "draft" | "activity";
type Session = "loading" | "setup" | "login" | "ready";
type T = (text: string, values?: Record<string, string | number>) => string;
const langKey = "baoore-crm-lang";

function Icon({
  name,
}: {
  name:
    | "arrow"
    | "plus"
    | "search"
    | "grid"
    | "mail"
    | "clock"
    | "download"
    | "refresh"
    | "lock"
    | "close"
    | "check"
    | "chat"
    | "copy";
}) {
  const paths = {
    arrow: "M4 16 16 4M4 4h12v12",
    plus: "M10 3v14M3 10h14",
    search: "M14 14l4 4M16 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
    grid: "M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z",
    mail: "M2 5h16v11H2zM2 5l8 6 8-6",
    clock: "M10 5v5l4 2M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    download: "M10 2v11M6 9l4 4 4-4M3 14v4h14v-4",
    refresh: "M17 7a7 7 0 1 0 0 7M17 2v5h-5",
    lock: "M4 9h12v9H4zM6 9V6a4 4 0 0 1 8 0v3",
    close: "M4 4l12 12M16 4 4 16",
    check: "M3 10l5 5 9-10",
    chat: "M3 17l1.2-3.6A7 7 0 1 1 7 16.4Z",
    copy: "M7 7h10v10H7zM3 13V3h10",
  };
  return (
    <svg className="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
function Brand({ t }: { t: T }) {
  return (
    <div className="brand">
      <svg viewBox="0 0 34 44" aria-hidden="true">
        <path d="M17 5C-1 15 0 32 17 39C34 32 35 15 17 5Zm0 1v32M17 7C6 17 6 29 17 37M17 7c11 10 11 22 0 30M17 5c0-2 1-3 4-4" />
      </svg>
      <span>
        <strong>BAOORE AgriTrade</strong>
        <small>{t("OUTREACH WORKSPACE")}</small>
      </span>
    </div>
  );
}
function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Status({ value, t }: { value: string; t: T }) {
  return (
    <span
      className={`status status-${value.toLowerCase().replaceAll(" ", "-")}`}
    >
      {t(value)}
    </span>
  );
}
function ExternalLink({ url, t }: { url: string; t: T }) {
  const href = safeUrl(url);
  return href ? (
    <a
      className="source-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
    >
      {url}
      <Icon name="arrow" />
    </a>
  ) : (
    <span className="invalid-url">{url || t("No source added")}</span>
  );
}
function LanguageSwitch({
  lang,
  setLang,
  t,
}: {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: T;
}) {
  return (
    <div className="lang-switch" role="group" aria-label={t("Language")}>
      {(["fr", "en"] as const).map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={lang === value}
          onClick={() => setLang(value)}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
/** Day first in both languages: 16/06/2026. */
function shortDate(value: string, t: T) {
  if (!value) return t("Not set");
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function api(path: string, options: RequestInit = {}) {
  const result = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });
  const data = await result.json();
  if (!result.ok)
    throw new Error(data.error || `Request failed (${result.status}).`);
  return data;
}

export default function Crm() {
  const [lang, setLangState] = useState<Lang>("en");
  const t: T = (text, values) => translate(lang, text, values);
  const [session, setSession] = useState<Session>("loading");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [records, setRecords] = useState<Lead[]>([]);
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  const [loadedAt, setLoadedAt] = useState("");
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [draft, setDraft] = useState<Lead | null>(null);
  const [baseline, setBaseline] = useState("");
  const [revision, setRevision] = useState(0);
  const [isNew, setIsNew] = useState(false);
  const [tab, setTab] = useState<Tab>("company");
  const [recordError, setRecordError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const editor = useRef<HTMLDialogElement>(null);
  const dataDialog = useRef<HTMLDialogElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const dirty = Boolean(draft && JSON.stringify(draft) !== baseline);
  const message = (caught: unknown, fallback: string) =>
    caught instanceof Error ? caught.message : t(fallback);

  function setLang(value: Lang) {
    setLangState(value);
    try {
      localStorage.setItem(langKey, value);
    } catch {
      /* Saving the choice is optional. */
    }
  }
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(langKey);
    } catch {
      /* English stays the fallback. */
    }
    if (saved === "fr" || saved === "en") setLangState(saved);
    else if (navigator.language?.toLowerCase().startsWith("fr"))
      setLangState("fr");
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  async function loadRecords() {
    const data = await api("/api/records/");
    setRecords(data.records);
    setRevisions(data.revisions);
    setLoadedAt(
      new Date().toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await api("/api/session/");
        if (!active) return;
        if (!data.configured) {
          setSession("setup");
          return;
        }
        if (data.authenticated) {
          await loadRecords();
          if (active) setSession("ready");
        } else setSession("login");
      } catch (caught) {
        if (active) {
          setError(message(caught, "Cannot reach the server."));
          setSession("login");
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (draft && !editor.current?.open) editor.current?.showModal();
    if (!draft && editor.current?.open) editor.current.close();
  }, [draft]);
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/session/", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      await loadRecords();
      setSession("ready");
    } catch (caught) {
      setError(message(caught, "Sign-in failed."));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (dirty && !window.confirm(t("Discard your unsaved changes and sign out?")))
      return;
    setBusy(true);
    try {
      await api("/api/session/", { method: "DELETE" });
      setDraft(null);
      setRecords([]);
      setSession("login");
      setNotice("");
    } catch (caught) {
      setError(message(caught, "Sign-out was not confirmed."));
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await loadRecords();
      setNotice(t("Latest records loaded."));
    } catch (caught) {
      setError(message(caught, "Could not reload records."));
    } finally {
      setBusy(false);
    }
  }
  function edit(record: Lead) {
    setDraft(structuredClone(record));
    setBaseline(JSON.stringify(record));
    setRevision(revisions[record.id] || 0);
    setIsNew(false);
    setTab("company");
    setRecordError("");
    setCopyNotice("");
  }
  function add() {
    const value = blankLead("GS-" + crypto.randomUUID());
    setDraft(value);
    setBaseline(JSON.stringify(value));
    setRevision(0);
    setIsNew(true);
    setTab("company");
    setRecordError("");
    setCopyNotice("");
  }
  function closeEditor() {
    if (busy) return;
    if (dirty && !window.confirm(t("Discard the unsaved changes in this record?")))
      return;
    setDraft(null);
    setRecordError("");
  }
  function update<K extends keyof Lead>(field: K, value: Lead[K]) {
    setDraft((previous) => {
      if (!previous) return previous;
      const next = { ...previous, [field]: value };
      if (
        ["emailSubject", "emailBody", "followUpDraft"].includes(field) &&
        previous.approval === "Approved" &&
        value !== previous[field]
      ) {
        next.approval = "Not reviewed";
        next.approvedAt = "";
        next.approvedBy = "";
        if (next.stage === "Approved") next.stage = "Ready for review";
      }
      return next;
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.company.trim()) {
      setRecordError(t("Enter a company name."));
      setTab("company");
      return;
    }
    setBusy(true);
    setRecordError("");
    try {
      const [checked] = parseBackup({ schemaVersion: 1, records: [draft] });
      const result = await api(
        isNew
          ? "/api/records/"
          : `/api/records/${encodeURIComponent(draft.id)}/`,
        {
          method: isNew ? "POST" : "PUT",
          body: JSON.stringify({
            record: checked,
            requestId: checked.id,
            expectedRevision: revision,
          }),
        },
      );
      setRecords((previous) =>
        isNew
          ? [...previous, result.record]
          : previous.map((record) =>
              record.id === result.record.id ? result.record : record,
            ),
      );
      setRevisions((previous) => ({
        ...previous,
        [result.record.id]: result.revision,
      }));
      setNotice(t("{company} saved.", { company: result.record.company }));
      setDraft(null);
      setLoadedAt(
        new Date().toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (caught) {
      setRecordError(
        message(
          caught,
          "Save result is unconfirmed. Refresh the list before trying again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!draft || isNew) return;
    if (
      !window.confirm(
        t(
          "Delete {company}? This cannot be undone. Export a backup first if you need a copy.",
          { company: draft.company },
        ),
      )
    )
      return;
    setBusy(true);
    setRecordError("");
    try {
      await api(`/api/records/${encodeURIComponent(draft.id)}/`, {
        method: "DELETE",
        body: JSON.stringify({ expectedRevision: revision }),
      });
      setRecords((previous) =>
        previous.filter((record) => record.id !== draft.id),
      );
      setNotice(t("{company} deleted.", { company: draft.company }));
      setDraft(null);
    } catch (caught) {
      setRecordError(message(caught, "Deletion was not confirmed."));
    } finally {
      setBusy(false);
    }
  }
  async function copyDraft() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(
        `${draft.emailSubject}\n\n${draft.emailBody}`,
      );
      setCopyNotice(t("Copied. Paste it where you need it."));
    } catch {
      setCopyNotice(t("Copy is not available. Select the text and copy it."));
    }
  }
  async function exportBackup() {
    setBusy(true);
    setError("");
    try {
      const data = await api("/api/backup/");
      download(
        `baoore-agritrade-crm-${today()}.json`,
        JSON.stringify(data, null, 2),
        "application/json",
      );
      setNotice(t("Backup downloaded. Keep it somewhere private."));
    } catch (caught) {
      setError(message(caught, "Backup failed."));
    } finally {
      setBusy(false);
    }
  }
  async function importBackup(file: File) {
    setError("");
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error(t("Choose a JSON backup smaller than 4 MB."));
      const data = JSON.parse(await file.text());
      const incoming = parseBackup(data);
      if (
        !window.confirm(
          t(
            "Import {n} records? New companies are added. Existing ones and your edits stay as they are.",
            { n: incoming.length },
          ),
        )
      )
        return;
      setBusy(true);
      const result = await api("/api/import/", {
        method: "POST",
        body: JSON.stringify({ schemaVersion: 1, records: incoming }),
      });
      await loadRecords();
      setNotice(
        t("{added} new records imported. {skipped} already in the list.", {
          added: result.added,
          skipped: result.skipped,
        }),
      );
    } catch (caught) {
      setError(message(caught, "Import failed."));
    } finally {
      setBusy(false);
      if (importInput.current) importInput.current.value = "";
    }
  }
  const date = today();
  const needsReview = (record: Lead) =>
    record.approval !== "Approved" &&
    !["Closed", "Paused"].includes(record.stage);
  const isDue = (record: Lead) =>
    ["overdue", "today"].includes(followUpState(record, date));
  const hasReply = (record: Lead) =>
    Boolean(record.replyAt || record.stage === "Replied");
  const dueCount = records.filter(isDue).length;
  const reviewCount = records.filter(needsReview).length;
  const replyCount = records.filter(hasReply).length;
  const sentCount = records.filter((record) => record.sentAt).length;
  const filtered = useMemo(
    () =>
      sortForWork(
        records.filter((record) => {
          const search =
            `${record.company} ${record.contactName} ${record.contactEmail} ${record.contactPhone} ${record.geography} ${record.fit}`.toLowerCase();
          return (
            (!query || search.includes(query.toLowerCase())) &&
            (!typeFilter || record.organizationType === typeFilter) &&
            (!stageFilter || record.stage === stageFilter) &&
            (!productFilter || record.commodity === productFilter) &&
            (view === "all" ||
              (view === "review" && needsReview(record)) ||
              (view === "due" && isDue(record)) ||
              (view === "replies" && hasReply(record)))
          );
        }),
        date,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [records, query, typeFilter, stageFilter, productFilter, view, date],
  );
  const views: { id: View; icon: "grid" | "mail" | "clock" | "check"; label: string; count: number }[] = [
    { id: "all", icon: "grid", label: t("Companies"), count: records.length },
    { id: "review", icon: "mail", label: t("Draft review"), count: reviewCount },
    { id: "due", icon: "clock", label: t("Follow-ups"), count: dueCount },
    { id: "replies", icon: "check", label: t("Replies"), count: replyCount },
  ];

  if (session !== "ready")
    return (
      <main className="login-page">
        <div className="login-brand">
          <Brand t={t} />
          <LanguageSwitch lang={lang} setLang={setLang} t={t} />
        </div>
        <section className="login-card">
          <p className="eyebrow">{t("PRIVATE WORKSPACE")}</p>
          <h1>
            {t("Your next")}
            <br />
            <em>{t("conversation.")}</em>
          </h1>
          <p>{t("One place for your buyers, their requirements and the follow-up.")}</p>
          {session === "loading" ? (
            <p className="login-status">{t("Checking your session…")}</p>
          ) : session === "setup" ? (
            <div className="setup-note">
              <h2>{t("Set up access first.")}</h2>
              <p>
                {t("Run npm run setup on the server, save the password, then restart.")}
              </p>
            </div>
          ) : (
            <form onSubmit={signIn}>
              <label className="field">
                <span>{t("Password")}</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoFocus
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button dark" disabled={busy}>
                {busy ? t("Signing in…") : t("Open workspace")}
                <Icon name="arrow" />
              </button>
            </form>
          )}
        </section>
      </main>
    );

  const email = draft?.contactEmail.trim() || "";
  const phone = whatsappNumber(draft?.contactPhone || "");
  const mailHref = draft && email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(draft.emailSubject)}&body=${encodeURIComponent(draft.emailBody)}`
    : "";
  const waHref = draft && phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(draft.emailBody)}`
    : "";
  const emptyList = !records.length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand t={t} />
        <nav aria-label={t("Companies")}>
          {views.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "selected" : ""}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="sidebar-link"
            onClick={() => dataDialog.current?.showModal()}
          >
            <Icon name="download" />
            {t("Backup & data")}
          </button>
          <button className="sidebar-link" onClick={signOut} disabled={busy}>
            <Icon name="lock" />
            {t("Sign out")}
          </button>
        </div>
      </aside>
      <main className="workspace">
        <div className="workspace-top">
          <LanguageSwitch lang={lang} setLang={setLang} t={t} />
          <button
            onClick={refresh}
            disabled={busy}
            aria-label={t("Refresh records")}
            title={t("Refresh records")}
          >
            <Icon name="refresh" />
          </button>
        </div>
        <header className="workspace-heading">
          <div>
            <h1>
              {view === "all"
                ? t("Who to talk to next.")
                : view === "review"
                  ? t("Drafts to review.")
                  : view === "due"
                    ? t("Follow-ups due.")
                    : t("Buyers who replied.")}
            </h1>
          </div>
          <button className="button dark" onClick={add}>
            <Icon name="plus" />
            {t("Add company")}
          </button>
        </header>
        <section className="metrics" aria-label={t("Companies")}>
          <button onClick={() => setView("all")}>
            <span>{t("Companies")}</span>
            <strong>{records.length}</strong>
            <small>{t("in your list")}</small>
          </button>
          <button onClick={() => setView("review")}>
            <span>{t("Awaiting review")}</span>
            <strong>{reviewCount}</strong>
            <small>{t("drafts not approved yet")}</small>
          </button>
          <button onClick={() => setView("due")}>
            <span>{t("Follow-ups due")}</span>
            <strong>{dueCount}</strong>
            <small>{t("today or overdue")}</small>
          </button>
          <div>
            <span>{t("Emails sent")}</span>
            <strong>{sentCount}</strong>
            <small>{t("recorded by you")}</small>
          </div>
        </section>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="alert success" role="status">
            <Icon name="check" />
            {notice}
            <button
              onClick={() => setNotice("")}
              aria-label={t("Dismiss notification")}
            >
              ×
            </button>
          </div>
        )}
        <section className="list-section">
          <div className="list-title">
            <div>
              <h2>
                {view === "all"
                  ? t("Your companies")
                  : view === "review"
                    ? t("Drafts to review.")
                    : view === "due"
                      ? t("Follow-up list")
                      : t("Reply records")}
              </h2>
              <span>
                {t("{n} of {total} records", {
                  n: filtered.length,
                  total: records.length,
                })}
              </span>
            </div>
            <button
              className="text-button"
              onClick={exportBackup}
              disabled={busy}
            >
              {t("Export backup")}
              <Icon name="download" />
            </button>
          </div>
          <div className="filters">
            <label className="search-field">
              <Icon name="search" />
              <input
                type="search"
                aria-label={t("Search companies")}
                placeholder={t("Search company, contact or market…")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">{t("Product")}</span>
              <select
                value={productFilter}
                onChange={(event) => setProductFilter(event.target.value)}
              >
                <option value="">{t("All products")}</option>
                {commodities.map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t("Organization type")}</span>
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="">{t("All types")}</option>
                {organizationTypes.map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t("Stage")}</span>
              <select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value)}
              >
                <option value="">{t("All stages")}</option>
                {stages.map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-scroll">
            <table className="record-table">
              <thead>
                <tr>
                  <th>{t("Company / contact")}</th>
                  <th>{t("Organization")}</th>
                  <th>{t("Stage")}</th>
                  <th>{t("Approval")}</th>
                  <th>{t("Next follow-up")}</th>
                  <th>
                    <span className="sr-only">{t("Open record")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((record) => {
                  const due = followUpState(record, date);
                  return (
                    <tr key={record.id} onClick={() => edit(record)}>
                      <td className="cell-company">
                        <button
                          className="company-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            edit(record);
                          }}
                        >
                          <strong>{record.company}</strong>
                          <span>
                            {record.contactName ||
                              record.contactEmail ||
                              record.contactPhone ||
                              t("Contact details to add")}
                          </span>
                        </button>
                        {record.complianceGate && (
                          <span className="gate-label">{t("Review gate")}</span>
                        )}
                      </td>
                      <td className="cell-type">
                        <span className="organization-type">
                          {t(record.organizationType)}
                          {record.commodity && ` · ${t(record.commodity)}`}
                        </span>
                      </td>
                      <td className="cell-stage">
                        <Status value={record.stage} t={t} />
                      </td>
                      <td className="cell-approval">
                        <span
                          className={`approval-label ${record.approval === "Approved" ? "approved" : ""}`}
                        >
                          {t(record.approval)}
                        </span>
                      </td>
                      <td className="cell-date">
                        <span className={due === "overdue" ? "overdue" : ""}>
                          {shortDate(record.nextFollowUp, t)}
                        </span>
                        {due === "overdue" && (
                          <small className="due-note">{t("Overdue")}</small>
                        )}
                        {due === "today" && (
                          <small className="due-note">{t("Today")}</small>
                        )}
                      </td>
                      <td className="cell-arrow">
                        <span className="row-arrow">
                          <Icon name="arrow" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length && (
              <div className="empty-state">
                <h3>{emptyList ? t("No companies yet.") : t("No records in this view.")}</h3>
                <p>
                  {emptyList
                    ? t("Add your first buyer, or import a backup from Backup & data.")
                    : view === "due"
                      ? t("Set a next follow-up date in a company record.")
                      : t("Try another search or filter, or add a company.")}
                </p>
                {emptyList ? (
                  <button className="button dark" onClick={add}>
                    <Icon name="plus" />
                    {t("Add company")}
                  </button>
                ) : (
                  <button
                    className="text-button"
                    onClick={() => {
                      setView("all");
                      setQuery("");
                      setTypeFilter("");
                      setStageFilter("");
                      setProductFilter("");
                    }}
                  >
                    {t("Show all companies")}
                    <Icon name="arrow" />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="list-footnote">
            <span>{t("Last loaded {time}", { time: loadedAt || "—" })}</span>
          </div>
        </section>
      </main>
      <dialog
        ref={editor}
        className="record-panel"
        onCancel={(event) => {
          event.preventDefault();
          closeEditor();
        }}
      >
        {draft && (
          <form onSubmit={save}>
            <header className="panel-heading">
              <div>
                <p className="eyebrow">
                  {isNew ? t("NEW COMPANY") : t("COMPANY RECORD")}
                </p>
                <h2>{draft.company || t("A new buyer.")}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeEditor}
                aria-label={t("Close record")}
              >
                <Icon name="close" />
              </button>
            </header>
            <div
              className="panel-tabs"
              role="tablist"
              aria-label={t("Record sections")}
            >
              {(["company", "sources", "draft", "activity"] as const).map(
                (value) => (
                  <button
                    type="button"
                    key={value}
                    role="tab"
                    aria-selected={tab === value}
                    className={tab === value ? "active" : ""}
                    onClick={() => setTab(value)}
                  >
                    {value === "company"
                      ? t("Company")
                      : value === "sources"
                        ? t("Sources & fit")
                        : value === "draft"
                          ? t("Email drafts")
                          : t("Activity")}
                  </button>
                ),
              )}
            </div>
            <div className="panel-content">
              {draft.complianceGate && (
                <div className="gate-warning">
                  <strong>{t("Point to check before contact")}</strong>
                  <p>{draft.complianceGate}</p>
                </div>
              )}
              {tab === "company" && (
                <div className="field-grid">
                  <Field label={t("Company")} wide>
                    <input
                      value={draft.company}
                      onChange={(event) => update("company", event.target.value)}
                      maxLength={180}
                      required
                    />
                  </Field>
                  <Field label={t("Organization type")}>
                    <select
                      value={draft.organizationType}
                      onChange={(event) =>
                        update("organizationType", event.target.value)
                      }
                    >
                      {organizationTypes.map((value) => (
                        <option key={value} value={value}>
                          {t(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("Main product")}>
                    <select
                      value={draft.commodity}
                      onChange={(event) => update("commodity", event.target.value)}
                    >
                      <option value="">—</option>
                      {commodities.map((value) => (
                        <option key={value} value={value}>
                          {t(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("Contact name / team")}>
                    <input
                      value={draft.contactName}
                      onChange={(event) =>
                        update("contactName", event.target.value)
                      }
                    />
                  </Field>
                  <Field label={t("Planned channel")}>
                    <select
                      value={draft.plannedChannel}
                      onChange={(event) =>
                        update("plannedChannel", event.target.value)
                      }
                    >
                      {channels.map((value) => (
                        <option key={value} value={value}>
                          {t(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("Contact email")}>
                    <input
                      type="email"
                      inputMode="email"
                      value={draft.contactEmail}
                      onChange={(event) =>
                        update("contactEmail", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    label={t("Contact phone / WhatsApp")}
                    hint={t("With country code, e.g. +44 20 1234 5678")}
                  >
                    <input
                      type="tel"
                      inputMode="tel"
                      value={draft.contactPhone}
                      onChange={(event) =>
                        update("contactPhone", event.target.value)
                      }
                    />
                  </Field>
                  <Field label={t("Stage")}>
                    <select
                      value={draft.stage}
                      onChange={(event) => update("stage", event.target.value)}
                    >
                      {stages.map((value) => (
                        <option key={value} value={value}>
                          {t(value)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("Next follow-up date")}>
                    <input
                      type="date"
                      value={draft.nextFollowUp}
                      onChange={(event) =>
                        update("nextFollowUp", event.target.value)
                      }
                    />
                  </Field>
                  <Field label={t("Next action")} wide>
                    <textarea
                      rows={2}
                      value={draft.nextAction}
                      onChange={(event) =>
                        update("nextAction", event.target.value)
                      }
                    />
                  </Field>
                  <Field label={t("Company or contact page")} wide>
                    <input
                      type="url"
                      placeholder="https://…"
                      value={draft.website}
                      onChange={(event) => update("website", event.target.value)}
                    />
                  </Field>
                  <Field label={t("Market / geography")} wide>
                    <textarea
                      rows={2}
                      value={draft.geography}
                      onChange={(event) =>
                        update("geography", event.target.value)
                      }
                    />
                  </Field>
                </div>
              )}
              {tab === "sources" && (
                <>
                  <div className="field-grid">
                    <Field label={t("Fit and caveats")} wide>
                      <textarea
                        rows={5}
                        value={draft.fit}
                        onChange={(event) => update("fit", event.target.value)}
                      />
                    </Field>
                    <Field
                      label={t("Source URLs")}
                      hint={t("One link per line.")}
                      wide
                    >
                      <textarea
                        rows={4}
                        value={draft.sources.join("\n")}
                        onChange={(event) =>
                          update("sources", event.target.value.split("\n"))
                        }
                      />
                    </Field>
                  </div>
                  <div className="source-list">
                    {draft.sources.filter(Boolean).map((url, index) => (
                      <ExternalLink key={index} url={url} t={t} />
                    ))}
                  </div>
                  <div className="field-grid">
                    <Field label={t("What the sources show")} wide>
                      <textarea
                        rows={6}
                        value={draft.sourceNotes}
                        onChange={(event) =>
                          update("sourceNotes", event.target.value)
                        }
                      />
                    </Field>
                    <Field label={t("Point to check before contact")} wide>
                      <textarea
                        rows={3}
                        value={draft.complianceGate}
                        onChange={(event) =>
                          update("complianceGate", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </>
              )}
              {tab === "draft" && (
                <>
                  <div className="field-grid">
                    <Field label={t("Subject")} wide>
                      <input
                        value={draft.emailSubject}
                        onChange={(event) =>
                          update("emailSubject", event.target.value)
                        }
                      />
                    </Field>
                    <Field
                      label={t("First email")}
                      hint={t("Editing an approved draft sets it back to Not reviewed.")}
                      wide
                    >
                      <textarea
                        className="email-editor"
                        rows={12}
                        value={draft.emailBody}
                        onChange={(event) =>
                          update("emailBody", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                  <div className="draft-actions">
                    {mailHref && (
                      <a className="button dark" href={mailHref}>
                        <Icon name="mail" />
                        {t("Open in email")}
                      </a>
                    )}
                    {waHref && (
                      <a
                        className="button whatsapp"
                        href={waHref}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Icon name="chat" />
                        {t("Send on WhatsApp")}
                      </a>
                    )}
                    <button
                      type="button"
                      className="button outline"
                      onClick={copyDraft}
                      disabled={!draft.emailBody}
                    >
                      <Icon name="copy" />
                      {t("Copy")}
                    </button>
                    <span role="status">
                      {copyNotice ||
                        (!mailHref && !waHref
                          ? t("Add an email or phone number on the Company tab to send from here.")
                          : "")}
                    </span>
                  </div>
                  <div className="field-grid">
                    <Field label={t("Follow-up draft")} wide>
                      <textarea
                        rows={5}
                        value={draft.followUpDraft}
                        onChange={(event) =>
                          update("followUpDraft", event.target.value)
                        }
                      />
                    </Field>
                    <Field label={t("Approval status")}>
                      <select
                        value={draft.approval}
                        onChange={(event) =>
                          update("approval", event.target.value)
                        }
                      >
                        {approvals.map((value) => (
                          <option key={value} value={value}>
                            {t(value)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t("Approved by")}>
                      <input
                        value={draft.approvedBy}
                        onChange={(event) =>
                          update("approvedBy", event.target.value)
                        }
                      />
                    </Field>
                    <Field label={t("Approval date")}>
                      <input
                        type="date"
                        value={draft.approvedAt}
                        onChange={(event) =>
                          update("approvedAt", event.target.value)
                        }
                      />
                    </Field>
                  </div>
                </>
              )}
              {tab === "activity" && (
                <div className="field-grid">
                  <Field label={t("Date sent")}>
                    <input
                      type="date"
                      value={draft.sentAt}
                      onChange={(event) => update("sentAt", event.target.value)}
                    />
                  </Field>
                  <Field label={t("Sent from")}>
                    <input
                      value={draft.sender}
                      onChange={(event) => update("sender", event.target.value)}
                      placeholder={t("Email address or number used")}
                    />
                  </Field>
                  <Field label={t("Reply received")}>
                    <input
                      type="date"
                      value={draft.replyAt}
                      onChange={(event) => update("replyAt", event.target.value)}
                    />
                  </Field>
                  <Field label={t("Sample status")}>
                    <input
                      value={draft.sampleStatus}
                      onChange={(event) =>
                        update("sampleStatus", event.target.value)
                      }
                    />
                  </Field>
                  <Field label={t("What they said")} wide>
                    <textarea
                      rows={4}
                      value={draft.replySummary}
                      onChange={(event) =>
                        update("replySummary", event.target.value)
                      }
                    />
                  </Field>
                  <Field label={t("Buyer requirements")} wide>
                    <textarea
                      rows={4}
                      value={draft.requirements}
                      onChange={(event) =>
                        update("requirements", event.target.value)
                      }
                    />
                  </Field>
                  <Field label={t("Conversation link")} wide>
                    <input
                      type="url"
                      value={draft.threadUrl}
                      onChange={(event) =>
                        update("threadUrl", event.target.value)
                      }
                    />
                  </Field>
                  <Field label={t("Internal notes")} wide>
                    <textarea
                      rows={6}
                      value={draft.notes}
                      onChange={(event) => update("notes", event.target.value)}
                    />
                  </Field>
                </div>
              )}
              {recordError && (
                <p className="form-error" role="alert">
                  {recordError}
                </p>
              )}
            </div>
            <footer className="panel-footer">
              <div>
                <span className={dirty ? "unsaved" : "saved"}>
                  {dirty
                    ? t("Unsaved changes")
                    : isNew
                      ? t("New record, not saved")
                      : t("Saved")}
                </span>
                {!isNew && (
                  <button
                    type="button"
                    className="delete-button"
                    onClick={remove}
                    disabled={busy}
                  >
                    {t("Delete record")}
                  </button>
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="button subtle"
                  onClick={closeEditor}
                  disabled={busy}
                >
                  {t("Cancel")}
                </button>
                <button className="button dark" type="submit" disabled={busy}>
                  {busy ? t("Saving…") : t("Save record")}
                  <Icon name="check" />
                </button>
              </div>
            </footer>
          </form>
        )}
      </dialog>

      <dialog ref={dataDialog} className="data-dialog">
        <button
          className="dialog-close"
          onClick={() => dataDialog.current?.close()}
          aria-label={t("Close")}
        >
          <Icon name="close" />
        </button>
        <p className="eyebrow">{t("BACKUP & DATA")}</p>
        <h2>{t("Keep a copy of your list.")}</h2>
        <p>
          {t(
            "Your records are saved on the server. Download a backup now and then, and keep it somewhere private.",
          )}
        </p>
        <div className="backup-actions">
          <button
            className="button dark"
            onClick={exportBackup}
            disabled={busy}
          >
            {t("Download JSON backup")}
            <Icon name="download" />
          </button>
          <button
            className="button outline"
            onClick={() => {
              download(
                `baoore-agritrade-summary-${today()}.csv`,
                summaryCsv(records),
                "text/csv",
              );
              setNotice(t("CSV summary downloaded. Use JSON for a complete backup."));
            }}
          >
            {t("Download CSV summary")}
          </button>
          <button
            className="text-button"
            onClick={() => importInput.current?.click()}
          >
            {t("Import new records from a JSON backup")}
            <Icon name="arrow" />
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
            }}
          />
        </div>
        <p className="fine-print">
          {t(
            "Import only adds companies that are not in the list yet. It never overwrites your edits.",
          )}
        </p>
      </dialog>
    </div>
  );
}
