import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  translations, t, setI18nLanguage, subscribeToLanguage, getI18nLanguage, isTranslated,
  LANGUAGES, dateLocaleFor, type TranslationKey,
} from './i18n';

const en = translations.en as Record<string, string>;
const fr = translations.fr as Record<string, string>;

describe('translation dictionary', () => {
  it('ships French, and English offers it in the picker', () => {
    expect(LANGUAGES.map(l => l.code)).toContain('fr');
  });

  it('translates every English key into French', () => {
    const missing = Object.keys(en).filter(key => !fr[key]);
    expect(missing).toEqual([]);
  });

  it('has no French key that English does not define', () => {
    const extra = Object.keys(fr).filter(key => !en[key]);
    expect(extra).toEqual([]);
  });

  it('leaves no French value accidentally in English', () => {
    // Regulatory codes, brand names and words that are genuinely spelled the same
    // in French (Navigation, Inspection, Actions, Distance, Justification, Cycle)
    // are allowed to match; prose must not.
    const allowedIdentical = new Set([
      'cycle', 'version', 'vehicleDescription',
      'nav', 'navInspection', 'actions', 'distance', 'justification', 'factCycle',
      // Genuinely the same word in French: a job title and a UI verb.
      'occChauffeur', 'dismiss',
    ]);
    const untranslated = Object.keys(en)
      .filter(key => !allowedIdentical.has(key))
      .filter(key => fr[key] === en[key]);
    expect(untranslated).toEqual([]);
  });

  it('keeps duty-status grid codes out of the dictionary', () => {
    // OFF / S/D / ON / Y / H are regulatory abbreviations and must stay as-is.
    const combined = Object.values(en).join(' ');
    expect(combined).not.toContain('OFF-DUTY ');
    expect(fr.driving).not.toBe(en.driving);
  });

  it('falls back to English for an unknown language', () => {
    expect(t('save', 'zz')).toBe(en.save);
  });

  it('falls back to English per key when a language is partial', () => {
    // Greek only covers the original 18 keys; new keys must not break it.
    const el = translations.el as Partial<Record<TranslationKey, string>>;
    expect(t('handoff', 'el')).toBe(en.handoff);
    expect(el.save).toBeTruthy();
  });

  it('translates the driver-facing compliance wording', () => {
    expect(fr.driving).toBe('Conduite');
    expect(fr.sleeper).toBe('Repos (cabine)');
    expect(fr.finishedDay).toBeUndefined(); // guard against invented keys
    expect(Object.keys(en)).not.toContain('finishedDay');
  });
});

describe('AI translation disclaimer', () => {
  it('exists in both languages and states the English text is authoritative', () => {
    expect(en.aiTranslationNotice).toMatch(/AI-generated/i);
    expect(en.aiTranslationNotice).toMatch(/official record/i);
    expect(fr.aiTranslationNotice).toMatch(/intelligence artificielle/i);
    expect(fr.aiTranslationNotice).toMatch(/version anglaise fait foi/i);
  });

  it('applies to every non-English language and not to English', () => {
    expect(isTranslated('en')).toBe(false);
    expect(isTranslated('fr')).toBe(true);
    expect(isTranslated('el')).toBe(true);
  });
});

describe('reactive language store', () => {
  beforeEach(() => {
    setI18nLanguage('en');
  });

  it('tracks the current language', () => {
    setI18nLanguage('fr');
    expect(getI18nLanguage()).toBe('fr');
  });

  it('notifies subscribers exactly once per real change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToLanguage(listener);
    setI18nLanguage('fr');
    setI18nLanguage('fr'); // same language: no second notification
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setI18nLanguage('en');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('survives a subscriber that throws', () => {
    const bad = vi.fn(() => { throw new Error('bad listener'); });
    const good = vi.fn();
    const off1 = subscribeToLanguage(bad);
    const off2 = subscribeToLanguage(good);
    expect(() => setI18nLanguage('fr')).not.toThrow();
    expect(good).toHaveBeenCalled();
    off1(); off2();
  });

  it('exposes a date-fns locale matching the language', () => {
    expect(dateLocaleFor('fr').code).toBe('fr');
    expect(dateLocaleFor('en').code).toBe('en-US');
  });
});