import ko from './locales/ko.js';
import en from './locales/en.js';

export type Lang = 'ko' | 'en';

export const DEFAULT_LANG: Lang = 'en';

export type I18nCategory = 'cli' | 'steps' | 'messages' | 'warnings';

export type I18nData = Record<I18nCategory, Record<string, string>>;

export function normalizeLang(lang: unknown): Lang {
  if (lang === 'ko' || lang === 'en') return lang;
  return DEFAULT_LANG;
}

export function formatTemplate(
  template: string,
  vars: Record<string, string | number | undefined>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

const I18N = {
  ko,
  en,
} as const satisfies Record<Lang, I18nData>;

type DefaultLocale = (typeof I18N)[typeof DEFAULT_LANG];
export type I18nKey<C extends I18nCategory> = keyof DefaultLocale[C] & string;

export function tr<C extends I18nCategory>(
  lang: Lang,
  category: C,
  key: I18nKey<C>,
  vars?: Record<string, string | number | undefined>
): string;
/* eslint-disable no-redeclare */
export function tr(
  lang: Lang,
  category: I18nCategory,
  key: string,
  vars?: Record<string, string | number | undefined>
): string;
export function tr(
  lang: Lang,
  category: I18nCategory,
  key: string,
  vars: Record<string, string | number | undefined> = {}
): string {
  const safeLang = normalizeLang(lang);
  const safeCategory = I18N[safeLang]?.[category] as
    | Record<string, string>
    | undefined;
  const defaultCategory = I18N[DEFAULT_LANG]?.[category] as
    | Record<string, string>
    | undefined;
  const koCategory = I18N.ko?.[category] as Record<string, string> | undefined;
  const template =
    safeCategory?.[key] ??
    defaultCategory?.[key] ??
    koCategory?.[key] ??
    `${category}.${key}`;
  return formatTemplate(template, vars);
}
