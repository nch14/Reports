import { en, type Messages } from "./en.js";
import { zhCN } from "./zh-CN.js";

export type { Messages };

export interface Locale {
  /** BCP 47 tag, used for <html lang>, Intl formatting and the cookie value. */
  code: string;
  /** Shown in the language switcher, in the language itself. */
  name: string;
  messages: Messages;
}

// To add a language: create ./<code>.ts typed as Messages and list it here.
export const LOCALES: Locale[] = [
  { code: "en", name: "English", messages: en },
  { code: "zh-CN", name: "简体中文", messages: zhCN },
];

export const DEFAULT_LOCALE = LOCALES[0]!;
export const LOCALE_COOKIE = "lang";

export const findLocale = (code: string | undefined) =>
  code ? LOCALES.find((l) => l.code.toLowerCase() === code.toLowerCase()) : undefined;

/** A saved choice wins; otherwise the browser's Accept-Language, matching exact tags before primary language. */
export function pickLocale(saved: string | undefined, acceptLanguage: string | undefined): Locale {
  const chosen = findLocale(saved);
  if (chosen) return chosen;
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag!.trim(), q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter((w) => w.tag && w.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const exact = findLocale(tag);
    if (exact) return exact;
    const primary = tag.split("-")[0]!.toLowerCase();
    const partial = LOCALES.find((l) => l.code.split("-")[0]!.toLowerCase() === primary);
    if (partial) return partial;
  }
  return DEFAULT_LOCALE;
}
