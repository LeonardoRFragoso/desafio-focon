import * as Sentry from '@sentry/react';

const SENTRY_DSN = import.meta.env['VITE_SENTRY_DSN'];

let initialized = false;

/**
 * Initialize Sentry if DSN is configured.
 * If not configured, Sentry is disabled — the app works normally.
 */
export function initSentry(): void {
  if (initialized) return;
  if (!SENTRY_DSN) {
    // Sentry disabled — no DSN configured
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env['VITE_APP_VERSION'],
    tracesSampleRate: 0.1,
    // Prevent sending sensitive data
    beforeSend(event) {
      // Scrub request body and headers that might contain sensitive data
      if (event.request) {
        if (event.request.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
        }
        if (event.request.data) {
          // Don't send request data that might contain descriptions, attachments, or financial info
          delete event.request.data;
        }
      }
      // Scrub breadcrumbs that might contain sensitive URLs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.filter((crumb) => {
          if (crumb.type === 'http' && crumb.data?.['url']) {
            // Filter out Supabase auth and storage URLs
            const url = crumb.data['url'] as string;
            if (url.includes('/auth/') || url.includes('/storage/') || url.includes('attachments')) {
              return false;
            }
          }
          return true;
        });
      }
      return event;
    },
    // Don't capture user PII
    sendDefaultPii: false,
  });

  initialized = true;
}
