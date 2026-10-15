import { supabase } from './supabase';
import { createProblemReporter, firstLines, summarizeBrowser } from './problemLog';

/**
 * Sends problems people meet to the database for admins to see (see
 * lib/problemLog for the rules). Nothing is sent while developing locally.
 */
export const reportProblem = createProblemReporter({
  send: async (payload) => {
    if (import.meta.env.DEV) return;
    await supabase.rpc('log_client_error', {
      p_kind: payload.kind,
      p_message: payload.message,
      p_detail: payload.detail,
      p_page: payload.page,
      p_build: payload.build,
      p_browser: payload.browser
    });
  },
  context: () => ({
    page: typeof location === 'undefined' ? '' : location.pathname,
    build: typeof __BUILD_ID__ === 'undefined' ? '' : __BUILD_ID__,
    browser: typeof navigator === 'undefined' ? '' : summarizeBrowser(navigator.userAgent)
  }),
  isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false
});

let installed = false;

/** Also report script errors nothing else caught. Called once when the app starts. */
export function installProblemReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    reportProblem('script', event.error ?? event.message, {
      where: event.error ? undefined : firstLines(`${event.filename}:${event.lineno}:${event.colno}`, 1)
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportProblem('script', event.reason);
  });
}
