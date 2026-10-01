import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Regression tests for the top-level error boundary: a render crash anywhere
 * in the tree must land on the recoverable error screen — never an unmounted
 * (white) root — and both recovery actions must behave.
 */

const Boom: React.FC = () => {
  throw new Error('kaboom');
};

const Ok: React.FC<{ label?: string }> = ({ label = 'all good' }) => <div>{label}</div>;

// Silence the expected console.error spam from React + the boundary itself so
// test output stays readable; individual assertions still inspect the calls.
const silenceConsole = () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
};

describe('ErrorBoundary', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    silenceConsole();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  const render = (ui: React.ReactNode) => {
    act(() => root.render(<ErrorBoundary>{ui}</ErrorBoundary>));
  };

  it('renders children untouched when no error occurs', () => {
    render(<Ok />);
    expect(container.textContent).toContain('all good');
  });

  it('shows the recovery screen instead of an unmounted (white) root on render crash', () => {
    render(<Boom />);
    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain('your log book is safe');
    // role="alert" so it is announced; present exactly once.
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
  });

  it('captures non-Error throws too', () => {
    const ThrewString: React.FC = () => {
      throw 'plain string failure';
    };
    render(<ThrewString />);
    expect(container.textContent).toContain('Something went wrong');
  });

  it('"Try again" remounts the tree in place after a crash', () => {
    const { BoomUntilFixed, markFixed } = buildRecoverable();
    render(<BoomUntilFixed />);
    expect(container.textContent).toContain('Something went wrong');

    markFixed();
    const retry = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Try again'));
    expect(retry).toBeTruthy();
    act(() => { retry!.click(); });

    // Fresh mount replaces the crash screen with the recovered content.
    expect(container.textContent).toContain('recovered');
    expect(container.textContent).not.toContain('Something went wrong');
  });

  it('"Reload app" triggers a full page reload', () => {
    render(<Boom />);
    const reload = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Reload app'));
    expect(reload).toBeTruthy();
    act(() => { reload!.click(); });
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});

/**
 * Child that keeps crashing until `markFixed()` is called — deterministic
 * across React 18's automatic render retries, which would otherwise mask a
 * "crash only once" flag (the retry re-runs the component before the
 * boundary ever catches).
 */
function buildRecoverable(): { BoomUntilFixed: React.FC; markFixed: () => void } {
  let fixed = false;
  const BoomUntilFixed: React.FC = () => {
    if (!fixed) throw new Error('persistent failure');
    return <div>recovered</div>;
  };
  return { BoomUntilFixed, markFixed: () => { fixed = true; } };
}

// jsdom does not implement location.reload; stub before any test runs.
beforeEach(() => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload: vi.fn() },
    writable: true,
  });
});
