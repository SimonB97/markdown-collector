let isListening = false;
let savedURLs = [];

browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.set({ overwriteExisting: false, darkMode: false, backgroundConversion: false });
});

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleListening") {
    isListening = !isListening;
    browser.runtime.sendMessage({ action: "updateListeningStatus", isListening });
  } else if (request.action === "saveCurrentURL") {
    saveCurrentURL();
  }
});

browser.commands.onCommand.addListener((command) => {
  if (command === "toggle-listening") {
    isListening = !isListening;
    browser.runtime.sendMessage({ action: "updateListeningStatus", isListening });
  } else if (command === "open-html-page") {
    openHTMLPage();
  }
});

function saveCurrentURL() {
  if (isListening) {
    browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0].url;
      browser.storage.local.get("overwriteExisting", (data) => {
        if (savedURLs.includes(url) && !data.overwriteExisting) {
          promptUserForDuplicateAction(url);
        } else {
          addURLToList(url);
        }
      });
    });
  }
}

function promptUserForDuplicateAction(url) {
  browser.tabs.create({
    url: "duplicate_prompt.html",
    active: true
  });
}

function addURLToList(url, isDuplicate = false) {
  if (!isDuplicate) {
    savedURLs = savedURLs.filter(savedUrl => savedUrl !== url);
  }
  savedURLs.push(url);
  startConvertToMarkdown(url);
}

function startConvertToMarkdown(url) {
  browser.storage.local.get("backgroundConversion", (data) => {
    if (data.backgroundConversion) {
      // Queue conversion task (implementation depends on your task queue system)
    } else {
      browser.tabs.sendMessage(tabs[0].id, { action: "convertToMarkdown", url });
    }
  });
}

function openHTMLPage() {
  browser.tabs.create({
    url: "markdown_view.html"
  });
}