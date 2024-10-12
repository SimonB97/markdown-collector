let isConverting = false;

// Listen for messages from the background or popup scripts
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message in content script:", request);

  if (request.command === 'convert-to-markdown' && !isConverting) {
    isConverting = true;
    browser.storage.local.get(['enableCleanup']).then((result) => {
      const enableCleanup = result.enableCleanup || false;
      console.log("Content cleanup enabled:", enableCleanup);
      
      let markdownPromise;
      if (enableCleanup && typeof Readability !== 'undefined') {
        console.log("Converting page to markdown with cleanup");
        markdownPromise = convertPageToMarkdownWithCleanup();
      } else {
        console.log("Converting page to markdown without cleanup");
        markdownPromise = Promise.resolve(convertPageToMarkdown());
      }
      
      markdownPromise.then((markdown) => {
        console.log("Converted markdown:", markdown.substring(0, 100) + "..."); // Log the first 100 characters of the markdown
        sendResponse({ markdown: markdown });
        isConverting = false;
      }).catch((error) => {
        console.error("Error during markdown conversion:", error);
        sendResponse({ markdown: '' });
        isConverting = false;
      });
    }).catch((error) => {
      console.error("Error accessing storage:", error);
      sendResponse({ markdown: '' });
      isConverting = false;
    });
    return true; // Indicates asynchronous response
  }
  return false;
});

/**
 * Converts the page content to Markdown using Readability for cleanup.
 * @returns {Promise<string>} - A promise that resolves to the Markdown string.
 */
function convertPageToMarkdownWithCleanup() {
  return new Promise((resolve, reject) => {
    try {
      const doc = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html');
      const reader = new Readability(doc);
      const article = reader.parse();
      if (article && article.content) {
        const turndownService = new TurndownService();
        const bodyMarkdown = turndownService.turndown(article.content);
        resolve(`# ${article.title}\n\n${bodyMarkdown}`);
      } else {
        console.warn("Readability failed to parse the page. Falling back to full page conversion.");
        resolve(convertPageToMarkdown());
      }
    } catch (error) {
      console.error("Error using Readability:", error);
      resolve(convertPageToMarkdown());
    }
  });
}

/**
 * Converts the entire page content to Markdown without cleanup.
 * @returns {string} - The Markdown string.
 */
function convertPageToMarkdown() {
  console.log("Converting page to markdown without cleanup");
  const turndownService = new TurndownService();
  const title = document.title;
  const bodyHTML = document.body.innerHTML;
  const bodyMarkdown = turndownService.turndown(bodyHTML);
  return `# ${title}\n\n${bodyMarkdown}`;
}
