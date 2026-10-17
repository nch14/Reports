import { createContext, useContext, type Child, type FC } from "hono/jsx";
import { raw } from "hono/html";
import { DEFAULT_LOCALE, LOCALES, type Locale, type Messages } from "../i18n/index.js";
import { renderMarkdown } from "../render.js";
import type { Agent, Report, ReportVersion } from "../store.js";
import { ASSET_VERSION } from "./assets.js";

// ---- i18n ----

export interface PageContext {
  locale: Locale;
  /** Current path and query, so the language switcher can return here. */
  path: string;
}

export const PageCtx = createContext<PageContext>({ locale: DEFAULT_LOCALE, path: "/" });

function useI18n(): { t: Messages; intl: string; path: string } {
  const { locale, path } = useContext(PageCtx);
  return { t: locale.messages, intl: locale.code, path };
}

/** Fills {name} placeholders in a message with text or elements. */
function rich(template: string, parts: Record<string, Child>): Child[] {
  return template.split(/\{(\w+)\}/).map((piece, i) => (i % 2 ? parts[piece] : piece));
}

// ---- helpers ----

export interface Filters {
  q?: string;
  tags: string[];
  project?: string;
  agent?: string;
  from?: string;
  to?: string;
  sort: "newest" | "oldest";
  page: number;
}

export function filtersUrl(f: Filters, change: Partial<Filters> = {}): string {
  const next = { ...f, page: 1, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  for (const t of next.tags) params.append("tag", t);
  if (next.project) params.set("project", next.project);
  if (next.agent) params.set("agent", next.agent);
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.sort !== "newest") params.set("sort", next.sort);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

/** Stable color slot for a name, matching the .hue-N classes. */
function hue(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hue-${h % 8}`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]!.toUpperCase())
    .join("") || "?";

/** Agents write in any language; tagging CJK content lets the browser pick the right fonts and line breaking. */
const langOf = (...texts: string[]) => (/[㐀-鿿豈-﫿]/.test(texts.join(" ")) ? "zh" : undefined);

// Dates render in the server's time zone (set TZ in the environment to change it).
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");
const clock = (iso: string, intl: string) =>
  new Date(iso).toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fullDate = (iso: string, intl: string) =>
  new Date(iso).toLocaleString(intl, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function ago(iso: string, intl: string): string {
  const rtf = new Intl.RelativeTimeFormat(intl, { numeric: "auto" });
  const s = (Date.parse(iso) - Date.now()) / 1000;
  if (s > -60) return rtf.format(0, "second");
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}

function dayLabel(key: string, t: Messages, intl: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const long = new Date(`${key}T12:00:00`).toLocaleDateString(intl, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: key.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  });
  if (key === today) return `${t.list.today} · ${long}`;
  if (key === yesterday) return `${t.list.yesterday} · ${long}`;
  return long;
}

// Minimal line icons (Lucide paths).
const ICONS = {
  logo: <><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" /><path d="M9 13h6M9 17h4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></>,
  code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 8V4M9 14h.01M15 14h.01" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  sort: <path d="m3 16 4 4 4-4M7 20V4M21 8l-4-4-4 4M17 4v16" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
};
const Icon: FC<{ name: keyof typeof ICONS }> = ({ name }) => (
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[name]}</svg>
);

const Avatar: FC<{ name: string; size?: "lg" }> = ({ name, size }) => (
  <span class={`avatar ${hue(name)}${size ? ` ${size}` : ""}`} title={name}>{initials(name)}</span>
);

// ---- layout ----

const LanguageSwitcher: FC = () => {
  const { locale, path } = useContext(PageCtx);
  return (
    <form method="get" action="/lang" class="lang">
      <input type="hidden" name="next" value={path} />
      <Icon name="globe" />
      <select name="code" data-autosubmit="" aria-label={locale.messages.nav.language}>
        {LOCALES.map((l) => <option value={l.code} selected={l.code === locale.code}>{l.name}</option>)}
      </select>
    </form>
  );
};

export const Layout: FC<{ title: string; nav?: "reports" | "agents"; children?: Child }> = ({ title, nav, children }) => {
  const { t, intl } = useI18n();
  return (
    <>
      {raw("<!doctype html>")}
      <html lang={intl}>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{title === t.appName ? title : `${title} · ${t.appName}`}</title>
          <link rel="stylesheet" href={`/assets/style.css?v=${ASSET_VERSION}`} />
          <script src={`/assets/app.js?v=${ASSET_VERSION}`} defer></script>
        </head>
        <body>
          {nav && (
            <header class="top">
              <div class="wrap">
                <a class="brand" href="/"><span class="logo"><Icon name="logo" /></span>{t.appName}</a>
                <nav class="tabs">
                  <a href="/" class={nav === "reports" ? "active" : ""}><Icon name="list" /><span>{t.nav.reports}</span></a>
                  <a href="/agents" class={nav === "agents" ? "active" : ""}><Icon name="bot" /><span>{t.nav.agents}</span></a>
                </nav>
                <div class="spacer"></div>
                <LanguageSwitcher />
                <form method="post" action="/logout">
                  <button class="ghost small" type="submit">{t.nav.logout}</button>
                </form>
              </div>
            </header>
          )}
          <main class="wrap">{children}</main>
        </body>
      </html>
    </>
  );
};

export const LoginPage: FC<{ next: string; error?: string }> = ({ next, error }) => {
  const { t } = useI18n();
  return (
    <Layout title={t.login.title}>
      <div class="login">
        <div class="logo"><Icon name="logo" /></div>
        <h1>{t.appName}</h1>
        <p>{t.login.tagline}</p>
        <form method="post" action="/login">
          <input type="hidden" name="next" value={next} />
          <input type="password" name="password" placeholder={t.login.password} autofocus required autocomplete="current-password" />
          {error && <div class="error">{error}</div>}
          <button class="primary" type="submit">{t.login.submit}</button>
        </form>
        <div class="login-lang"><LanguageSwitcher /></div>
      </div>
    </Layout>
  );
};

// ---- list ----

/** Keeps the other filters when a form only edits one of them. */
const HiddenFilters: FC<{ f: Filters; omit: (keyof Filters)[] }> = ({ f, omit }) => (
  <>
    {!omit.includes("q") && f.q && <input type="hidden" name="q" value={f.q} />}
    {!omit.includes("tags") && f.tags.map((t) => <input type="hidden" name="tag" value={t} />)}
    {!omit.includes("project") && f.project && <input type="hidden" name="project" value={f.project} />}
    {!omit.includes("agent") && f.agent && <input type="hidden" name="agent" value={f.agent} />}
    {!omit.includes("from") && f.from && <input type="hidden" name="from" value={f.from} />}
    {!omit.includes("to") && f.to && <input type="hidden" name="to" value={f.to} />}
    {!omit.includes("sort") && f.sort !== "newest" && <input type="hidden" name="sort" value={f.sort} />}
  </>
);

const ReportRow: FC<{ r: Report; f: Filters }> = ({ r, f }) => {
  const { t, intl } = useI18n();
  return (
    <li class="entry">
      <div class="when">{clock(r.created_at, intl)}</div>
      <div class={`dot ${r.project ? hue(r.project) : ""}`}></div>
      <div class={`item ${r.project ? hue(r.project) : ""}`}>
        <a class="item-link" href={`/reports/${r.id}`} lang={langOf(r.title, r.summary)}>
          <span class="item-title">
            {r.format === "html" && <span class="kind" title={t.list.htmlReport}><Icon name="code" /></span>}
            {r.title}
          </span>
          {r.summary && <span class="item-summary">{r.summary}</span>}
        </a>
        <div class="item-meta">
          {r.project && (
            <a class={`chip project ${hue(r.project)}`} href={filtersUrl(f, { project: r.project })}>{r.project}</a>
          )}
          {r.tags.map((tag) => (
            <a class={`tag ${hue(tag)}${f.tags.includes(tag) ? " on" : ""}`} href={filtersUrl(f, { tags: toggle(f.tags, tag) })}>#{tag}</a>
          ))}
          <span class="by">
            <Avatar name={r.agent_name} />
            {r.agent_name}
            {r.version > 1 && <span class="rev" title={t.list.revised(r.version)}><Icon name="history" />v{r.version}</span>}
          </span>
        </div>
      </div>
    </li>
  );
};

export const ListPage: FC<{
  reports: Report[];
  total: number;
  pageSize: number;
  tags: { tag: string; count: number }[];
  projects: { project: string; count: number }[];
  agents: Agent[];
  f: Filters;
}> = ({ reports, total, pageSize, tags, projects, agents, f }) => {
  const { t, intl } = useI18n();
  const days: { key: string; items: Report[] }[] = [];
  for (const r of reports) {
    const key = dayKey(r.created_at);
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push(r);
    else days.push({ key, items: [r] });
  }
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const active: { label: string; href: string }[] = [
    ...(f.q ? [{ label: `“${f.q}”`, href: filtersUrl(f, { q: undefined }) }] : []),
    ...f.tags.map((tag) => ({ label: `#${tag}`, href: filtersUrl(f, { tags: toggle(f.tags, tag) }) })),
    ...(f.project ? [{ label: f.project, href: filtersUrl(f, { project: undefined }) }] : []),
    ...(f.agent ? [{ label: agentName(f.agent), href: filtersUrl(f, { agent: undefined }) }] : []),
    ...(f.from ? [{ label: t.list.fromDate(f.from), href: filtersUrl(f, { from: undefined }) }] : []),
    ...(f.to ? [{ label: t.list.toDate(f.to), href: filtersUrl(f, { to: undefined }) }] : []),
  ];
  const shownFrom = (f.page - 1) * pageSize;
  const hasMore = shownFrom + reports.length < total;

  return (
    <Layout title={t.appName} nav="reports">
      <div class="list-layout">
        <aside class="sidebar">
          <section>
            <h3>{t.list.tags}</h3>
            {tags.length === 0 ? <p class="none">{t.list.noTags}</p> : (
              <div class="tag-cloud">
                {tags.map(({ tag, count }) => (
                  <a class={`tag ${hue(tag)}${f.tags.includes(tag) ? " on" : ""}`} href={filtersUrl(f, { tags: toggle(f.tags, tag) })}>
                    #{tag}<span class="n">{count}</span>
                  </a>
                ))}
              </div>
            )}
          </section>
          {projects.length > 0 && (
            <section>
              <h3>{t.list.projects}</h3>
              <ul class="facet">
                {projects.map(({ project, count }) => (
                  <li>
                    <a class={f.project === project ? "on" : ""} href={filtersUrl(f, { project: f.project === project ? undefined : project })}>
                      <span class={`swatch ${hue(project)}`}></span>{project}<span class="n">{count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {agents.length > 0 && (
            <section>
              <h3>{t.list.agents}</h3>
              <ul class="facet">
                {agents.map((a) => (
                  <li>
                    <a class={f.agent === a.id ? "on" : ""} href={filtersUrl(f, { agent: f.agent === a.id ? undefined : a.id })}>
                      <Avatar name={a.name} />{a.name}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h3>{t.list.date}</h3>
            <form method="get" action="/" class="dates">
              <HiddenFilters f={f} omit={["from", "to"]} />
              <label>{t.list.from}<input type="date" name="from" value={f.from ?? ""} data-autosubmit="" /></label>
              <label>{t.list.to}<input type="date" name="to" value={f.to ?? ""} data-autosubmit="" /></label>
            </form>
          </section>
        </aside>

        <div class="timeline-col">
          <div class="toolbar">
            <form method="get" action="/" class="search">
              <HiddenFilters f={f} omit={["q"]} />
              <Icon name="search" />
              <input type="search" name="q" placeholder={t.list.search} value={f.q ?? ""} />
            </form>
            <a class="button" href={filtersUrl(f, { sort: f.sort === "newest" ? "oldest" : "newest" })}>
              <Icon name="sort" />{f.sort === "newest" ? t.list.newestFirst : t.list.oldestFirst}
            </a>
          </div>

          <div class="result-line">
            <span>{t.list.count(total)}</span>
            {active.map((a) => (
              <a class="active-filter" href={a.href}>{a.label}<Icon name="x" /></a>
            ))}
            {active.length > 1 && <a class="clear" href="/">{t.list.clearAll}</a>}
          </div>

          {reports.length === 0 ? (
            <div class="empty">
              <div class="logo"><Icon name="logo" /></div>
              {active.length > 0
                ? rich(t.list.noMatches, { clear: <a href="/">{t.list.clearFilters}</a> })
                : agents.length === 0
                  ? rich(t.list.emptyNoAgents, { connect: <a href="/agents">{t.list.connectAgent}</a> })
                  : t.list.empty}
            </div>
          ) : (
            days.map((d) => (
              <section class="day">
                <h2 class="day-label">{dayLabel(d.key, t, intl)}<span class="n">{d.items.length}</span></h2>
                <ol class="entries">{d.items.map((r) => <ReportRow r={r} f={f} />)}</ol>
              </section>
            ))
          )}

          {(f.page > 1 || hasMore) && (
            <div class="pager">
              {f.page > 1 ? <a class="button" href={filtersUrl(f, { page: f.page - 1 })}><Icon name="left" />{t.list.previous}</a> : <span></span>}
              <span class="muted small">{t.list.range(shownFrom + 1, shownFrom + reports.length, total)}</span>
              {hasMore ? <a class="button" href={filtersUrl(f, { page: f.page + 1 })}>{t.list.next}<Icon name="right" /></a> : <span></span>}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

// ---- detail ----

export const ReportPage: FC<{
  report: Report;
  shown: ReportVersion;
  versions: Omit<ReportVersion, "body">[];
  neighbors: { newer?: Pick<Report, "id" | "title">; older?: Pick<Report, "id" | "title"> };
}> = ({ report, shown, versions, neighbors }) => {
  const { t, intl } = useI18n();
  const none: Filters = { tags: [], sort: "newest", page: 1 };
  const isLatest = shown.version === report.version;
  return (
    <Layout title={shown.title} nav="reports">
      <div class="detail">
        <a class="back" href="/"><Icon name="left" />{t.report.back}</a>
        <header class={`report-head ${report.project ? hue(report.project) : ""}`}>
          <div class="chips">
            {report.project && <a class={`chip project ${hue(report.project)}`} href={filtersUrl(none, { project: report.project })}>{report.project}</a>}
            {report.tags.map((tag) => <a class={`tag ${hue(tag)}`} href={filtersUrl(none, { tags: [tag] })}>#{tag}</a>)}
            {report.format === "html" && <span class="chip plain"><Icon name="code" />{t.report.html}</span>}
          </div>
          <h1 lang={langOf(shown.title)}>{shown.title}</h1>
          {report.summary && <p class="lead" lang={langOf(report.summary)}>{report.summary}</p>}
          <div class="meta">
            <span class="by"><Avatar name={shown.agent_name} size="lg" /><span><b>{shown.agent_name}</b><br />{fullDate(report.created_at, intl)}</span></span>
            <div class="actions">
              {versions.length > 1 && (
                <form method="get" action={`/reports/${report.id}`}>
                  <select name="v" data-autosubmit="" aria-label={t.report.version}>
                    {versions.map((v) => (
                      <option value={String(v.version)} selected={v.version === shown.version}>
                        v{v.version}{v.version === report.version ? ` (${t.report.latest})` : ""} · {fullDate(v.created_at, intl)}{v.note ? ` · ${v.note}` : ""}
                      </option>
                    ))}
                  </select>
                </form>
              )}
              <form method="post" action={`/reports/${report.id}/delete`} data-confirm={t.report.confirmDelete}>
                <button class="ghost danger small" type="submit"><Icon name="trash" />{t.report.delete}</button>
              </form>
            </div>
          </div>
        </header>

        {!isLatest && (
          <div class="notice">
            <Icon name="history" />
            <span>
              {t.report.viewingOld(shown.version, fullDate(shown.created_at, intl))}
              {shown.note ? ` (${shown.note})` : ""}{" "}
              <a href={`/reports/${report.id}`}>{t.report.showLatest(report.version)}</a>
            </span>
          </div>
        )}

        {shown.format === "html" ? (
          <iframe
            class="report-frame"
            src={`/reports/${report.id}/frame?v=${shown.version}`}
            sandbox="allow-scripts allow-popups"
            referrerpolicy="no-referrer"
            title={shown.title}
          ></iframe>
        ) : (
          <article class="prose" lang={langOf(shown.body)}>{raw(renderMarkdown(shown.body))}</article>
        )}

        <nav class="neighbors">
          {neighbors.older ? (
            <a class="older" href={`/reports/${neighbors.older.id}`}><small><Icon name="left" />{t.report.older}</small>{neighbors.older.title}</a>
          ) : <span></span>}
          {neighbors.newer ? (
            <a class="newer" href={`/reports/${neighbors.newer.id}`}><small>{t.report.newer}<Icon name="right" /></small>{neighbors.newer.title}</a>
          ) : <span></span>}
        </nav>
      </div>
    </Layout>
  );
};

// ---- agents ----

function snippets(t: Messages, publicUrl: string, token: string) {
  const mcpUrl = `${publicUrl}/mcp`;
  return [
    {
      name: t.agents.snippetClaude,
      code: `claude mcp add --transport http --scope user reports ${mcpUrl} \\\n  --header "Authorization: Bearer ${token}"`,
    },
    {
      name: t.agents.snippetCodex,
      code: `[mcp_servers.reports]\nurl = "${mcpUrl}"\nbearer_token_env_var = "REPORTS_TOKEN"`,
    },
    {
      name: t.agents.snippetOther,
      code: JSON.stringify(
        { mcpServers: { reports: { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } } },
        null,
        2,
      ),
    },
  ];
}

export const AgentsPage: FC<{ agents: Agent[]; publicUrl: string; created?: { agent: Agent; token: string } }> = ({
  agents,
  publicUrl,
  created,
}) => {
  const { t, intl } = useI18n();
  return (
    <Layout title={t.agents.title} nav="agents">
      <div class="narrow">
        <div class="page-head">
          <h1>{t.agents.title}</h1>
          <p>{t.agents.intro}</p>
        </div>

        {created && (
          <div class="panel">
            <div class="token">
              <strong>{t.agents.tokenFor(created.agent.name)}</strong> — {t.agents.tokenOnce}
              <code>{created.token}</code>
            </div>
            {snippets(t, publicUrl, created.token).map((s) => (
              <>
                <div class="snippet-title">{s.name}</div>
                <pre class="snippet">{s.code}</pre>
              </>
            ))}
          </div>
        )}

        <div class="panel">
          <h2>{t.agents.newAgent}</h2>
          <form method="post" action="/agents" class="create-row">
            <input type="text" name="name" required maxlength={60} placeholder={t.agents.namePlaceholder} />
            <button class="primary" type="submit">{t.agents.create}</button>
          </form>
        </div>

        {agents.length > 0 && (
          <div class="panel">
            <h2>{t.agents.connected}</h2>
            <div class="agent-list">
              {agents.map((a) => (
                <div class={`agent${a.revoked_at ? " revoked" : ""}`}>
                  <Avatar name={a.name} size="lg" />
                  <div class="info">
                    <div class="name">{a.name}{a.revoked_at && ` (${t.agents.revoked})`}</div>
                    <div class="sub">
                      {t.agents.created(ago(a.created_at, intl))} · {a.last_used_at ? t.agents.lastUsed(ago(a.last_used_at, intl)) : t.agents.neverUsed}
                    </div>
                  </div>
                  {!a.revoked_at && (
                    <form method="post" action={`/agents/${a.id}/revoke`} data-confirm={t.agents.confirmRevoke(a.name)}>
                      <button class="ghost danger small" type="submit">{t.agents.revoke}</button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div class="panel">
          <h2>{t.agents.endpoint}</h2>
          <p>{rich(t.agents.endpointText, { url: <code>{publicUrl}/mcp</code>, header: <code>Authorization: Bearer &lt;token&gt;</code> })}</p>
        </div>
      </div>
    </Layout>
  );
};

export const NotFoundPage: FC = () => {
  const { t } = useI18n();
  return (
    <Layout title={t.notFound.title} nav="reports">
      <div class="empty">
        <h1>{t.notFound.title}</h1>
        <p><a href="/">{t.notFound.back}</a></p>
      </div>
    </Layout>
  );
};
