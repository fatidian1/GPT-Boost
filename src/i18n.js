// Robust i18n helper that tolerates missing/invalid extension context
export const getMessage = (message, substitutions) => {
  // Try Chrome extension API first (when context is valid)
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome?.runtime?.id &&
      chrome?.i18n?.getMessage
    ) {
      return chrome.i18n.getMessage(message, substitutions);
    }
  } catch (_) {
    // Ignore "Extension context invalidated" and fall through to other strategies
  }

  // Try WebExtension API (Firefox, some Chromium variants)
  try {
    if (
      typeof browser !== 'undefined' &&
      browser?.i18n?.getMessage
    ) {
      return browser.i18n.getMessage(message, substitutions);
    }
  } catch (_) {
    // Ignore and fall through to fallback
  }

  // Fallback: return the message key or a naive substitution-applied string
  if (Array.isArray(substitutions) && substitutions.length) {
    // Replace $1, $2... if they appear in the key (best-effort)
    try {
      return substitutions.reduce(
        (acc, v, i) => acc.replaceAll(`$${i + 1}`, String(v)),
        String(message)
      );
    } catch (_) {
      // If replaceAll is unavailable or fails, just join
      return String(message) + ' ' + substitutions.join(' ');
    }
  }
  return String(message);
};
