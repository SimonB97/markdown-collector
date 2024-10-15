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


import { showDiffModal, setupTipBox } from './uiComponents.js';
import { loadMarkdownData, fetchAndConvertToMarkdown } from './dataHandlers.js';
import {  } from './markdownUtils.js';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('markdown-container');
  const copyButton = document.getElementById('copy-markdown-page');
  const deleteButton = document.getElementById('delete-markdown-page');
  const updateButton = document.getElementById('update-markdown-page');
  const settingsButton = document.getElementById('open-settings');
  const tipBox = document.getElementById('tip-box');
  const understandButton = document.getElementById('understand-button');

  setupTipBox(tipBox, understandButton);

  let openUrls = new Set();

  loadMarkdownData(container, openUrls);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.markdownData) {
      loadMarkdownData(container, openUrls);
    }
  });

  /**
   * Handles incoming messages for copying selected markdown.
   */
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === 'copy-selected-markdown') {
      const selectedMarkdown = [];

      // Iterate through each date group
      const dateBoxes = container.querySelectorAll('.date-box');
      dateBoxes.forEach(dateBox => {
        const pageCheckboxes = dateBox.querySelectorAll('.page-checkbox');
        pageCheckboxes.forEach((checkbox, index) => {
          if (checkbox.checked) {
            const box = checkbox.closest('.box');
            const content = box.querySelector('.box-content textarea');
            if (content) {
              const title = box.querySelector('.box-title span').textContent;
              selectedMarkdown.push(`<url>${box.dataset.url}</url>\n<title>${title}</title>\n${content.value}`);
            }
          }
        });
      });

      const markdownText = selectedMarkdown.join('\n\n\n');
      navigator.clipboard.writeText(markdownText).then(() => {
        sendResponse({ status: 'success' });
      }).catch((err) => {
        console.error('Error copying to clipboard:', err);
        sendResponse({ status: 'failure', error: err });
      });

      // Return true to indicate that the response is sent asynchronously
      return true;
    }
  });

  // Add event listener for the copy button
  copyButton.addEventListener('click', () => {
    const selectedMarkdown = [];

    // Iterate through each date group
    const dateBoxes = container.querySelectorAll('.date-box');
    dateBoxes.forEach(dateBox => {
      const pageCheckboxes = dateBox.querySelectorAll('.page-checkbox');
      pageCheckboxes.forEach((checkbox, index) => {
        if (checkbox.checked) {
          const box = checkbox.closest('.box');
          const content = box.querySelector('.box-content textarea');
          if (content) {
            const title = box.querySelector('.box-title span').textContent;
            selectedMarkdown.push(`<url>${box.dataset.url}</url>\n<title>${title}</title>\n${content.value}`);
          }
        }
      });
    });

    const markdownText = selectedMarkdown.join('\n\n\n');
    navigator.clipboard.writeText(markdownText).then(() => {
      copyButton.textContent = '✔ Copied';
      setTimeout(() => {
        copyButton.textContent = '⎘ Copy';
      }, 2000); // Reset button text after 2 seconds
    }).catch((err) => {
      console.error('Error copying to clipboard:', err);
    });
  });

  // Add event listener for the delete button
  deleteButton.addEventListener('click', () => {
    const selectedUrls = [];

    // Collect URLs of selected entries
    const dateBoxes = container.querySelectorAll('.date-box');
    dateBoxes.forEach(dateBox => {
      const pageCheckboxes = dateBox.querySelectorAll('.page-checkbox');
      pageCheckboxes.forEach((checkbox) => {
        if (checkbox.checked) {
          const box = checkbox.closest('.box');
          selectedUrls.push(box.dataset.url);
        }
      });
    });

    // Remove selected entries from storage
    browser.storage.local.get(['markdownData']).then((result) => {
      const { markdownData } = result;
      const updatedData = markdownData.filter(item => !selectedUrls.includes(item.url));
      browser.storage.local.set({ markdownData: updatedData }).then(() => {
        loadMarkdownData(container, openUrls); // Reload the data to reflect changes
      }).catch((error) => {
        console.error("Error deleting markdownData:", error);
      });
    }).catch((error) => {
      console.error("Error getting markdownData:", error);
    });
  });

  // Add event listener for the update button
  updateButton.addEventListener('click', () => {
    const selectedUrls = [];

    // Collect URLs of selected entries
    const dateBoxes = container.querySelectorAll('.date-box');
    dateBoxes.forEach(dateBox => {
      const pageCheckboxes = dateBox.querySelectorAll('.page-checkbox');
      pageCheckboxes.forEach((checkbox) => {
        if (checkbox.checked) {
          const box = checkbox.closest('.box');
          selectedUrls.push(box.dataset.url);
        }
      });
    });

    // Fetch and update selected entries
    browser.storage.local.get(['markdownData']).then((result) => {
      const { markdownData } = result;
      selectedUrls.forEach(url => {
        const item = markdownData.find(item => item.url === url);
        if (item) {
          fetchAndConvertToMarkdown(url, (newMarkdown) => {
            const oldMarkdown = item.markdown;
            if (newMarkdown !== oldMarkdown) {
              showDiffModal(url, oldMarkdown, newMarkdown, (accepted) => {
                if (accepted) {
                  item.markdown = newMarkdown;
                  browser.storage.local.set({ markdownData }).then(() => {
                    loadMarkdownData(container, openUrls); // Reload the data to reflect changes
                  }).catch((error) => {
                    console.error("Error updating markdownData:", error);
                  });
                }
              });
            }
          });
        }
      });
    }).catch((error) => {
      console.error("Error getting markdownData:", error);
    });
  });

  // Add event listener for the settings button
  settingsButton.addEventListener('click', () => {
    browser.runtime.sendMessage({ command: 'open-settings' });
  });
});
