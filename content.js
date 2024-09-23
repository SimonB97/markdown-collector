chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message in content script:", request);

  if (request.command === 'convert-to-markdown') {
    const markdown = convertPageToMarkdown();
    sendResponse({ markdown: markdown });
  }
  return true; // Indicates that the response is sent asynchronously
});

function convertPageToMarkdown() {
  console.log("Converting page to markdown");
  // Use Turndown for more accurate conversion
  const turndownService = new TurndownService();
  const title = document.title;
  const bodyHTML = document.body.innerHTML;
  const bodyMarkdown = turndownService.turndown(bodyHTML);
  return `# ${title}\n\n${bodyMarkdown}`;
}