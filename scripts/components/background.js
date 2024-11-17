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

import { getSelectedTabs } from './tabManager.js';
import { refineMDWithLLM, processBatchContent } from './llmProcessor.js';

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request);

  if (request.command === "save-url") {
    saveCurrentTabUrl().then(response => {
      sendResponse(response);
    }).catch(error => {
      console.error("Error:", error);
      sendResponse({ status: "Error saving URLs", error: error.message });
    });
    return true;
  } else if (request.command === "open-markdown-page") {
    openMarkdownPage();
    sendResponse({ status: "Markdown page opened" });
  } else if (request.command === "get-markdown-data") {
    browser.storage.local.get(['markdownData']).then(result => {
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
    console.log("Selected tabs:", selectedTabs);
    
    if (selectedTabs.length === 0) {
      return { status: "No tabs selected" };
    }

    // Get settings first
    const result = await browser.storage.local.get(['markdownData', 'enableLLM', 'apiKey']);
    const markdownData = result.markdownData || [];
    const enableLLM = result.enableLLM || false;
    const apiKey = result.apiKey;
    
    // If LLM is disabled or no API key, process all tabs directly
    if (!enableLLM || !apiKey) {
      for (const tab of selectedTabs) {
        await processTab(tab, markdownData);
      }
      return { status: "URLs saved successfully" };
    }
    
    // For LLM processing with multiple tabs
    const isMultiTab = selectedTabs.length > 1;
    
    // Get prompt from first tab
    const firstTabResponse = await browser.tabs.sendMessage(
      selectedTabs[0].id, 
      { 
        command: 'convert-to-markdown', 
        isMultiTab,
        isFirstTab: true 
      }
    );
    
    console.log("First tab response:", firstTabResponse);
    
    if (!firstTabResponse || firstTabResponse.cancelled) {
      return { status: "Operation cancelled" };
    }

    if (firstTabResponse.action === 'batch') {
      console.log("Processing as batch");
      // Process all tabs as a batch
      const batchResult = await processBatchContent(selectedTabs, firstTabResponse.prompt, apiKey);
      if (batchResult) {
        markdownData.push(batchResult);
        await browser.storage.local.set({ markdownData });
        return { status: "Batch processing completed successfully" };
      }
    } else if (firstTabResponse.action === 'refine') {
      console.log("Processing tabs individually with prompt");
      // Process tabs individually with the same prompt
      for (const tab of selectedTabs) {
        const tabResponse = await browser.tabs.sendMessage(tab.id, { 
          command: 'convert-to-markdown',
          isFirstTab: false
        });
        
        if (tabResponse && tabResponse.markdown) {
          const refinedMarkdown = await refineMDWithLLM(
            tabResponse.markdown,
            firstTabResponse.prompt,
            apiKey,
            tab.id
          );
          
          if (refinedMarkdown) {
            const existingIndex = markdownData.findIndex(item => item.url === tab.url);
            const newEntry = {
              url: tab.url,
              title: tab.title,
              markdown: refinedMarkdown,
              savedAt: new Date().toISOString()
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
      return { status: "Individual processing completed successfully" };
    }
    
    return { status: "No action taken" };
    
  } catch (error) {
    console.error("Error in saveCurrentTabUrl:", error);
    throw error;
  }
}

async function processTab(tab, markdownData) {
  try {
    const response = await browser.tabs.sendMessage(tab.id, { command: 'convert-to-markdown' });
    
    if (response && response.markdown) {
      const existingIndex = markdownData.findIndex(item => item.url === tab.url);
      
      if (existingIndex === -1) {
        markdownData.push({
          url: tab.url,
          title: tab.title,
          markdown: response.markdown,
          savedAt: new Date().toISOString()
        });
      } else {
        markdownData[existingIndex] = {
          ...markdownData[existingIndex],
          markdown: response.markdown,
          savedAt: new Date().toISOString()
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
  browser.storage.local.get(['markdownData'], (result) => {
    const markdownData = result.markdownData || [];
    const index = markdownData.findIndex(item => item.url === tab.url);
    if (index !== -1) {
      markdownData[index].markdown = markdown;
      markdownData[index].isLoading = false;
      browser.storage.local.set({ markdownData }, () => {
        if (browser.runtime.lastError) {
          console.error("Error updating markdownData:", browser.runtime.lastError);
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
    const existingTab = tabs.find(tab => tab.url === markdownUrl);
    
    if (existingTab) {
      browser.tabs.update(existingTab.id, { active: true }, (updatedTab) => {
        browser.windows.update(updatedTab.windowId, { focused: true });
      });
    } else {
      browser.tabs.create({ url: markdownUrl }, (tab) => {
        if (browser.runtime.lastError) {
          console.error("Error opening markdown page:", browser.runtime.lastError);
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
    const existingTab = tabs.find(tab => tab.url === settingsUrl);
    
    if (existingTab) {
      browser.tabs.update(existingTab.id, { active: true }, (updatedTab) => {
        browser.windows.update(updatedTab.windowId, { focused: true });
      });
    } else {
      browser.tabs.create({ url: settingsUrl }, (tab) => {
        if (browser.runtime.lastError) {
          console.error("Error opening settings page:", browser.runtime.lastError);
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
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.text();
    })
    .then(html => {
      console.log(`Successfully fetched URL: ${url}`);
      sendResponse({ html: html });
      console.log('Sent response with HTML');
    })
    .catch(error => {
      console.error('Error fetching URL:', error);
      sendResponse({ error: error.message });
      console.log('Sent response with error');
    });
  
  return true;
}

function performFetch(url, sendResponse) {
  console.log(`Performing fetch for URL: ${url}`);
  
  browser.tabs.create({ url: url, active: false }, (tab) => {
    browser.tabs.executeScript(tab.id, { file: "fetchContent.js" }, () => {
      browser.tabs.sendMessage(tab.id, { command: "getPageContent" }, (response) => {
        browser.tabs.remove(tab.id);
        if (response && response.html) {
          sendResponse({ html: response.html });
        } else {
          sendResponse({ error: "Failed to fetch content" });
        }
      });
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
    copyAsMarkdown();
  }
});

function checkCommands() {
  browser.commands.getAll((commands) => {
    console.log("Registered commands:", commands);
  });
}

checkCommands();

function jsonToMarkdown(json) {
  let markdown = '';
  
  if (json.title) {
    markdown += `# ${json.title}\n\n`;
  }
  
  if (json.content && Array.isArray(json.content)) {
    json.content.forEach(item => {
      switch (item.type) {
        case 'heading':
          const level = item.level || 2;
          markdown += `${'#'.repeat(level)} ${item.content}\n\n`;
          break;
        case 'paragraph':
          markdown += `${item.content}\n\n`;
          break;
        case 'list':
          if (Array.isArray(item.content)) {
            item.content.forEach(listItem => {
              markdown += `- ${listItem}\n`;
            });
            markdown += '\n';
          }
          break;
        case 'code':
          if (item.language) {
            markdown += `\`\`\`${item.language}\n${item.content}\n\`\`\`\n\n`;
          } else {
            markdown += `\`\`\`\n${item.content}\n\`\`\`\n\n`;
          }
          break;
        case 'quote':
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
  browser.storage.local.get(['markdownData'], (result) => {
    const markdownData = result.markdownData || [];
    const updatedMarkdownData = markdownData.filter(item => item.url !== tab.url);
    browser.storage.local.set({ markdownData: updatedMarkdownData }, () => {
      if (browser.runtime.lastError) {
        console.error("Error removing markdownData:", browser.runtime.lastError);
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
  browser.storage.local.get(['markdownData'], (result) => {
    const markdownData = result.markdownData || [];
    const updatedMarkdownData = markdownData.map(item => {
      if (item.url === tab.url) {
        return { ...item, isLoading: false };
      }
      return item;
    });
    browser.storage.local.set({ markdownData: updatedMarkdownData }, () => {
      if (browser.runtime.lastError) {
        console.error("Error reverting markdownData:", browser.runtime.lastError);
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
function copyAsMarkdown() {
  browser.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      const tab = tabs[0];
      browser.tabs.sendMessage(tab.id, { command: 'convert-to-markdown' }, async (response) => {
        if (browser.runtime.lastError) {
          console.error("Error sending message to content script:", browser.runtime.lastError);
          return;
        }
        
        if (response && response.markdown) {
          if (response.cancelled) {
            console.log("Copy process was cancelled by the user");
            return; // Exit the function silently if cancelled
          }

          let finalMarkdown = response.markdown;
          
          // Check if LLM refinement is enabled and a prompt was provided
          if (response.prompt) {
            browser.storage.local.get(['enableLLM', 'apiKey'], async (result) => {
              const enableLLM = result.enableLLM || false;
              const apiKey = result.apiKey;
              
              if (enableLLM && apiKey) {
                console.log("Refining markdown with LLM using prompt:", response.prompt);
                finalMarkdown = await refineMDWithLLM(response.markdown, response.prompt, apiKey, tab.id);
              } else {
                console.log("Skipping LLM refinement:", { enableLLM, hasApiKey: !!apiKey });
              }
              
              if (finalMarkdown !== false) {
                proceedWithCopyAndSave(tab, finalMarkdown);
              }
            });
          } else {
            proceedWithCopyAndSave(tab, finalMarkdown);
          }
        } else {
          console.error("No markdown received from content script");
          browser.tabs.sendMessage(tab.id, { command: 'show-notification', message: 'Failed to generate Markdown', type: 'error' });
        }
      });
    } else {
      console.error("No active tab found");
    }
  });
}

function proceedWithCopyAndSave(tab, markdown) {
  const markdownText = `<url>${tab.url}</url>\n<title>${tab.title}</title>\n${markdown}`;
  
  // Save to collection
  browser.storage.local.get(['markdownData'], (result) => {
    const markdownData = result.markdownData || [];
    const existingIndex = markdownData.findIndex(item => item.url === tab.url);
    
    if (existingIndex !== -1) {
      markdownData[existingIndex] = {
        ...markdownData[existingIndex],
        markdown: markdown,
        savedAt: new Date().toISOString()
      };
    } else {
      markdownData.push({
        url: tab.url,
        title: tab.title,
        markdown: markdown,
        savedAt: new Date().toISOString()
      });
    }
    
    browser.storage.local.set({ markdownData }, () => {
      if (browser.runtime.lastError) {
        console.error("Error saving markdownData:", browser.runtime.lastError);
      } else {
        console.log("Markdown data saved successfully");
      }
    });
  });

  // Copy to clipboard
  navigator.clipboard.writeText(markdownText)
    .then(() => {
      console.log("Markdown copied to clipboard");
      browser.tabs.sendMessage(tab.id, { command: 'show-notification', message: 'Markdown copied to clipboard and saved' });
    })
    .catch(err => {
      console.error('Failed to copy to clipboard:', err);
      browser.tabs.sendMessage(tab.id, { command: 'show-notification', message: 'Failed to copy to clipboard, but Markdown was saved', type: 'warning' });
    });
}
