/*
 * This file is part of Markdown Collector.
 *
 * Markdown Collector is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Markdown Collector is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Markdown Collector.  If not, see <https://www.gnu.org/licenses/>.
 */


let isConverting = false;

// Listen for messages from the background or popup scripts
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message in content script:", request);

  if (request.command === 'convert-to-markdown' && !isConverting) {
    isConverting = true;
    browser.storage.local.get(['enableCleanup', 'enableLLM']).then(async (result) => {
      const enableCleanup = result.enableCleanup || false;
      const enableLLM = result.enableLLM || false;
      
      let markdown;
      if (enableCleanup && typeof Readability !== 'undefined') {
        markdown = await convertPageToMarkdownWithCleanup();
      } else {
        markdown = convertPageToMarkdown();
      }

      if (enableLLM) {
        console.log("LLM refinement is enabled. Showing prompt popup.");
        try {
          const prompt = await showPromptPopup();
          console.log("Prompt received:", prompt);
          if (prompt) {
            sendResponse({ markdown, prompt });
          } else {
            console.log("Prompt was cancelled or empty.");
            sendResponse({ markdown });
          }
        } catch (error) {
          console.error("Error showing prompt popup:", error);
          sendResponse({ markdown });
        }
      } else {
        console.log("LLM refinement is disabled. Sending markdown without prompt.");
        sendResponse({ markdown });
      }
      
      isConverting = false;
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

function showPromptPopup() {
  return new Promise((resolve) => {
    console.log("Creating prompt popup");
    const popup = document.createElement('div');
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: white;
      padding: 20px;
      border-radius: 5px;
      box-shadow: 0 0 10px rgba(0,0,0,0.3);
      z-index: 10000;
    `;
    popup.innerHTML = `
      <h3>Refine Content</h3>
      <p>Enter a prompt to refine the content:</p>
      <input type="text" id="refinement-prompt" style="width: 100%; margin-bottom: 10px;">
      <button id="accept-prompt">Accept</button>
      <button id="cancel-prompt">Cancel</button>
    `;
    document.body.appendChild(popup);

    document.getElementById('accept-prompt').addEventListener('click', () => {
      const prompt = document.getElementById('refinement-prompt').value;
      document.body.removeChild(popup);
      console.log("Prompt accepted:", prompt);
      resolve(prompt);
    });

    document.getElementById('cancel-prompt').addEventListener('click', () => {
      document.body.removeChild(popup);
      console.log("Prompt cancelled");
      resolve(null);
    });
  });
}
