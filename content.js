const turndownService = new TurndownService();

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "convertToMarkdown") {
    const markdown = convertPageToMarkdown();
    browser.storage.local.set({ [request.url]: markdown });
  }
});

function convertPageToMarkdown() {
  const content = document.body.innerHTML;
  return turndownService.turndown(content);
}