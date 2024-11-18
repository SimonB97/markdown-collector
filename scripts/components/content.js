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
  console.log("Received message in content script:", request);

  if (request.command === 'convert-to-markdown' && !isConverting && !isShowingPrompt) {
    isConverting = true;
    isShowingPrompt = true;
    
    browser.storage.local.get(['enableCleanup', 'enableLLM']).then(async (result) => {
      try {
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
            if (request.isFirstTab) {
              const response = await showPromptPopup(request.isMultiTab);
              console.log("Popup response:", response);
              sendResponse({ ...response, markdown });
            } else {
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
      } catch (error) {
        console.error("Error processing content:", error);
        sendResponse({ markdown: '' });
      } finally {
        isConverting = false;
        isShowingPrompt = false;
      }
    }).catch((error) => {
      console.error("Error accessing storage:", error);
      sendResponse({ markdown: '' });
      isConverting = false;
      isShowingPrompt = false;
    });
    return true;
  } else if (request.command === 'show-notification') {
    showNotification(request.message, request.type);
  } else if (request.command === 'show-loading') {
    showLoadingIndicator();
  } else if (request.command === 'hide-loading') {
    hideLoadingIndicator();
  }
  return false;
});

function showLoadingIndicator() {
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'loading-indicator';
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
  const loadingIndicator = document.getElementById('loading-indicator');
  if (loadingIndicator) {
    document.body.removeChild(loadingIndicator);
  }
}

const style = document.createElement('style');
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

function showPromptPopup(isMultiTab = false) {
  return new Promise((resolve) => {
    console.log("Creating prompt popup");
    const popup = document.createElement('div');
    popup.style.cssText = `
      position: fixed;
      top: 30%;
      left: 70%;
      transform: translate(-50%, -50%);
      background: var(--background-color);
      color: var(--text-color);
      padding: 20px;
      border-radius: 5px;
      border: 1px solid var(--button-border);
      box-shadow: 0 0 10px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: 'Atkinson Hyperlegible', Arial, sans-serif;
      width: 550px;
    `;
    popup.innerHTML = `
      <style>
        @font-face {
          font-family: 'Atkinson Hyperlegible';
          src: url('${browser.runtime.getURL('fonts/Atkinson-Hyperlegible-Regular-102.ttf')}') format('truetype');
          font-weight: normal;
        }
        @font-face {
          font-family: 'Atkinson Hyperlegible';
          src: url('${browser.runtime.getURL('fonts/Atkinson-Hyperlegible-Bold-102.ttf')}') format('truetype');
          font-weight: bold;
        }
        :root {
          --background-color: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? '#121212' : '#ffffff'};
          --text-color: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? '#ffffff' : '#000000'};
          --button-background: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? '#33333388' : '#f0f0f0'};
          --button-hover-background: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? '#44444485' : '#e0e0e0'};
          --button-color: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? '#ffffff' : '#000000'};
          --button-border: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? '#444444' : '#cccccc'};
        }
        h3 {
          margin-top: 0;
          color: var(--text-color);
        }
        input, button {
          font-family: 'Atkinson Hyperlegible', Arial, sans-serif;
          padding: 8px;
          margin: 5px 2px;
          border-radius: 4px;
        }
        input {
          width: calc(99%);
          background-color: #ffffff11;
          color: var(--text-color);
          border: 0px;
        }
        button {
          background-color: var(--button-background);
          color: var(--button-color);
          border: 0px;
          cursor: pointer;
        }
        button span {
          display: block;
          font-size: 0.8em;
          color: var(--text-color-light);
          margin-top: 2px;
        }
        button:hover {
          background-color: var(--button-hover-background);
        }
        .button-container {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
        }
        button {
          flex: 1;
          margin: 0 5px;
        }
      </style>
      <h3>Refine Content</h3>
      <p>Enter a prompt to refine the content:</p>
      <input type="text" id="refinement-prompt">
      <div class="button-container">
        <button id="accept-prompt">Refine<span>(Enter)</span></button>
        <button id="save-without-refine">Save<span>(Enter with empty prompt)</span></button>
        <button id="cancel-save">Cancel<span>(Esc)</span></button>
      </div>
    `;
    document.body.appendChild(popup);

    const promptInput = document.getElementById('refinement-prompt');
    const acceptButton = document.getElementById('accept-prompt');
    const saveWithoutRefineButton = document.getElementById('save-without-refine');
    const cancelButton = document.getElementById('cancel-save');

    function acceptPrompt() {
      const prompt = promptInput.value.trim();
      document.body.removeChild(popup);
      console.log("Prompt accepted:", prompt);
      if (!prompt) {
        resolve({ action: 'save' });
      } else {
        resolve({ action: 'refine', prompt });
      }
    }

    function saveWithoutRefining() {
      document.body.removeChild(popup);
      console.log("Saving without refinement");
      resolve({ action: 'save' });
    }

    function cancelSave() {
      document.body.removeChild(popup);
      console.log("Save process cancelled");
      resolve({ action: 'cancel' });
    }

    function processBatch() {
      const prompt = promptInput.value.trim();
      document.body.removeChild(popup);
      console.log("Processing as batch:", prompt);
      if (!prompt) {
        resolve({ action: 'save' });
      } else {
        resolve({ action: 'batch', prompt });
      }
    }

    acceptButton.addEventListener('click', acceptPrompt);
    saveWithoutRefineButton.addEventListener('click', saveWithoutRefining);
    cancelButton.addEventListener('click', cancelSave);

    // Handle keyboard events
    promptInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        
        // Check for Shift+Enter first
        if (event.shiftKey && isMultiTab) {
          processBatch();
          return;
        }
        
        // Regular Enter handling - always treat empty prompt as "save"
        if (!promptInput.value.trim()) {
          saveWithoutRefining();
        } else {
          acceptPrompt();
        }
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelSave();
      }
    });

    // Focus the input field when the popup is shown
    promptInput.focus();

    // Add batch processing button for multi-tab
    if (isMultiTab) {
      const batchButton = document.createElement('button');
      batchButton.id = 'batch-process';
      batchButton.innerHTML = 'Process as Batch<span>(Shift+Enter)</span>';
      document.querySelector('.button-container').appendChild(batchButton);
      
      batchButton.addEventListener('click', processBatch);
    }
  });
}

function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    background-color: ${type === 'error' ? '#ff4444' : type === 'info' ? '#27ae60' : '#e74c3c'};
    color: white;
    border-radius: 5px;
    z-index: 10000;
    font-family: Arial, sans-serif;
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    document.body.removeChild(notification);
  }, 3000);
}
