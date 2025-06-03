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

import { getSelectedTabs } from "./tabManager.js";
import { refineMDWithLLM, processBatchContent } from "./llmProcessor.js";

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request);

  if (request.command === "save-url") {
    saveCurrentTabUrl()
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        console.error("Error in save-url command:", {
          error: error.message,
          stack: error.stack,
        });
        sendResponse({ status: "Error saving URLs", error: error.message });
      });
    return true;
  } else if (request.command === "open-markdown-page") {
    openMarkdownPage();
    sendResponse({ status: "Markdown page opened" });
  } else if (request.command === "get-markdown-data") {
    browser.storage.local.get(["markdownData"]).then((result) => {
      sendResponse({ markdownData: result.markdownData });
    });
    return true;
  } else if (request.command === "open-settings") {
    openSettingsPage();
    sendResponse({ status: "Settings page opened" });
  } else if (request.command === "fetch-url") {
    fetchUrl(request.url, sendResponse);
    return true;
  }
});

async function saveCurrentTabUrl() {
  try {
    const selectedTabs = await getSelectedTabs();

    if (selectedTabs.length === 0) {
      return { status: "No tabs selected" };
    }

    // Get settings first
    const result = await browser.storage.local.get([
      "markdownData",
      "enableLLM",
      "apiKey",
    ]);
    const markdownData = result.markdownData || [];
    const enableLLM = result.enableLLM || false;
    const apiKey = result.apiKey;

    console.log("Background script settings check", {
      enableLLM,
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length,
      selectedTabsCount: selectedTabs.length,
    });

    // If LLM is disabled or no API key, process all tabs directly
    if (!enableLLM || !apiKey) {
      console.log("Falling back to direct processing", {
        enableLLM,
        hasApiKey: !!apiKey,
      });
      await processTabsDirectly(selectedTabs, markdownData);
      await browser.tabs.sendMessage(selectedTabs[0].id, {
        command: "show-notification",
        message: `${selectedTabs.length} page${
          selectedTabs.length > 1 ? "s" : ""
        } saved successfully`,
      });
      return { status: "URLs saved successfully" };
    }

    // For LLM processing with multiple tabs
    const isMultiTab = selectedTabs.length > 1;

    // Get prompt from first tab
    const firstTabResponse = await browser.tabs.sendMessage(
      selectedTabs[0].id,
      {
        command: "convert-to-markdown",
        isMultiTab,
        isFirstTab: true,
      }
    );

    if (!firstTabResponse || firstTabResponse.cancelled) {
      return { status: "Operation cancelled" };
    }

    // If no prompt provided or empty prompt, process directly without LLM
    // regardless of whether Enter or Shift+Enter was used
    if (
      firstTabResponse.action === "save" ||
      !firstTabResponse.prompt?.trim()
    ) {
      await processTabsDirectly(selectedTabs, markdownData);
      await browser.tabs.sendMessage(selectedTabs[0].id, {
        command: "show-notification",
        message: `${selectedTabs.length} page${
          selectedTabs.length > 1 ? "s" : ""
        } saved successfully`,
      });
      return { status: "URLs saved without refinement" };
    }

    if (firstTabResponse.action === "batch") {
      const batchResult = await processBatchContent(
        selectedTabs,
        firstTabResponse.prompt,
        apiKey
      );
      if (batchResult) {
        markdownData.push(batchResult);
        await browser.storage.local.set({ markdownData });
        await browser.tabs.sendMessage(selectedTabs[0].id, {
          command: "show-notification",
          message: `${selectedTabs.length} pages processed and saved as batch`,
        });
        return { status: "Batch processing completed successfully" };
      } else {
        // If batch processing returned null (empty prompt), fall back to individual processing
        await processTabsDirectly(selectedTabs, markdownData);
        await browser.tabs.sendMessage(selectedTabs[0].id, {
          command: "show-notification",
          message: `${selectedTabs.length} page${
            selectedTabs.length > 1 ? "s" : ""
          } saved successfully`,
        });
        return { status: "URLs saved without refinement" };
      }
    } else if (firstTabResponse.action === "refine") {
      let processedCount = 0;
      for (const tab of selectedTabs) {
        const tabResponse = await browser.tabs.sendMessage(tab.id, {
          command: "convert-to-markdown",
          isFirstTab: false,
        });

        if (tabResponse && tabResponse.markdown) {
          processedCount++;
          const refinedMarkdown = await refineMDWithLLM(
            tabResponse.markdown,
            firstTabResponse.prompt,
            apiKey,
            tab.id
          );

          if (refinedMarkdown) {
            const existingIndex = markdownData.findIndex(
              (item) => item.url === tab.url
            );
            const newEntry = {
              url: tab.url,
              title: tab.title,
              markdown: refinedMarkdown,
              savedAt: new Date().toISOString(),
            };

            if (existingIndex !== -1) {
              markdownData[existingIndex] = newEntry;
            } else {
              markdownData.push(newEntry);
            }
          }
        }
      }
      await browser.storage.local.set({ markdownData });
      await browser.tabs.sendMessage(selectedTabs[0].id, {
        command: "show-notification",
        message: `${processedCount} page${
          processedCount > 1 ? "s" : ""
        } processed and saved`,
      });
      return { status: "Individual processing completed successfully" };
    }

    return { status: "No action taken" };
  } catch (error) {
    console.error("Error in saveCurrentTabUrl:", error.message);

    if (selectedTabs?.length > 0) {
      // Provide more specific error message to user
      const userMessage = error.message.includes("API")
        ? `LLM API Error: ${error.message}`
        : error.message.includes("network") || error.message.includes("fetch")
        ? "Network Error: Unable to connect to LLM service"
        : error.message.includes("Storage")
        ? "Storage Error: Unable to save content"
        : `Processing Error: ${error.message}`;

      await browser.tabs.sendMessage(selectedTabs[0].id, {
        command: "show-notification",
        message: userMessage,
        type: "error",
      });
    }
    throw error;
  }
}

// Update processTabsDirectly to handle notifications
async function processTabsDirectly(tabs, markdownData) {
  let processedCount = 0;
  for (const tab of tabs) {
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        command: "convert-to-markdown",
      });
      if (response && response.markdown) {
        processedCount++;
        const existingIndex = markdownData.findIndex(
          (item) => item.url === tab.url
        );
        const newEntry = {
          url: tab.url,
          title: tab.title,
          markdown: response.markdown,
          savedAt: new Date().toISOString(),
        };

        if (existingIndex !== -1) {
          markdownData[existingIndex] = newEntry;
        } else {
          markdownData.push(newEntry);
        }
      }
    } catch (error) {
      console.error(`Error processing tab ${tab.url}:`, {
        error: error.message,
        stack: error.stack,
        url: tab.url,
        title: tab.title,
      });

      const errorMessage = error.message.includes("convert-to-markdown")
        ? "Error converting page content to markdown"
        : error.message.includes("Storage")
        ? "Error saving content to storage"
        : `Page processing error: ${error.message}`;

      await browser.tabs.sendMessage(tab.id, {
        command: "show-notification",
        message: errorMessage,
        type: "error",
      });
    }
  }
  await browser.storage.local.set({ markdownData });
  return processedCount;
}

async function processTab(tab, markdownData) {
  try {
    const response = await browser.tabs.sendMessage(tab.id, {
      command: "convert-to-markdown",
    });

    if (response && response.markdown) {
      const existingIndex = markdownData.findIndex(
        (item) => item.url === tab.url
      );

      if (existingIndex === -1) {
        markdownData.push({
          url: tab.url,
          title: tab.title,
          markdown: response.markdown,
          savedAt: new Date().toISOString(),
        });
      } else {
        markdownData[existingIndex] = {
          ...markdownData[existingIndex],
          markdown: response.markdown,
          savedAt: new Date().toISOString(),
        };
      }

      await browser.storage.local.set({ markdownData });
    }
  } catch (error) {
    console.error(`Error processing tab ${tab.url}:`, error);
    throw error;
  }
}

function updateMarkdownData(tab, markdown) {
  console.log("Updating markdown data for tab:", tab.url);
  browser.storage.local.get(["markdownData"], (result) => {
    const markdownData = result.markdownData || [];
    const index = markdownData.findIndex((item) => item.url === tab.url);
    if (index !== -1) {
      markdownData[index].markdown = markdown;
      markdownData[index].isLoading = false;
      browser.storage.local.set({ markdownData }, () => {
        if (browser.runtime.lastError) {
          console.error(
            "Error updating markdownData:",
            browser.runtime.lastError
          );
        } else {
          console.log("Markdown data updated successfully");
        }
      });
    } else {
      console.error("URL not found in markdownData:", tab.url);
    }
  });
}

function openMarkdownPage() {
  const markdownUrl = browser.runtime.getURL("markdown.html");

  browser.tabs.query({}, (tabs) => {
    const existingTab = tabs.find((tab) => tab.url === markdownUrl);

    if (existingTab) {
      browser.tabs.update(existingTab.id, { active: true }, (updatedTab) => {
        browser.windows.update(updatedTab.windowId, { focused: true });
      });
    } else {
      browser.tabs.create({ url: markdownUrl }, (tab) => {
        if (browser.runtime.lastError) {
          console.error(
            "Error opening markdown page:",
            browser.runtime.lastError
          );
        } else {
          console.log("Markdown page opened successfully");
        }
      });
    }
  });
}

function openSettingsPage() {
  const settingsUrl = browser.runtime.getURL("settings.html");

  browser.tabs.query({}, (tabs) => {
    const existingTab = tabs.find((tab) => tab.url === settingsUrl);

    if (existingTab) {
      browser.tabs.update(existingTab.id, { active: true }, (updatedTab) => {
        browser.windows.update(updatedTab.windowId, { focused: true });
      });
    } else {
      browser.tabs.create({ url: settingsUrl }, (tab) => {
        if (browser.runtime.lastError) {
          console.error(
            "Error opening settings page:",
            browser.runtime.lastError
          );
        } else {
          console.log("Settings page opened successfully");
        }
      });
    }
  });
}

function fetchUrl(url, sendResponse) {
  console.log(`Fetching URL: ${url}`);

  fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then((html) => {
      console.log(`Successfully fetched URL: ${url}`);
      sendResponse({ html: html });
      console.log("Sent response with HTML");
    })
    .catch((error) => {
      console.error("Error fetching URL:", error);
      sendResponse({ error: error.message });
      console.log("Sent response with error");
    });

  return true;
}

function performFetch(url, sendResponse) {
  console.log(`Performing fetch for URL: ${url}`);

  browser.tabs.create({ url: url, active: false }, (tab) => {
    browser.tabs.executeScript(tab.id, { file: "fetchContent.js" }, () => {
      browser.tabs.sendMessage(
        tab.id,
        { command: "getPageContent" },
        (response) => {
          browser.tabs.remove(tab.id);
          if (response && response.html) {
            sendResponse({ html: response.html });
          } else {
            sendResponse({ error: "Failed to fetch content" });
          }
        }
      );
    });
  });

  return true;
}

browser.commands.onCommand.addListener((command) => {
  console.log("Command received:", command);
  if (command === "save-url") {
    console.log("Executing save-url command");
    saveCurrentTabUrl();
  } else if (command === "open-markdown-page") {
    console.log("Executing open-markdown-page command");
    openMarkdownPage();
  } else if (command === "copy-as-markdown") {
    console.log("Executing copy-as-markdown command");
    copyAsMarkdown()
      .then(() => {
        console.log("Copy as markdown completed");
      })
      .catch((error) => {
        console.error("Error in copy-as-markdown:", error);
      });
  }
});

function checkCommands() {
  browser.commands.getAll((commands) => {
    console.log("Registered commands:", commands);
  });
}

checkCommands();

function jsonToMarkdown(json) {
  let markdown = "";

  if (json.title) {
    markdown += `# ${json.title}\n\n`;
  }

  if (json.content && Array.isArray(json.content)) {
    json.content.forEach((item) => {
      switch (item.type) {
        case "heading":
          const level = item.level || 2;
          markdown += `${"#".repeat(level)} ${item.content}\n\n`;
          break;
        case "paragraph":
          markdown += `${item.content}\n\n`;
          break;
        case "list":
          if (Array.isArray(item.content)) {
            item.content.forEach((listItem) => {
              markdown += `- ${listItem}\n`;
            });
            markdown += "\n";
          }
          break;
        case "code":
          if (item.language) {
            markdown += `\`\`\`${item.language}\n${item.content}\n\`\`\`\n\n`;
          } else {
            markdown += `\`\`\`\n${item.content}\n\`\`\`\n\n`;
          }
          break;
        case "quote":
          markdown += `> ${item.content}\n\n`;
          break;
        default:
          markdown += `${item.content}\n\n`;
      }
    });
  }

  return markdown.trim();
}

function removeMarkdownData(tab) {
  browser.storage.local.get(["markdownData"], (result) => {
    const markdownData = result.markdownData || [];
    const updatedMarkdownData = markdownData.filter(
      (item) => item.url !== tab.url
    );
    browser.storage.local.set({ markdownData: updatedMarkdownData }, () => {
      if (browser.runtime.lastError) {
        console.error(
          "Error removing markdownData:",
          browser.runtime.lastError
        );
      } else {
        console.log("Markdown data removed successfully");
      }
    });
  });
}

/**
 * Reverts the loading state of markdown data for a given tab.
 *
 * This function retrieves the markdown data from Chrome's local storage,
 * updates the loading state of the markdown data for the specified tab,
 * and then saves the updated markdown data back to local storage.
 *
 * @param {Object} tab - The tab object containing the URL of the tab.
 * @param {string} tab.url - The URL of the tab to revert the markdown data for.
 */
function revertMarkdownData(tab) {
  browser.storage.local.get(["markdownData"], (result) => {
    const markdownData = result.markdownData || [];
    const updatedMarkdownData = markdownData.map((item) => {
      if (item.url === tab.url) {
        return { ...item, isLoading: false };
      }
      return item;
    });
    browser.storage.local.set({ markdownData: updatedMarkdownData }, () => {
      if (browser.runtime.lastError) {
        console.error(
          "Error reverting markdownData:",
          browser.runtime.lastError
        );
      } else {
        console.log("Markdown data reverted successfully");
      }
    });
  });
}
/**
 * Copies the current active tab's content as Markdown.
 *
 * This function queries the active tab in the current window and sends a message
 * to the content script to convert the content to Markdown. If the conversion is
 * successful, it optionally refines the Markdown using a language model (LLM) if
 * enabled and an API key is provided. Finally, it proceeds with copying and saving
 * the Markdown content.
 *
 * @function
 * @name copyAsMarkdown
 *
 * @example
 * // Call the function to copy the active tab's content as Markdown
 * copyAsMarkdown();
 *
 * @throws Will log an error if no active tab is found or if there is an error sending
 * the message to the content script.
 */
async function copyAsMarkdown() {
  try {
    const selectedTabs = await getSelectedTabs();

    if (!selectedTabs.length) {
      console.error("No tabs selected");
      return;
    }

    // Get all required storage data at the start
    const result = await browser.storage.local.get([
      "enableLLM",
      "apiKey",
      "markdownData",
    ]);
    const enableLLM = result.enableLLM || false;
    const apiKey = result.apiKey;
    let markdownData = result.markdownData || [];

    // If LLM is disabled or no API key, process all tabs directly
    if (!enableLLM || !apiKey) {
      await processTabsDirectly(selectedTabs, markdownData);
      await copyTabsDirectly(selectedTabs);
      return;
    }

    // For LLM processing with multiple tabs
    const isMultiTab = selectedTabs.length > 1;

    // Get prompt from first tab
    const firstTabResponse = await browser.tabs.sendMessage(
      selectedTabs[0].id,
      {
        command: "convert-to-markdown",
        isMultiTab,
        isFirstTab: true,
      }
    );

    if (!firstTabResponse || firstTabResponse.cancelled) {
      return;
    }

    // If no prompt provided, process directly without LLM
    if (
      firstTabResponse.action === "save" ||
      !firstTabResponse.prompt?.trim()
    ) {
      // First save all tabs individually
      await processTabsDirectly(selectedTabs, markdownData);

      // Then combine for clipboard only
      let combinedMarkdown = "";
      for (const tab of selectedTabs) {
        const response = await browser.tabs.sendMessage(tab.id, {
          command: "convert-to-markdown",
        });
        if (response && response.markdown) {
          combinedMarkdown += `<url>${tab.url}</url>\n<title>${tab.title}</title>\n${response.markdown}\n\n`;
        }
      }

      // Copy combined version to clipboard
      await navigator.clipboard.writeText(combinedMarkdown);
      await browser.tabs.sendMessage(selectedTabs[0].id, {
        command: "show-notification",
        message: `${selectedTabs.length} pages copied and saved`,
      });
      return;
    }

    if (firstTabResponse.action === "batch") {
      const batchResult = await processBatchContent(
        selectedTabs,
        firstTabResponse.prompt,
        apiKey
      );
      if (batchResult) {
        await copyToClipboardAndSave(
          selectedTabs[0],
          batchResult.markdown,
          batchResult
        );
      } else {
        // If batch processing returned null (empty prompt), process individually
        await processTabsDirectly(selectedTabs, markdownData); // Save as individual entries
        await copyTabsDirectly(selectedTabs); // Combine only for clipboard
      }
    } else if (firstTabResponse.action === "refine") {
      let combinedMarkdown = "";
      for (const tab of selectedTabs) {
        const tabResponse = await browser.tabs.sendMessage(tab.id, {
          command: "convert-to-markdown",
          isFirstTab: false,
        });

        if (tabResponse && tabResponse.markdown) {
          const refinedMarkdown = await refineMDWithLLM(
            tabResponse.markdown,
            firstTabResponse.prompt,
            apiKey,
            tab.id
          );

          if (refinedMarkdown) {
            // Save individual entry
            const existingIndex = markdownData.findIndex(
              (item) => item.url === tab.url
            );
            const newEntry = {
              url: tab.url,
              title: tab.title,
              markdown: refinedMarkdown,
              savedAt: new Date().toISOString(),
            };

            if (existingIndex !== -1) {
              markdownData[existingIndex] = newEntry;
            } else {
              markdownData.push(newEntry);
            }

            // Add to combined markdown for clipboard
            combinedMarkdown += `<url>${tab.url}</url>\n<title>${tab.title}</title>\n${refinedMarkdown}\n\n`;
          }
        }
      }
      await browser.storage.local.set({ markdownData });
      await navigator.clipboard.writeText(combinedMarkdown);
      await browser.tabs.sendMessage(selectedTabs[0].id, {
        command: "show-notification",
        message: "Markdown copied to clipboard and saved",
      });
    }
  } catch (error) {
    console.error("Error in copyAsMarkdown:", error);
    throw error;
  }
}

// Update copyTabsDirectly to handle notifications
async function copyTabsDirectly(tabs) {
  let combinedMarkdown = "";
  let processedCount = 0;
  for (const tab of tabs) {
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        command: "convert-to-markdown",
      });
      if (response && response.markdown) {
        processedCount++;
        combinedMarkdown += `<url>${tab.url}</url>\n<title>${tab.title}</title>\n${response.markdown}\n\n`;
      }
    } catch (error) {
      console.error(`Error processing tab ${tab.url}:`, error);
      await browser.tabs.sendMessage(tab.id, {
        command: "show-notification",
        message: "Error processing page",
        type: "error",
      });
    }
  }
  if (processedCount > 0) {
    await copyToClipboardAndSave(tabs[0], combinedMarkdown);
    await browser.tabs.sendMessage(tabs[0].id, {
      command: "show-notification",
      message: `${processedCount} page${
        processedCount > 1 ? "s" : ""
      } copied and saved`,
    });
  }
}

async function copyToClipboardAndSave(tab, markdown, batchInfo = null) {
  try {
    // Copy to clipboard
    await navigator.clipboard.writeText(markdown);

    // Save to storage
    const result = await browser.storage.local.get(["markdownData"]);
    const markdownData = result.markdownData || [];

    const newEntry = batchInfo || {
      url: tab.url,
      title: tab.title,
      markdown: markdown,
      savedAt: new Date().toISOString(),
    };

    const existingIndex = markdownData.findIndex(
      (item) => item.url === tab.url
    );
    if (existingIndex !== -1) {
      markdownData[existingIndex] = newEntry;
    } else {
      markdownData.push(newEntry);
    }

    await browser.storage.local.set({ markdownData });

    // Show success notification
    await browser.tabs.sendMessage(tab.id, {
      command: "show-notification",
      message: "Markdown copied to clipboard and saved",
    });
  } catch (err) {
    console.error("Error in copyToClipboardAndSave:", err);
    await browser.tabs.sendMessage(tab.id, {
      command: "show-notification",
      message: "Failed to copy to clipboard, but Markdown was saved",
      type: "warning",
    });
  }
}
