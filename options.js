const DEFAULTS = {
  maxVisible: 10,
  batchSize: 10,
  autoloadOnScroll: true,
};

const BROWSER = typeof window.browser !== "undefined" ? window.browser : window.chrome;

function storageGet(defaults) {
  if (BROWSER.storage && BROWSER.storage.sync && BROWSER.storage.sync.get.length <= 1) {
    return BROWSER.storage.sync.get(defaults);
  }
  return new Promise((resolve) => BROWSER.storage.sync.get(defaults, resolve));
}

function storageSet(values) {
  if (BROWSER.storage && BROWSER.storage.sync && BROWSER.storage.sync.set.length <= 1) {
    return BROWSER.storage.sync.set(values);
  }
  return new Promise((resolve) => BROWSER.storage.sync.set(values, resolve));
}

async function load() {
  const res = await storageGet(DEFAULTS);
  document.getElementById("maxVisible").value = res.maxVisible;
  document.getElementById("batchSize").value = res.batchSize;
  document.getElementById("autoloadOnScroll").checked = !!res.autoloadOnScroll;
}

async function save(e) {
  e.preventDefault();
  const maxVisible = Math.max(1, parseInt(document.getElementById("maxVisible").value || "10", 10));
  const batchSize = Math.max(1, parseInt(document.getElementById("batchSize").value || "10", 10));
  const autoloadOnScroll = !!document.getElementById("autoloadOnScroll").checked;
  await storageSet({ maxVisible, batchSize, autoloadOnScroll });
}

function reset() {
  storageSet(DEFAULTS).then(load);
}

document.getElementById("form").addEventListener("submit", save);
document.getElementById("reset").addEventListener("click", reset);
document.addEventListener("DOMContentLoaded", load);
