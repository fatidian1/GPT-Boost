const DEFAULTS = {
  maxVisible: 10,
  batchSize: 10,
  autoloadOnScroll: true,
  hideOldestOnNew: true,
};

function load() {
  chrome.storage.sync.get(DEFAULTS, (res) => {
    document.getElementById("maxVisible").value = res.maxVisible;
    document.getElementById("batchSize").value = res.batchSize;
    document.getElementById("autoloadOnScroll").checked = !!res.autoloadOnScroll;
    document.getElementById("hideOldestOnNew").checked = !!res.hideOldestOnNew;
  });
}

function save(e) {
  e.preventDefault();
  const maxVisible = Math.max(1, parseInt(document.getElementById("maxVisible").value || "10", 10));
  const batchSize = Math.max(1, parseInt(document.getElementById("batchSize").value || "10", 10));
  const autoloadOnScroll = !!document.getElementById("autoloadOnScroll").checked;
  const hideOldestOnNew = !!document.getElementById("hideOldestOnNew").checked;
  chrome.storage.sync.set({ maxVisible, batchSize, autoloadOnScroll, hideOldestOnNew });
}

function reset() {
  chrome.storage.sync.set(DEFAULTS, load);
}

document.getElementById("form").addEventListener("submit", save);
document.getElementById("reset").addEventListener("click", reset);
document.addEventListener("DOMContentLoaded", load);
