import { getMessage } from './i18n';

const DEFAULTS = {
  maxVisible: 10,
  batchSize: 10,
  autoloadOnScroll: true,
  hideOldestOnNew: true,
  deleteMessages: false,
  hiddenDomBuffer: 0,
};

function localize() {
  // Title and header
  document.title = getMessage('optionsTitle');
  const h1 = document.getElementById('title');
  if (h1) h1.textContent = getMessage('optionsTitle');

  // Labels and hints
  const lblMax = document.getElementById('labelMaxVisible');
  if (lblMax) lblMax.textContent = getMessage('labelMaxVisible');
  const def1 = document.getElementById('default10a');
  if (def1) def1.textContent = getMessage('defaultNumber', ['10']);

  const lblBatch = document.getElementById('labelBatchSize');
  if (lblBatch) lblBatch.textContent = getMessage('labelBatchSize');
  const def2 = document.getElementById('default10b');
  if (def2) def2.textContent = getMessage('defaultNumber', ['10']);

  const lblAutoload = document.getElementById('labelAutoloadOnScroll');
  if (lblAutoload) lblAutoload.textContent = getMessage('labelAutoload');
  const lblHideOldest = document.getElementById('labelHideOldestOnNew');
  if (lblHideOldest) lblHideOldest.textContent = getMessage('labelHideOldest');

  const lblDeleteMode = document.getElementById('labelDeleteMode');
  if (lblDeleteMode) lblDeleteMode.textContent = getMessage('labelDeleteMode');

  const lblBuffer = document.getElementById('labelHiddenBuffer');
  if (lblBuffer) lblBuffer.textContent = getMessage('labelHiddenBuffer');
  const defBuffer = document.getElementById('defaultBufferText');
  if (defBuffer) defBuffer.textContent = getMessage('defaultNumber', ['0']);

  const saveBtn = document.getElementById('saveBtn');
  if (saveBtn) saveBtn.textContent = getMessage('save');
  const resetBtn = document.getElementById('reset');
  if (resetBtn) resetBtn.textContent = getMessage('reset');

  const hint = document.getElementById('hint');
  if (hint) hint.textContent = getMessage('hintApply');

  const footerDesc = document.getElementById('footerDesc');
  if (footerDesc) footerDesc.textContent = getMessage('footerDescription', [getMessage('appName')]);

  const coffeePara = document.getElementById('footerSupport');
  const coffeeLink = document.createElement('a');
  coffeeLink.href = 'https://buymeacoffee.com/fatidian1';
  coffeeLink.innerText = getMessage('footerSupportLinkText');
  if (coffeePara) {
    coffeePara.innerHTML = [
      getMessage('footerSupportPrefix'),
      coffeeLink.outerHTML,
      getMessage('footerSupportSuffix'),
    ].join('');
  }
}

function load() {
  chrome.storage.sync.get(DEFAULTS, (res) => {
    document.getElementById('maxVisible').value = res.maxVisible;
    document.getElementById('batchSize').value = res.batchSize;
    document.getElementById('autoloadOnScroll').checked = !!res.autoloadOnScroll;
    document.getElementById('hideOldestOnNew').checked = !!res.hideOldestOnNew;
    document.getElementById('deleteMessages').checked = !!res.deleteMessages;
    document.getElementById('hiddenDomBuffer').value = res.hiddenDomBuffer || 0;
    updateBufferFieldVisibility();
  });
}

function updateBufferFieldVisibility() {
  const deleteMessagesChecked = !!document.getElementById('deleteMessages').checked;
  const bufferLabel = document.getElementById('hiddenDomBufferLabel');
  if (bufferLabel) {
    bufferLabel.style.display = deleteMessagesChecked ? '' : 'none';
  }
}

function save(e) {
  e.preventDefault();
  const maxVisible = Math.max(1, parseInt(document.getElementById('maxVisible').value || '10', 10));
  const batchSize = Math.max(1, parseInt(document.getElementById('batchSize').value || '10', 10));
  const autoloadOnScroll = !!document.getElementById('autoloadOnScroll').checked;
  const hideOldestOnNew = !!document.getElementById('hideOldestOnNew').checked;
  const deleteMessages = !!document.getElementById('deleteMessages').checked;
  const hiddenDomBuffer = Math.max(0, parseInt(document.getElementById('hiddenDomBuffer').value || '0', 10));
  chrome.storage.sync.set({
    maxVisible,
    batchSize,
    autoloadOnScroll,
    hideOldestOnNew,
    deleteMessages,
    hiddenDomBuffer,
  });
  alert(getMessage('settingsSaved'));
}

function reset() {
  chrome.storage.sync.set(DEFAULTS, load);
  alert(getMessage('settingsRestored'));
}

document.getElementById('form').addEventListener('submit', save);
document.getElementById('reset').addEventListener('click', reset);
document.getElementById('deleteMessages').addEventListener('change', updateBufferFieldVisibility);
document.addEventListener('DOMContentLoaded', () => {
  localize();
  load();
});
