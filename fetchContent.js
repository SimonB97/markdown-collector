browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === "getPageContent") {
      sendResponse({ html: document.documentElement.outerHTML });
    }
  });