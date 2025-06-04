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

// Store for pending refinement
let pendingRefinement = null;

// Tab event listeners to reset refinement state on tab switch
browser.tabs.onActivated.addListener((activeInfo) => {
  handleTabSwitch(activeInfo.tabId, activeInfo.windowId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Reset on navigation within a tab (URL change)
  if (changeInfo.url && pendingRefinement) {
    handleTabSwitch(tabId, tab.windowId);
  }
});

// Function to handle tab switching and clear refinement state if needed
function handleTabSwitch(newTabId, windowId) {
  if (!pendingRefinement) return;

  // Check if switched to a different tab than the ones involved in refinement
  const isOriginalTab = pendingRefinement.originTabIds?.includes(newTabId);
  const isSameWindow = pendingRefinement.windowId === windowId;

  if (!isOriginalTab || !isSameWindow) {
    clearPendingRefinement("tab-switch");
  }
}

// Centralized function to clear pending refinement state
function clearPendingRefinement(reason = "manual") {
  if (pendingRefinement) {
    console.log(`🧹 Clearing pending refinement state (reason: ${reason})`);
    pendingRefinement = null;
    browser.browserAction.setBadgeText({ text: "" });
    browser.browserAction.setBadgeBackgroundColor({ color: "#000000" });
  }
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request);

  if (request.command === "store-for-refinement") {
    // Store content for refinement in popup
    pendingRefinement = {
      markdown: request.markdown,
      isMultiTab: request.isMultiTab,
      url: request.url,
      title: request.title,
      timestamp: Date.now(),
      tabCount: request.tabCount || 1,
      originTabIds: [sender.tab?.id].filter(Boolean), // Store the originating tab ID
      windowId: sender.tab?.windowId, // Store the window ID
    };
    console.log("Stored pending refinement:", pendingRefinement);
    // Badge will be set later when we know the actual tab count
    sendResponse({ status: "stored" });
  } else if (request.command === "get-pending-refinement") {
    console.log(
      "Get pending refinement request, current pendingRefinement:",
      pendingRefinement
    );
    sendResponse({ pendingRefinement });
  } else if (request.command === "clear-pending-refinement") {
    clearPendingRefinement("user-cancel");
    sendResponse({ status: "cleared" });
  } else if (request.command === "process-refinement") {
    // Handle refinement processing from popup
    if (pendingRefinement && request.prompt) {
      processRefinementFromPopup(
        request.prompt,
        sendResponse,
        request.collective
      );
      return true;
    } else if (pendingRefinement && !request.prompt) {
      // Save without refinement
      saveWithoutRefinement(sendResponse);
      return true;
    } else {
      sendResponse({ status: "error", message: "No pending content" });
    }
  } else if (request.command === "save-url") {
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
  } else if (request.command === "copy-as-markdown") {
    copyAsMarkdown()
      .then((response) => {
        sendResponse(response || { status: "success" });
      })
      .catch((error) => {
        console.error("Error in copy-as-markdown command:", {
          error: error.message,
          stack: error.stack,
        });
        sendResponse({ status: "error", message: error.message });
      });
    return true;
  }
});

async function saveCurrentTabUrl() {
  console.log(
    "🚀 saveCurrentTabUrl() function called (this handles copy-as-markdown)"
  );
  try {
    const selectedTabs = await getSelectedTabs();
    console.log("📊 Selected tabs count:", selectedTabs.length);

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

    // For LLM processing, handle single vs multi-tab differently
    const isMultiTab = selectedTabs.length > 1;

    // All tabs (single and multi) now use popup approach
    const firstTabResponse = await browser.tabs.sendMessage(
      selectedTabs[0].id,
      {
        command: "convert-to-markdown",
        isMultiTab,
        isFirstTab: true,
      }
    );

    console.log("Checking firstTabResponse:", {
      hasResponse: !!firstTabResponse,
      action: firstTabResponse?.action,
      isMultiTab: isMultiTab,
      enableLLM: enableLLM,
      hasApiKey: !!apiKey,
    });

    if (firstTabResponse && firstTabResponse.action === "pending-refinement") {
      console.log("✅ Taking popup refinement path for multi-tab");
      // Update badge and pending refinement with correct data FIRST
      if (pendingRefinement) {
        pendingRefinement.tabCount = selectedTabs.length;
        pendingRefinement.isMultiTab = isMultiTab;
        pendingRefinement.allTabs = selectedTabs; // Add all tabs for multi-tab processing
        pendingRefinement.copyAfterRefinement = true; // This is a copy operation
        pendingRefinement.originTabIds = selectedTabs.map((tab) => tab.id); // Store all tab IDs
        pendingRefinement.windowId = selectedTabs[0]?.windowId; // Store window ID

        const badgeText = selectedTabs.length.toString();
        browser.browserAction.setBadgeText({ text: badgeText });
        browser.browserAction.setBadgeBackgroundColor({ color: "#FF6B35" });

        console.log(
          "Updated pending refinement for multi-tab:",
          pendingRefinement
        );
      }

      // Now that data is correct, open popup for refinement
      try {
        browser.browserAction.openPopup();
      } catch (error) {
        // Fallback notification if popup can't be opened automatically
        console.log(
          "Could not auto-open popup, user will need to click extension icon"
        );
      }

      // Content is now stored for popup refinement
      return {
        status: "pending-refinement",
        message: "Content ready for refinement - popup opened",
      };
    }

    // Fallback to direct processing if no LLM refinement needed
    console.log(
      "❌ Not taking popup refinement path, falling back to direct processing:",
      {
        hasFirstTabResponse: !!firstTabResponse,
        firstTabResponseAction: firstTabResponse?.action,
        enableLLM: enableLLM,
        hasApiKey: !!apiKey,
      }
    );

    if (!firstTabResponse || !enableLLM || !apiKey) {
      const tabResponse = await browser.tabs.sendMessage(selectedTabs[0].id, {
        command: "convert-to-markdown",
        isMultiTab: false,
        isFirstTab: true,
      });

      if (tabResponse && tabResponse.action === "pending-refinement") {
        // Update badge with correct tab count for save operation
        if (pendingRefinement) {
          pendingRefinement.tabCount = selectedTabs.length;
          pendingRefinement.originTabIds = selectedTabs.map((tab) => tab.id); // Store all tab IDs
          pendingRefinement.windowId = selectedTabs[0]?.windowId; // Store window ID
          const badgeText = selectedTabs.length.toString();
          browser.browserAction.setBadgeText({ text: badgeText });
          browser.browserAction.setBadgeBackgroundColor({ color: "#FF6B35" });
        }

        // Automatically open popup for refinement
        try {
          browser.browserAction.openPopup();
        } catch (error) {
          // Fallback notification if popup can't be opened automatically
          console.log(
            "Could not auto-open popup, user will need to click extension icon"
          );
        }

        // Content is now stored for popup refinement
        return {
          status: "Content ready for refinement - popup opened",
        };
      }
    }

    // Fallback to direct processing
    await processTabsDirectly(selectedTabs, markdownData);
    await browser.tabs.sendMessage(selectedTabs[0].id, {
      command: "show-notification",
      message: `${selectedTabs.length} page${
        selectedTabs.length > 1 ? "s" : ""
      } saved successfully`,
    });
    return { status: "URLs saved successfully" };
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
  console.log("🚀 ACTUAL copyAsMarkdown() function called");
  try {
    const selectedTabs = await getSelectedTabs();
    console.log("📊 Selected tabs in copyAsMarkdown:", selectedTabs.length);

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

    console.log("🔍 copyAsMarkdown settings:", {
      enableLLM,
      hasApiKey: !!apiKey,
      selectedTabsCount: selectedTabs.length,
    });

    // If LLM is disabled or no API key, process all tabs directly
    if (!enableLLM || !apiKey) {
      console.log(
        "❌ LLM disabled or no API key, falling back to direct processing"
      );
      await processTabsDirectly(selectedTabs, markdownData);
      await copyTabsDirectly(selectedTabs);
      return;
    }

    // For LLM processing - both single and multi-tab now use popup approach
    const isMultiTab = selectedTabs.length > 1;

    console.log("✅ LLM enabled, proceeding with popup refinement flow");

    // All tabs (single and multi) now use popup approach
    const firstTabResponse = await browser.tabs.sendMessage(
      selectedTabs[0].id,
      {
        command: "convert-to-markdown",
        isMultiTab,
        isFirstTab: true,
      }
    );

    console.log("📝 First tab response:", {
      hasResponse: !!firstTabResponse,
      action: firstTabResponse?.action,
      isMultiTab: isMultiTab,
    });

    if (firstTabResponse && firstTabResponse.action === "pending-refinement") {
      console.log("✅ Taking popup refinement path");
      // Update badge and pending refinement with correct data FIRST
      if (pendingRefinement) {
        pendingRefinement.tabCount = selectedTabs.length;
        pendingRefinement.isMultiTab = isMultiTab;
        pendingRefinement.allTabs = selectedTabs; // Add all tabs for multi-tab processing
        pendingRefinement.copyAfterRefinement = true; // This is a copy operation
        pendingRefinement.originTabIds = selectedTabs.map((tab) => tab.id); // Store all tab IDs
        pendingRefinement.windowId = selectedTabs[0]?.windowId; // Store window ID

        const badgeText = selectedTabs.length.toString();
        browser.browserAction.setBadgeText({ text: badgeText });
        browser.browserAction.setBadgeBackgroundColor({ color: "#FF6B35" });

        console.log(
          "🔄 Updated pending refinement for copy operation:",
          pendingRefinement
        );
      }

      // Now that data is correct, open popup for refinement
      try {
        browser.browserAction.openPopup();
      } catch (error) {
        // Fallback notification if popup can't be opened automatically
        console.log(
          "Could not auto-open popup, user will need to click extension icon"
        );
      }

      // Content is now stored for popup refinement
      return {
        status: "pending-refinement",
        message: "Content ready for refinement - popup opened",
      };
    }

    // Fallback to direct processing if no LLM refinement needed
    console.log(
      "❌ Not taking popup refinement path, falling back to direct copy"
    );
    await processTabsDirectly(selectedTabs, markdownData);
    await copyTabsDirectly(selectedTabs);
    return { status: "success" };
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

// Functions to handle popup-based refinement
async function processRefinementFromPopup(
  prompt,
  sendResponse,
  collective = false
) {
  try {
    if (!pendingRefinement) {
      sendResponse({ status: "error", message: "No pending content" });
      return;
    }

    const result = await browser.storage.local.get(["apiKey", "markdownData"]);
    const apiKey = result.apiKey;
    const markdownData = result.markdownData || [];

    if (!apiKey) {
      sendResponse({ status: "error", message: "No API key configured" });
      return;
    }

    if (
      pendingRefinement.isMultiTab &&
      pendingRefinement.allTabs &&
      collective
    ) {
      // Collective refinement: combine all tabs and process as one
      try {
        const { processBatchContent } = await import("./llmProcessor.js");
        const batchResult = await processBatchContent(
          pendingRefinement.allTabs,
          prompt,
          apiKey
        );

        if (batchResult) {
          // Save the combined result
          const existingIndex = markdownData.findIndex(
            (item) => item.url === batchResult.url
          );

          if (existingIndex !== -1) {
            markdownData[existingIndex] = batchResult;
          } else {
            markdownData.push(batchResult);
          }

          await browser.storage.local.set({ markdownData });

          // Check if this was triggered by copy-as-markdown
          const shouldCopy = pendingRefinement.copyAfterRefinement;

          // Clear pending refinement and badge
          pendingRefinement = null;
          await browser.browserAction.setBadgeText({ text: "" });

          if (shouldCopy) {
            try {
              await navigator.clipboard.writeText(batchResult.markdown);
              sendResponse({
                status: "success",
                message:
                  "Content refined collectively and copied to clipboard!",
              });
            } catch (clipboardError) {
              console.error("Clipboard error:", clipboardError);
              sendResponse({
                status: "success",
                message: "Content refined collectively and saved!",
              });
            }
          } else {
            sendResponse({
              status: "success",
              message: "Content refined collectively and saved!",
            });
          }
          return;
        }
      } catch (error) {
        console.error("Error in collective refinement:", error);
        sendResponse({ status: "error", message: error.message });
        return;
      }
    } else if (pendingRefinement.isMultiTab && pendingRefinement.allTabs) {
      // Process multiple tabs with the same prompt
      let processedCount = 0;
      for (const tab of pendingRefinement.allTabs) {
        try {
          // Get markdown for each tab
          const tabResponse = await browser.tabs.sendMessage(tab.id, {
            command: "convert-to-markdown",
            isFirstTab: false,
          });

          if (tabResponse && tabResponse.markdown) {
            const refinedMarkdown = await refineMDWithLLM(
              tabResponse.markdown,
              prompt,
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
              processedCount++;
            }
          }
        } catch (error) {
          console.error(`Error processing tab ${tab.url}:`, error);
        }
      }

      await browser.storage.local.set({ markdownData });

      // Check if this was triggered by copy-as-markdown
      const shouldCopy = pendingRefinement.copyAfterRefinement;
      const allTabUrls = pendingRefinement.allTabs.map((tab) => tab.url);

      // Clear pending refinement and badge
      clearPendingRefinement("refinement-complete");

      if (shouldCopy) {
        // For multi-tab copy, combine all refined content
        let combinedMarkdown = "";
        for (const item of markdownData.filter((item) =>
          allTabUrls.includes(item.url)
        )) {
          combinedMarkdown += `<url>${item.url}</url>\n<title>${item.title}</title>\n${item.markdown}\n\n`;
        }

        try {
          await navigator.clipboard.writeText(combinedMarkdown);
          sendResponse({
            status: "success",
            message: `${processedCount} tabs refined, saved and copied to clipboard`,
          });
        } catch (err) {
          sendResponse({
            status: "success",
            message: `${processedCount} tabs refined and saved (clipboard copy failed)`,
          });
        }
      } else {
        sendResponse({
          status: "success",
          message: `${processedCount} tabs refined and saved`,
        });
      }
    } else {
      // Process single tab (original logic)
      const refinedMarkdown = await refineMDWithLLM(
        pendingRefinement.markdown,
        prompt,
        apiKey,
        null // No tabId needed for popup refinement
      );

      if (refinedMarkdown) {
        // Save refined content
        const existingIndex = markdownData.findIndex(
          (item) => item.url === pendingRefinement.url
        );
        const newEntry = {
          url: pendingRefinement.url,
          title: pendingRefinement.title,
          markdown: refinedMarkdown,
          savedAt: new Date().toISOString(),
        };

        if (existingIndex !== -1) {
          markdownData[existingIndex] = newEntry;
        } else {
          markdownData.push(newEntry);
        }

        await browser.storage.local.set({ markdownData });

        // Check if this was triggered by copy-as-markdown
        const shouldCopy = pendingRefinement.copyAfterRefinement;

        // Clear pending refinement and badge
        clearPendingRefinement("refinement-complete");

        // If this was a copy operation, copy to clipboard
        if (shouldCopy) {
          const markdownWithMeta = `<url>${newEntry.url}</url>\n<title>${newEntry.title}</title>\n${refinedMarkdown}`;
          try {
            await navigator.clipboard.writeText(markdownWithMeta);
            sendResponse({
              status: "success",
              message: "Content refined, saved and copied to clipboard",
              markdown: refinedMarkdown,
            });
          } catch (err) {
            sendResponse({
              status: "success",
              message: "Content refined and saved (clipboard copy failed)",
              markdown: refinedMarkdown,
            });
          }
        } else {
          sendResponse({
            status: "success",
            message: "Content refined and saved",
            markdown: refinedMarkdown,
          });
        }
      } else {
        sendResponse({ status: "error", message: "Failed to refine content" });
      }
    }
  } catch (error) {
    console.error("Error in processRefinementFromPopup:", error);
    sendResponse({ status: "error", message: error.message });
  }
}

async function saveWithoutRefinement(sendResponse) {
  try {
    if (!pendingRefinement) {
      sendResponse({ status: "error", message: "No pending content" });
      return;
    }

    const result = await browser.storage.local.get(["markdownData"]);
    let markdownData = result.markdownData || [];

    // Check if this is multi-tab or single-tab
    if (pendingRefinement.isMultiTab && pendingRefinement.allTabs) {
      console.log(
        "🔄 Processing multi-tab save without refinement:",
        pendingRefinement.allTabs.length,
        "tabs"
      );

      // Process all tabs
      let combinedMarkdown = "";
      let processedCount = 0;

      for (const tab of pendingRefinement.allTabs) {
        try {
          // Get content from each tab
          const response = await browser.tabs.sendMessage(tab.id, {
            command: "convert-to-markdown",
          });

          if (response && response.markdown) {
            processedCount++;

            // Save each tab individually
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

            // Add to combined clipboard content
            combinedMarkdown += `<url>${tab.url}</url>\n<title>${tab.title}</title>\n${response.markdown}\n\n`;
          }
        } catch (error) {
          console.error(`Error processing tab ${tab.url}:`, error);
        }
      }

      await browser.storage.local.set({ markdownData });

      // Check if this was triggered by copy-as-markdown
      const shouldCopy = pendingRefinement.copyAfterRefinement;

      // Clear pending refinement and badge
      clearPendingRefinement("save-complete");

      // If this was a copy operation, copy combined content to clipboard
      if (shouldCopy) {
        try {
          await navigator.clipboard.writeText(combinedMarkdown);
          sendResponse({
            status: "success",
            message: `${processedCount} tabs saved and copied to clipboard`,
          });
        } catch (err) {
          sendResponse({
            status: "success",
            message: `${processedCount} tabs saved (clipboard copy failed)`,
          });
        }
      } else {
        sendResponse({
          status: "success",
          message: `${processedCount} tabs saved without refinement`,
        });
      }
    } else {
      // Single tab processing (original logic)
      const existingIndex = markdownData.findIndex(
        (item) => item.url === pendingRefinement.url
      );
      const newEntry = {
        url: pendingRefinement.url,
        title: pendingRefinement.title,
        markdown: pendingRefinement.markdown,
        savedAt: new Date().toISOString(),
      };

      if (existingIndex !== -1) {
        markdownData[existingIndex] = newEntry;
      } else {
        markdownData.push(newEntry);
      }

      await browser.storage.local.set({ markdownData });

      // Check if this was triggered by copy-as-markdown
      const shouldCopy = pendingRefinement.copyAfterRefinement;
      const savedMarkdown = pendingRefinement.markdown;

      // Clear pending refinement and badge
      clearPendingRefinement("save-complete");

      // If this was a copy operation, copy to clipboard
      if (shouldCopy) {
        const markdownWithMeta = `<url>${newEntry.url}</url>\n<title>${newEntry.title}</title>\n${savedMarkdown}`;
        try {
          await navigator.clipboard.writeText(markdownWithMeta);
          sendResponse({
            status: "success",
            message: "Content saved and copied to clipboard",
            markdown: savedMarkdown,
          });
        } catch (err) {
          sendResponse({
            status: "success",
            message: "Content saved (clipboard copy failed)",
            markdown: savedMarkdown,
          });
        }
      } else {
        sendResponse({
          status: "success",
          message: "Content saved without refinement",
          markdown: savedMarkdown,
        });
      }
    }
  } catch (error) {
    console.error("Error in saveWithoutRefinement:", error);
    sendResponse({ status: "error", message: error.message });
  }
}
