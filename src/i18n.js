export const getMessage = (message, substitutions) => {
  if (chrome && chrome.i18n) {
    return chrome.i18n.getMessage(message, substitutions);
  }
  if (browser && browser.i18n) {
    return browser.i18n.getMessage(message, substitutions);
  }
  return substitutions;
};
