import crypto from "node:crypto";

export const STYLE = `
:root {
  --bg: #f6f7fc; --surface: #ffffff; --text: #1d2040; --text-2: #474b6b; --muted: #8a8fae;
  --border: #e7e9f3; --border-strong: #d5d8e8;
  --accent: #5b5bf6; --accent-soft: #eef0ff; --accent-ink: #4338ca;
  --warn: #ea6a12; --warn-soft: #fff2e5; --ok: #10a36b; --ok-soft: #e3f8ef; --danger: #e5484d; --danger-soft: #ffeef0;
  --code-bg: #f4f5fb;
  --shadow-sm: 0 1px 2px rgba(29, 32, 64, 0.04), 0 1px 3px rgba(29, 32, 64, 0.06);
  --shadow: 0 2px 4px rgba(29, 32, 64, 0.03), 0 8px 24px rgba(29, 32, 64, 0.07);
  --shadow-lg: 0 4px 8px rgba(29, 32, 64, 0.04), 0 16px 40px rgba(29, 32, 64, 0.10);
  --radius: 16px;
  color-scheme: light;
}
* { box-sizing: border-box; }
form { margin: 0; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; color: var(--text); min-height: 100vh;
  font: 15px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  background:
    radial-gradient(900px 480px at 0% -10%, #e4e6ff 0, transparent 60%),
    radial-gradient(800px 460px at 100% -5%, #fde4f3 0, transparent 55%),
    radial-gradient(700px 400px at 50% 0%, #e0f4ff 0, transparent 60%),
    var(--bg);
  background-attachment: fixed;
}
a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-ink); }
svg.icon { width: 16px; height: 16px; flex: none; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vertical-align: -3px; }

/* ---- header ---- */
header.top { position: sticky; top: 0; z-index: 10; background: rgba(255, 255, 255, 0.72); backdrop-filter: saturate(180%) blur(14px); -webkit-backdrop-filter: saturate(180%) blur(14px); border-bottom: 1px solid rgba(231, 233, 243, 0.8); }
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
header.top .wrap { display: flex; align-items: center; gap: 24px; height: 64px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.05rem; color: var(--text); letter-spacing: -0.01em; }
.brand:hover { color: var(--text); }
.logo { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #6366f1, #a855f7 55%, #ec4899); box-shadow: 0 4px 12px rgba(139, 92, 246, 0.35); }
.logo svg.icon { width: 18px; height: 18px; }
nav.tabs { display: flex; gap: 4px; padding: 4px; background: rgba(238, 240, 255, 0.7); border-radius: 12px; }
nav.tabs a { display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 9px; color: var(--text-2); font-size: 0.9rem; font-weight: 500; }
nav.tabs a:hover { color: var(--text); }
nav.tabs a.active { background: var(--surface); color: var(--accent-ink); box-shadow: var(--shadow-sm); }
header.top .spacer { flex: 1; }
header.top form { display: flex; }
.lang { position: relative; display: flex; align-items: center; }
.lang svg.icon { position: absolute; left: 10px; color: var(--muted); pointer-events: none; width: 15px; height: 15px; }
.lang select { font-size: 0.84rem; padding: 6px 28px 6px 31px; border-radius: 10px; background-color: rgba(255, 255, 255, 0.7); background-position: right 10px center; color: var(--text-2); font-weight: 500; }
.login-lang { display: flex; justify-content: center; margin-top: 18px; }

main.wrap { padding-top: 32px; padding-bottom: 80px; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0; letter-spacing: -0.02em; }
h2 { font-size: 1.05rem; margin: 0; letter-spacing: -0.01em; }
.muted { color: var(--muted); }
.small { font-size: 0.85rem; }

/* ---- controls ---- */
button, .button {
  font: inherit; font-size: 0.9rem; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 10px; cursor: pointer; line-height: 1.2;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-2); box-shadow: var(--shadow-sm);
  transition: background 0.15s, border-color 0.15s, color 0.15s, transform 0.1s;
}
button:hover, .button:hover { border-color: var(--border-strong); color: var(--text); }
button:active { transform: translateY(1px); }
button.primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); border-color: transparent; color: #fff; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3); }
button.primary:hover { color: #fff; filter: brightness(1.06); }
button.ghost { background: transparent; border-color: transparent; box-shadow: none; color: var(--muted); }
button.ghost:hover { background: var(--accent-soft); color: var(--accent-ink); }
button.danger:hover { background: var(--danger-soft); color: var(--danger); border-color: transparent; }
button.small { padding: 5px 10px; font-size: 0.82rem; }
input[type=text], input[type=password], input[type=search], select, textarea {
  font: inherit; font-size: 0.92rem; padding: 9px 12px; border: 1px solid var(--border); border-radius: 12px;
  background: var(--surface); color: var(--text); max-width: 100%; transition: border-color 0.15s, box-shadow 0.15s;
}
input:focus, select:focus, textarea:focus { outline: none; border-color: #a5a8fb; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.12); }
select { appearance: none; padding-right: 32px; cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8fae' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }
textarea { width: 100%; min-height: 84px; resize: vertical; line-height: 1.55; }
form.inline { display: inline-flex; }

/* ---- chips ---- */
.chip { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--code-bg); color: var(--text-2); white-space: nowrap; }
.chip::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: 0.85; }
.chip.plain::before { display: none; }

/* Project and agent colors, picked by hashing the name. */
.hue-0 { --h: #f43f5e; --h-soft: #ffe9ed; } .hue-1 { --h: #f97316; --h-soft: #fff0e3; }
.hue-2 { --h: #d99a06; --h-soft: #fff6d6; } .hue-3 { --h: #16a34a; --h-soft: #e3f8e9; }
.hue-4 { --h: #0891b2; --h-soft: #dff6fb; } .hue-5 { --h: #2563eb; --h-soft: #e3edff; }
.hue-6 { --h: #7c3aed; --h-soft: #efe8ff; } .hue-7 { --h: #db2777; --h-soft: #ffe7f3; }
.chip.project { background: var(--h-soft); color: var(--h); }
.avatar { width: 24px; height: 24px; border-radius: 50%; display: inline-grid; place-items: center; flex: none; font-size: 0.68rem; font-weight: 700; color: #fff; background: var(--h); }
.avatar.lg { width: 34px; height: 34px; font-size: 0.85rem; }

/* ---- list ---- */
.list-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 28px; }
@media (min-width: 900px) { .list-layout { grid-template-columns: 250px minmax(0, 1fr); align-items: start; } }
.sidebar { display: grid; gap: 22px; }
@media (min-width: 900px) { .sidebar { position: sticky; top: 88px; max-height: calc(100vh - 104px); overflow-y: auto; padding-right: 4px; } }
.sidebar section { background: rgba(255, 255, 255, 0.75); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow-sm); }
.sidebar h3 { margin: 0 0 10px; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; }
.sidebar .none { margin: 0; font-size: 0.85rem; color: var(--muted); }
.tag-cloud { display: flex; flex-wrap: wrap; gap: 6px; }
.tag { display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; background: var(--h-soft, var(--code-bg)); color: var(--h, var(--text-2)); border: 1px solid transparent; transition: all 0.15s; white-space: nowrap; }
.tag:hover { color: var(--h, var(--text)); border-color: var(--h, var(--border-strong)); }
.tag.on { background: var(--h, var(--accent)); color: #fff; }
.tag .n { font-weight: 500; opacity: 0.7; font-size: 0.74rem; }
.facet { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.facet a { display: flex; align-items: center; gap: 9px; padding: 6px 8px; border-radius: 9px; color: var(--text-2); font-size: 0.88rem; font-weight: 500; }
.facet a:hover { background: var(--accent-soft); color: var(--text); }
.facet a.on { background: var(--accent-soft); color: var(--accent-ink); font-weight: 600; }
.facet .n { margin-left: auto; font-size: 0.78rem; color: var(--muted); font-weight: 500; }
.facet .avatar { width: 20px; height: 20px; font-size: 0.6rem; }
.swatch { width: 10px; height: 10px; border-radius: 4px; background: var(--h); flex: none; }
.dates { display: grid; gap: 8px; }
.dates label { display: grid; gap: 4px; font-size: 0.78rem; color: var(--muted); font-weight: 600; }
.dates input { font: inherit; font-size: 0.88rem; padding: 7px 10px; border: 1px solid var(--border); border-radius: 10px; color: var(--text); background: var(--surface); }

.toolbar { display: flex; align-items: stretch; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.search { flex: 1; min-width: 220px; position: relative; display: flex; }
.search svg.icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--muted); }
.search input { flex: 1; padding: 11px 14px 11px 40px; border-radius: 14px; box-shadow: var(--shadow-sm); font-size: 0.95rem; }
.toolbar .button { border-radius: 14px; padding: 10px 14px; }
.result-line { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 22px; font-size: 0.88rem; color: var(--text-2); font-weight: 500; }
.active-filter { display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px 3px 10px; border-radius: 999px; background: var(--accent); color: #fff; font-size: 0.8rem; font-weight: 600; }
.active-filter:hover { color: #fff; filter: brightness(1.08); }
.active-filter svg.icon { width: 13px; height: 13px; }
.result-line .clear { font-size: 0.82rem; }

.day { margin-bottom: 30px; }
.day-label { display: flex; align-items: center; gap: 10px; font-size: 0.95rem; font-weight: 700; margin: 0 0 12px; color: var(--text); }
.day-label .n { font-size: 0.75rem; font-weight: 600; color: var(--accent); background: var(--accent-soft); padding: 1px 8px; border-radius: 999px; }
.entries { list-style: none; margin: 0; padding: 0; position: relative; }
.entries::before { content: ""; position: absolute; left: 62px; top: 8px; bottom: 8px; width: 2px; background: linear-gradient(var(--border-strong), var(--border)); border-radius: 2px; }
.entry { display: grid; grid-template-columns: 48px 30px minmax(0, 1fr); align-items: start; margin-bottom: 12px; }
.entry .when { font-size: 0.8rem; color: var(--muted); font-variant-numeric: tabular-nums; padding-top: 18px; text-align: right; font-weight: 500; }
.entry .dot { width: 12px; height: 12px; border-radius: 50%; background: var(--h, #a5a8fb); margin: 21px auto 0; position: relative; box-shadow: 0 0 0 4px var(--bg), 0 0 0 6px var(--h-soft, var(--accent-soft)); }
.item { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow-sm); transition: box-shadow 0.18s, transform 0.18s, border-color 0.18s; overflow: hidden; border-left: 4px solid var(--h, #c7c9fc); }
.item:hover { box-shadow: var(--shadow); transform: translateX(2px); border-color: var(--border-strong); border-left-color: var(--h, #a5a8fb); }
.item-link { display: block; padding: 14px 18px 8px; color: inherit; }
.item-link:hover { color: inherit; }
.item-link:hover .item-title { color: var(--accent-ink); }
.item-title { display: flex; align-items: baseline; gap: 8px; font-size: 1.02rem; font-weight: 650; line-height: 1.4; letter-spacing: -0.01em; color: var(--text); transition: color 0.15s; }
.item-title .kind { color: var(--accent); }
.item-summary { display: block; margin-top: 3px; color: var(--text-2); font-size: 0.9rem; line-height: 1.55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.item-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 18px 12px; }
.item-meta .tag { font-size: 0.75rem; padding: 2px 8px; }
.by { display: inline-flex; align-items: center; gap: 7px; margin-left: auto; font-size: 0.8rem; color: var(--muted); font-weight: 500; }
.by .avatar { width: 20px; height: 20px; font-size: 0.58rem; }
.rev { display: inline-flex; align-items: center; gap: 3px; color: var(--accent); }
.rev svg.icon { width: 13px; height: 13px; }
.pager { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; }
.empty { padding: 64px 24px; text-align: center; color: var(--text-2); background: var(--surface); border-radius: var(--radius); border: 1px dashed var(--border-strong); }
.empty .logo { margin: 0 auto 14px; width: 48px; height: 48px; border-radius: 14px; }
.empty .logo svg.icon { width: 24px; height: 24px; }

/* ---- detail ---- */
.detail { max-width: 880px; margin: 0 auto; }
.back { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: 0.88rem; font-weight: 500; margin-bottom: 16px; }
.back:hover { color: var(--accent); }
.report-head { background: var(--surface); border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow); padding: 30px 36px 22px; margin-bottom: 20px; position: relative; overflow: hidden; }
.report-head::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 5px; background: linear-gradient(90deg, var(--h, #6366f1), #a855f7, #ec4899); }
.report-head .chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
.report-head h1 { font-size: 2rem; }
.report-head .lead { font-size: 1.06rem; color: var(--text-2); margin: 12px 0 0; }
.report-head .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
.report-head .meta .by { margin-left: 0; gap: 10px; line-height: 1.35; }
.report-head .meta .by b { color: var(--text); font-weight: 600; }
.report-head .meta .by .avatar { width: 34px; height: 34px; font-size: 0.8rem; }
.report-head .actions { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.report-head select { font-size: 0.84rem; padding: 7px 32px 7px 12px; max-width: 320px; }
.notice { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 12px; background: var(--warn-soft); color: #9a4a0b; margin-bottom: 16px; font-size: 0.92rem; }
.prose { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 36px 44px; overflow-wrap: anywhere; font-size: 1rem; line-height: 1.8; color: #2a2d4a; }
.prose > :first-child { margin-top: 0; }
.prose > :last-child { margin-bottom: 0; }
.prose h1, .prose h2, .prose h3 { color: var(--text); letter-spacing: -0.015em; line-height: 1.35; }
.prose h1 { font-size: 1.55rem; margin: 1.6em 0 0.6em; }
.prose h2 { font-size: 1.25rem; margin: 1.6em 0 0.5em; }
.prose h3 { font-size: 1.08rem; margin: 1.4em 0 0.4em; }
.prose a { text-decoration: underline; text-decoration-color: rgba(91, 91, 246, 0.35); text-underline-offset: 3px; }
.prose img { max-width: 100%; border-radius: 10px; }
.prose strong { color: var(--text); }
.prose pre { background: #f6f7fd; border: 1px solid var(--border); padding: 14px 16px; border-radius: 12px; overflow-x: auto; font-size: 0.86rem; line-height: 1.6; }
.prose code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; background: var(--accent-soft); color: var(--accent-ink); padding: 2px 6px; border-radius: 6px; font-size: 0.86em; }
.prose pre code { background: none; color: #343757; padding: 0; }
.prose table { border-collapse: separate; border-spacing: 0; display: block; overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; font-size: 0.92rem; }
.prose th { background: #f6f7fd; font-weight: 600; text-align: left; }
.prose th, .prose td { padding: 9px 14px; border-bottom: 1px solid var(--border); }
.prose tr:last-child td { border-bottom: none; }
.prose blockquote { margin: 1.2em 0; padding: 10px 18px; border-left: 4px solid #c7c9fc; background: #f8f8ff; border-radius: 0 12px 12px 0; color: var(--text-2); }
.prose blockquote p { margin: 0.3em 0; }
.prose hr { border: none; height: 1px; background: var(--border); margin: 2em 0; }
.prose li::marker { color: #a5a8fb; }
.prose li:has(> input[type=checkbox]) { list-style: none; margin-left: -1.3em; }
.prose input[type=checkbox] { accent-color: var(--accent); margin-right: 6px; }
iframe.report-frame { width: 100%; min-height: 420px; border: 1px solid var(--border); border-radius: var(--radius); background: #fff; display: block; box-shadow: var(--shadow); }
.neighbors { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 24px; }
.neighbors a { display: grid; gap: 4px; padding: 14px 18px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-sm); color: var(--text); font-weight: 600; font-size: 0.92rem; line-height: 1.4; transition: box-shadow 0.15s, border-color 0.15s; }
.neighbors a:hover { box-shadow: var(--shadow); border-color: #c7c9fc; color: var(--accent-ink); }
.neighbors small { display: inline-flex; align-items: center; gap: 4px; font-size: 0.76rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
.neighbors .newer { text-align: right; }
.neighbors .newer small { justify-content: flex-end; }

/* ---- agents ---- */
.narrow { max-width: 760px; margin: 0 auto; }
.page-head { margin-bottom: 24px; }
.page-head p { margin: 6px 0 0; color: var(--text-2); max-width: 640px; }
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 24px; margin-bottom: 20px; }
.panel h2 { margin-bottom: 14px; }
.create-row { display: flex; gap: 10px; flex-wrap: wrap; }
.create-row input { flex: 1; min-width: 220px; }
.agent-list { display: grid; gap: 10px; }
.agent { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: #fafbff; }
.agent .info { flex: 1; min-width: 0; }
.agent .name { font-weight: 600; }
.agent .sub { font-size: 0.8rem; color: var(--muted); }
.agent.revoked { opacity: 0.55; }
.token { padding: 18px 20px; border-radius: var(--radius); background: linear-gradient(135deg, #e9fbf3, #eef6ff); border: 1px solid #c8f0dd; margin-bottom: 20px; }
.token code { display: block; margin-top: 10px; padding: 10px 12px; background: rgba(255, 255, 255, 0.8); border-radius: 10px; font-size: 0.92rem; word-break: break-all; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.snippet-title { font-size: 0.88rem; font-weight: 600; margin: 16px 0 8px; color: var(--text-2); }
pre.snippet { background: #1e1f3b; color: #e4e6ff; padding: 14px 16px; border-radius: 12px; overflow-x: auto; font-size: 0.84rem; line-height: 1.6; white-space: pre; margin: 0; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.panel code { font-family: ui-monospace, "SF Mono", Menlo, monospace; background: var(--accent-soft); color: var(--accent-ink); padding: 2px 6px; border-radius: 6px; font-size: 0.86em; }

/* ---- login ---- */
.login { max-width: 380px; margin: 14vh auto 0; padding: 36px 32px; background: var(--surface); border-radius: 22px; box-shadow: var(--shadow-lg); border: 1px solid var(--border); text-align: center; }
.login .logo { width: 52px; height: 52px; border-radius: 16px; margin: 0 auto 18px; }
.login .logo svg.icon { width: 26px; height: 26px; }
.login h1 { font-size: 1.5rem; }
.login p { color: var(--text-2); margin: 6px 0 24px; }
.login form { display: grid; gap: 12px; text-align: left; }
.login button { justify-content: center; padding: 11px; }
.error { color: var(--danger); font-size: 0.85rem; }

@media (max-width: 640px) {
  .wrap { padding: 0 16px; }
  header.top .wrap { gap: 12px; }
  nav.tabs a span { display: none; }
  h1 { font-size: 1.5rem; }
  .report-head { padding: 22px 20px 18px; }
  .report-head h1 { font-size: 1.5rem; }
  .prose { padding: 22px 20px; }
  .report-head .actions { margin-left: 0; }
  .entry { grid-template-columns: 0 22px minmax(0, 1fr); }
  .entry .when { visibility: hidden; }
  .entries::before { left: 10px; }
  .item-meta .by { margin-left: 0; width: 100%; }
  .neighbors { grid-template-columns: 1fr; }
}
`;

// Sizes report iframes to their content, auto-submits filter selects, and confirms destructive actions.
export const SCRIPT = `
addEventListener("message", function (e) {
  if (!e.data || e.data.type !== "report-frame-height") return;
  document.querySelectorAll("iframe.report-frame").forEach(function (f) {
    if (f.contentWindow === e.source) f.style.height = Math.max(200, Math.ceil(e.data.height) + 4) + "px";
  });
});
document.addEventListener("change", function (e) {
  if (e.target.hasAttribute && e.target.hasAttribute("data-autosubmit")) e.target.form.submit();
});
document.addEventListener("submit", function (e) {
  var msg = e.target.getAttribute("data-confirm");
  if (msg && !confirm(msg)) e.preventDefault();
});
`;

/** Changes whenever the CSS or JS changes, so browsers never use a stale cached copy. */
export const ASSET_VERSION = crypto.createHash("sha256").update(STYLE + SCRIPT).digest("hex").slice(0, 10);
