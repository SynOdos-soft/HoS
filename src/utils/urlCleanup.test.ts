import { describe, it, expect, afterEach, vi } from 'vitest';
import { hasBareHash, stripBareHash } from './urlCleanup';

const reset = () => window.history.replaceState(null, '', '/');

afterEach(() => {
  reset();
  vi.useRealTimers();
});

describe('hasBareHash', () => {
  it('recognises a bare trailing hash', () => {
    expect(hasBareHash('https://hos.synodos.app/#')).toBe(true);
  });

  it('leaves a real fragment alone', () => {
    expect(hasBareHash('https://hos.synodos.app/#/officer/3q2-7w')).toBe(false);
    expect(hasBareHash('https://hos.synodos.app/#access_token=x')).toBe(false);
  });

  it('is false when there is no hash at all', () => {
    expect(hasBareHash('https://hos.synodos.app/')).toBe(false);
    expect(hasBareHash('https://hos.synodos.app/?o=abc123')).toBe(false);
  });
});

describe('stripBareHash', () => {
  it('removes the bare "#" Supabase leaves behind', () => {
    // The real shape of the bug: `location.hash` already reads "" (the tokens
    // are gone) while the address bar still shows a trailing "#". Assert on
    // href, which is what the driver actually sees.
    window.history.replaceState(null, '', '/#');
    expect(window.location.href).toBe('http://localhost:5173/#');
    expect(window.location.hash).toBe('');

    expect(stripBareHash()).toBe(true);

    expect(window.location.href).toBe('http://localhost:5173/');
  });

  it('keeps the path and query string', () => {
    window.history.replaceState(null, '', '/?o=abc123&keep=1#');

    stripBareHash();

    expect(window.location.pathname).toBe('/');
    expect(window.location.search).toBe('?o=abc123&keep=1');
  });

  it('preserves the existing history state so Back is unaffected', () => {
    window.history.replaceState({ marker: 'keep-me' }, '', '/#');

    stripBareHash();

    expect(window.history.state).toEqual({ marker: 'keep-me' });
  });

  it('does not fire hashchange (nothing re-renders)', () => {
    window.history.replaceState(null, '', '/#');
    const onHashChange = vi.fn();
    window.addEventListener('hashchange', onHashChange);

    stripBareHash();

    expect(onHashChange).not.toHaveBeenCalled();
    window.removeEventListener('hashchange', onHashChange);
  });

  it('never destroys a real officer handoff fragment', () => {
    window.history.replaceState(null, '', '/#/officer/3q2-7w');

    expect(stripBareHash()).toBe(false);

    expect(window.location.hash).toBe('#/officer/3q2-7w');
  });

  it('is a no-op on a clean URL and reports it', () => {
    window.history.replaceState(null, '', '/?o=abc123');

    expect(stripBareHash()).toBe(false);

    expect(window.location.search).toBe('?o=abc123');
  });

  it('is safe to call repeatedly', () => {
    window.history.replaceState(null, '', '/#');

    expect(stripBareHash()).toBe(true);
    expect(stripBareHash()).toBe(false);
    expect(stripBareHash()).toBe(false);
  });
});