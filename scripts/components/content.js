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
let isShowingPrompt = false;

// Listen for messages from the background or popup scripts
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (
    request.command === "convert-to-markdown" &&
    !isConverting &&
    !isShowingPrompt
  ) {
    isConverting = true;
    isShowingPrompt = true;

    browser.storage.local
      .get(["enableCleanup", "enableLLM"])
      .then(async (result) => {
        try {
          const enableCleanup = result.enableCleanup || false;
          const enableLLM = result.enableLLM || false;

          let markdown;
          if (enableCleanup && typeof Readability !== "undefined") {
            markdown = await convertPageToMarkdownWithCleanup();
          } else {
            markdown = convertPageToMarkdown();
          }

          if (enableLLM) {
            try {
              if (request.isFirstTab && !request.isMultiTab) {
                // Only single-tab operations use popup refinement
                await processContentForLLM(markdown, request.isMultiTab);
                sendResponse({ action: "pending-refinement", markdown });
              } else if (request.isFirstTab && request.isMultiTab) {
                // Multi-tab operations also use popup refinement
                await processContentForLLM(markdown, request.isMultiTab);
                sendResponse({ action: "pending-refinement", markdown });
              } else {
                // Non-first tabs just return markdown
                sendResponse({ markdown });
              }
            } catch (error) {
              console.error("Error showing prompt popup:", error.message);
              sendResponse({ markdown });
            }
          } else {
            sendResponse({ markdown });
          }
        } catch (error) {
          console.error("Error processing content:", error.message);
          sendResponse({ markdown: "" });
        } finally {
          isConverting = false;
          isShowingPrompt = false;
        }
      })
      .catch((error) => {
        console.error("Error accessing storage:", error.message);
        sendResponse({ markdown: "" });
        isConverting = false;
        isShowingPrompt = false;
      });
    return true;
  } else if (request.command === "show-notification") {
    showNotification(request.message, request.type);
  } else if (request.command === "show-loading") {
    showLoadingIndicator();
  } else if (request.command === "hide-loading") {
    hideLoadingIndicator();
  }
  return false;
});

function showLoadingIndicator() {
  const loadingIndicator = document.createElement("div");
  loadingIndicator.id = "loading-indicator";
  loadingIndicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 30px;
    height: 30px;
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-top: 4px solid #3498db;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    z-index: 10000;
  `;
  document.body.appendChild(loadingIndicator);
}

function hideLoadingIndicator() {
  const loadingIndicator = document.getElementById("loading-indicator");
  if (loadingIndicator) {
    document.body.removeChild(loadingIndicator);
  }
}

const style = document.createElement("style");
style.textContent = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}`;
document.head.appendChild(style);

/**
 * Converts the page content to Markdown using Readability for cleanup.
 * @returns {Promise<string>} - A promise that resolves to the Markdown string.
 */
function convertPageToMarkdownWithCleanup() {
  return new Promise((resolve, reject) => {
    try {
      const doc = new DOMParser().parseFromString(
        document.documentElement.outerHTML,
        "text/html"
      );
      const reader = new Readability(doc);
      const article = reader.parse();
      if (article && article.content) {
        const turndownService = new TurndownService();
        const bodyMarkdown = turndownService.turndown(article.content);
        resolve(`# ${article.title}\n\n${bodyMarkdown}`);
      } else {
        console.warn(
          "Readability failed to parse the page. Falling back to full page conversion."
        );
        resolve(convertPageToMarkdown());
      }
    } catch (error) {
      console.error("Error using Readability:", error.message);
      resolve(convertPageToMarkdown());
    }
  });
}

/**
 * Converts the entire page content to Markdown without cleanup.
 * @returns {string} - The Markdown string.
 */
function convertPageToMarkdown() {
  const turndownService = new TurndownService();
  const title = document.title;
  const bodyHTML = document.body.innerHTML;
  const bodyMarkdown = turndownService.turndown(bodyHTML);
  return `# ${title}\n\n${bodyMarkdown}`;
}

// LLM refinement now handled in extension popup - no in-page popup needed
function processContentForLLM(markdown, isMultiTab = false) {
  // Store content for popup to handle
  return browser.runtime.sendMessage({
    command: "store-for-refinement",
    markdown,
    isMultiTab,
    url: window.location.href,
    title: document.title,
    tabCount: isMultiTab ? null : 1, // Will be updated by background script for multi-tab
  });
}

function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    background-color: ${
      type === "error" ? "#ff4444" : type === "info" ? "#27ae60" : "#e74c3c"
    };
    color: white;
    border-radius: 5px;
    z-index: 10000;
    font-family: Arial, sans-serif;
    max-width: 400px;
    word-wrap: break-word;
  `;
  document.body.appendChild(notification);

  // Show error notifications longer
  const timeout = type === "error" ? 5000 : 3000;
  setTimeout(() => {
    if (notification.parentNode) {
      document.body.removeChild(notification);
    }
  }, timeout);
}

// Traditional dialog for multi-tab operations
async function showTraditionalDialog() {
  console.log("showTraditionalDialog() called");

  return new Promise((resolve) => {
    console.log("Creating dialog overlay");

    // Create dialog overlay
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      z-index: 10001;
      display: flex;
      justify-content: center;
      align-items: center;
    `;

    // Create dialog box
    const dialog = document.createElement("div");
    dialog.style.cssText = `
      background: white;
      border-radius: 8px;
      padding: 20px;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      font-family: Arial, sans-serif;
    `;

    dialog.innerHTML = `
      <h3 style="margin-top: 0; color: #333;">Process Multiple Tabs</h3>
      <p style="color: #666; margin-bottom: 20px;">Choose how to process the selected tabs:</p>
      
      <div style="margin-bottom: 15px;">
        <button id="save-only" style="
          width: 100%;
          padding: 12px;
          margin-bottom: 10px;
          border: 2px solid #ddd;
          border-radius: 5px;
          background: white;
          cursor: pointer;
          font-size: 14px;
        ">💾 Save without refinement</button>
      </div>
      
      <div style="margin-bottom: 15px;">
        <button id="batch-refine" style="
          width: 100%;
          padding: 12px;
          margin-bottom: 10px;
          border: 2px solid #007cba;
          border-radius: 5px;
          background: #f0f8ff;
          cursor: pointer;
          font-size: 14px;
        ">🚀 Batch process with same prompt</button>
      </div>
      
      <div style="margin-bottom: 20px;">
        <button id="individual-refine" style="
          width: 100%;
          padding: 12px;
          margin-bottom: 10px;
          border: 2px solid #28a745;
          border-radius: 5px;
          background: #f0fff0;
          cursor: pointer;
          font-size: 14px;
        ">⚙️ Refine each tab individually</button>
      </div>
      
      <div id="prompt-section" style="display: none; margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; color: #333; font-weight: bold;">
          Refinement Prompt:
        </label>
        <textarea id="refinement-prompt" placeholder="Enter your refinement instructions..." style="
          width: 100%;
          height: 80px;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          resize: vertical;
        "></textarea>
      </div>
      
      <div style="text-align: right;">
        <button id="cancel-btn" style="
          padding: 8px 16px;
          margin-right: 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          background: white;
          cursor: pointer;
        ">Cancel</button>
        <button id="proceed-btn" style="
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          background: #007cba;
          color: white;
          cursor: pointer;
          display: none;
        ">Proceed</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const promptSection = dialog.querySelector("#prompt-section");
    const promptTextarea = dialog.querySelector("#refinement-prompt");
    const proceedBtn = dialog.querySelector("#proceed-btn");

    let selectedAction = null;

    // Button event handlers
    dialog.querySelector("#save-only").addEventListener("click", () => {
      selectedAction = "save";
      promptSection.style.display = "none";
      proceedBtn.style.display = "none";
      finishDialog();
    });

    dialog.querySelector("#batch-refine").addEventListener("click", () => {
      selectedAction = "batch";
      promptSection.style.display = "block";
      proceedBtn.style.display = "inline-block";
      promptTextarea.focus();
    });

    dialog.querySelector("#individual-refine").addEventListener("click", () => {
      selectedAction = "refine";
      promptSection.style.display = "block";
      proceedBtn.style.display = "inline-block";
      promptTextarea.focus();
    });

    dialog.querySelector("#cancel-btn").addEventListener("click", () => {
      document.body.removeChild(overlay);
      resolve({ action: null, prompt: null, cancelled: true });
    });

    dialog.querySelector("#proceed-btn").addEventListener("click", () => {
      finishDialog();
    });

    function finishDialog() {
      const prompt =
        selectedAction === "save" ? null : promptTextarea.value.trim();
      document.body.removeChild(overlay);
      resolve({ action: selectedAction, prompt: prompt });
    }

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve({ action: null, prompt: null, cancelled: true });
      }
    });
  });
}
