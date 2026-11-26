// Parte del idioma que necesita el navegador: el cambio (recarga la página) y la traducción del HTML fijo.
import { LANG_KEY, lang, t, type Lang } from './index';

export function setLang(next: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    /* sin almacenamiento: el cambio no persiste */
  }
  location.reload();
}

/** Traduce los textos marcados con data-i18n / data-i18n-title / data-i18n-ph del documento. */
export function translateDom(root: ParentNode = document): void {
  if (lang === 'en') return;
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n || el.textContent || '');
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle || '');
  });
  root.querySelectorAll<HTMLInputElement>('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh || '');
  });
  document.documentElement.lang = lang;
  document.title = t('Memeria - Hold the line');
}
