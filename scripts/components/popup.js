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

document.addEventListener("DOMContentLoaded", () => {
  const openMarkdownButton = document.getElementById("open-markdown");
  const copyMarkdownButton = document.getElementById("copy-markdown");
  const openSettingsButton = document.getElementById("open-settings");
  const statusMessage = document.getElementById("status-message");

  // Update initial button labels
  openMarkdownButton.innerHTML = `
    <span style="font-size: 2em;">&#8599;</span><br>
    Open Collection
    <span class="shortcut-hint">Alt+M</span>
  `;
  copyMarkdownButton.innerHTML = `
    <span style="font-size: 2em;">&#128203;</span><br>
    Copy as Markdown
    <span class="shortcut-hint">Alt+C</span>
  `;

  openMarkdownButton.addEventListener("click", () => {
    chrome.runtime.sendMessage(
      { command: "open-markdown-page" },
      (response) => {
        // Handle response if needed
      }
    );
  });

  copyMarkdownButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (currentTab) {
        chrome.runtime.sendMessage({ command: "save-url" }, (response) => {
          if (
            response &&
            response.status === "URL saved and conversion started"
          ) {
            // Wait for a short time to allow the conversion to complete
            setTimeout(() => {
              chrome.storage.local.get(["markdownData"], (result) => {
                const markdownData = result.markdownData || [];
                const currentPageData = markdownData.find(
                  (item) => item.url === currentTab.url
                );
                if (currentPageData && currentPageData.markdown) {
                  const markdownText = `<url>${currentPageData.url}</url>\n<title>${currentPageData.title}</title>\n${currentPageData.markdown}`;
                  navigator.clipboard
                    .writeText(markdownText)
                    .then(() => {
                      copyMarkdownButton.innerHTML = `
                      <span style="font-size: 2em;">&#10004;</span><br>
                      Copied
                      <span class="shortcut-hint">Alt+C</span>
                    `;
                      setTimeout(() => {
                        copyMarkdownButton.innerHTML = `
                        <span style="font-size: 2em;">&#128203;</span><br>
                        Copy as Markdown
                        <span class="shortcut-hint">Alt+C</span>
                      `;
                      }, 2000); // Reset button text after 2 seconds
                    })
                    .catch((err) => {
                      console.error("Error copying to clipboard:", {
                        error: err.message,
                        stack: err.stack,
                      });
                      showMessage(
                        `Failed to copy to clipboard: ${err.message}`,
                        "error"
                      );
                    });
                } else {
                  showMessage("Failed to get Markdown data", "error");
                }
              });
            }, 500); // Wait for 500 milliseconds before attempting to copy
          } else {
            showMessage("Failed to save and convert page", "error");
          }
        });
      } else {
        showMessage("No active tab found", "error");
      }
    });
  });

  openSettingsButton.addEventListener("click", () => {
    chrome.runtime.sendMessage({ command: "open-settings" });
  });

  function showMessage(message, type = "info") {
    statusMessage.textContent = message;
    statusMessage.style.color =
      type === "error"
        ? "#ff4444"
        : type === "warning"
        ? "#ffaa00"
        : type === "success"
        ? "#44ff44"
        : "#ffffff";
    statusMessage.style.display = "block";
    setTimeout(() => {
      statusMessage.style.display = "none";
    }, 3000); // Hide the message after 3 seconds
  }
});
