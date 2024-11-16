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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request);

  if (request.command === "save-url") {
    saveCurrentTabUrl(sendResponse);
    return true; // To respond asynchronously
  } else if (request.command === "open-markdown-page") {
    openMarkdownPage();
    sendResponse({ status: "Markdown page opened" });
  } else if (request.command === "get-markdown-data") {
    chrome.storage.local.get(['markdownData'], (result) => {
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

/**
 * Saves the current tab's URL to the markdown data storage.
 *
 * This function queries the active tab in the current window, sends a message
 * to the content script to convert the content to Markdown, and then saves the
 * Markdown content to the storage.
 *
 * @param {function} sendResponse - The callback function to respond to the
 *                                  message sender.
 */
function saveCurrentTabUrl(sendResponse) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      const tab = tabs[0];
      chrome.storage.local.get(['markdownData', 'enableLLM', 'apiKey'], (result) => {
        const markdownData = result.markdownData || [];
        const enableLLM = result.enableLLM || false;
        const apiKey = result.apiKey;
        
        console.log("LLM refinement enabled:", enableLLM);
        console.log("API Key present:", !!apiKey);

        const existingIndex = markdownData.findIndex(item => item.url === tab.url);
        let isNewEntry = existingIndex === -1;
        
        // Send message to content script to convert
        chrome.tabs.sendMessage(tab.id, { command: 'convert-to-markdown' }, async (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error sending message to content script:", chrome.runtime.lastError);
          }
          console.log("Received response from content script:", response);
          if (response && response.markdown) {
            if (response.cancelled) {
              console.log("Save process was cancelled by the user");
              if (sendResponse) {
                sendResponse({ status: "Save process cancelled" });
              }
              return; // Exit the function early if cancelled
            } else {
              let finalMarkdown = response.markdown;
              if (enableLLM && response.prompt) {
                console.log("Refining markdown with LLM using prompt:", response.prompt);
                finalMarkdown = await refineMDWithLLM(response.markdown, response.prompt, apiKey, tab.id);
              } else if (response.prompt === undefined) {
                console.log("Saving without LLM refinement");
              } else {
                console.log("Skipping LLM refinement:", { enableLLM, hasPrompt: !!response.prompt, hasApiKey: !!apiKey });
              }
　　 　 　 　
              if (finalMarkdown !== false) {
                let updatedMarkdownData = [...markdownData];
                if (isNewEntry) {
                  updatedMarkdownData.push({
                    url: tab.url,
                    title: tab.title,
                    markdown: finalMarkdown,
                    savedAt: new Date().toISOString()
                  });
                } else {
                  updatedMarkdownData[existingIndex] = {
                    ...updatedMarkdownData[existingIndex],
                    markdown: finalMarkdown,
                    savedAt: new Date().toISOString()
                  };
                }
　 　 　 　 　
                chrome.storage.local.set({ markdownData: updatedMarkdownData }, () => {
                  if (chrome.runtime.lastError) {
                    console.error("Error setting markdownData:", chrome.runtime.lastError);
                  } else {
                    console.log("Markdown data updated successfully");
                    // Show notification
                    chrome.tabs.sendMessage(tab.id, { 
                      command: 'show-notification', 
                      message: isNewEntry ? 'URL saved successfully' : 'URL updated successfully'
                    });
                  }
                  if (sendResponse) {
                    sendResponse({ status: "URL save process completed" });
                  }
                });
              }
            }
          } else {
            console.error("No markdown received from content script");
            if (sendResponse) {
              sendResponse({ status: "Error: No markdown received" });
            }
            // Show error notification
            chrome.tabs.sendMessage(tab.id, { 
              command: 'show-notification', 
              message: 'Failed to save URL', 
              type: 'error'
            });
          }
        });
      });
    } else {
      console.error("No active tab found");
      if (sendResponse) {
        sendResponse({ status: "Error: No active tab found" });
      }
    }
  });
}

/**
 * Refines the given Markdown content using a language model (LLM) and returns
 * the refined Markdown content.
 *
 * This function sends a request to the OpenAI API to refine the Markdown content
 * based on the provided prompt and API key.
 *
 * @param {string} markdown - The Markdown content to refine.
 * @param {string} prompt - The prompt to use for refining the Markdown content.
 * @param {string} apiKey - The API key to use for the OpenAI API.
 * @param {number} tabId - The ID of the tab to show the loading indicator.
 *
 * @returns {Promise<string>} A promise that resolves with the refined Markdown
 *                            content or null if refinement fails.
 */
async function refineMDWithLLM(markdown, prompt, apiKey, tabId) {
  console.log('Refining markdown with LLM. Prompt:', prompt);
  console.log('API Key (first 4 characters):', apiKey ? apiKey.substring(0, 4) : 'N/A');

  const messages = [
    { role: 'system', content: 'You are an AI assistant that refines and structures webpage content based on user prompts. Your task is to modify the given markdown content according to the user\'s instructions.' },
    { role: 'user', content: `Refine the following markdown content based on this prompt: "${prompt}"\n\nContent:\n${markdown}` }
  ];
  
  const functions = [
    {
      name: 'structure_content',
      description: 'Structure the refined content',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { 
                  type: 'string',
                  enum: ['heading', 'paragraph', 'list', 'code', 'quote']
                },
                content: {
                  oneOf: [
                    { type: 'string' },
                    { 
                      type: 'array',
                      items: { type: 'string' }
                    }
                  ]
                },
                level: { 
                  type: 'integer',
                  minimum: 1,
                  maximum: 6
                },
                language: { type: 'string' }
              },
              required: ['type', 'content']
            }
          }
        },
        required: ['title', 'content']
      }
    }
  ];

  try {
    console.log('Sending request to OpenAI');
    
    // Show loading indicator
    chrome.tabs.sendMessage(tabId, { command: 'show-loading' });

    // Fetch the model and baseUrl from storage
    const { model, baseUrl } = await new Promise((resolve) => {
      chrome.storage.local.get(['model', 'baseUrl'], resolve);
    });

    const response = await fetch(baseUrl || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: messages,
        functions: functions,
        function_call: { name: 'structure_content' }
      })
    });

    // Hide loading indicator
    chrome.tabs.sendMessage(tabId, { command: 'hide-loading' });

    if (!response.ok) {
      if (response.status === 401) {
        chrome.tabs.sendMessage(tabId, { 
          command: 'show-notification', 
          message: 'Authentication error! Please check your API key.', 
          type: 'error'
        });
        return false;
      } else {
        chrome.tabs.sendMessage(tabId, { 
          command: 'show-notification', 
          message: 'Connection error! Please check the base URL in settings.', 
          type: 'error'
        });
        return false;
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Received response from OpenAI:', data);

    const functionCall = data.choices[0].message.function_call;
    if (functionCall && functionCall.name === 'structure_content') {
      const refinedContent = JSON.parse(functionCall.arguments);
      return jsonToMarkdown(refinedContent);
    } else {
      console.error('Unexpected response format from OpenAI');
      return markdown;
    }
  } catch (error) {
    console.error('Error refining content with OpenAI:', error);
    // Hide loading indicator in case of error
    chrome.tabs.sendMessage(tabId, { command: 'hide-loading' });
    return null; // Return null if refinement fails
  }
}

/**
 * Updates the markdown data for a given tab.
 *
 * This function retrieves the markdown data from Chrome's local storage,
 * updates the markdown data for the specified tab, and then saves the updated
 * markdown data back to local storage.
 *
 * @param {Object} tab - The tab object containing the URL of the tab.
 * @param {string} markdown - The Markdown content to update.
 */
function updateMarkdownData(tab, markdown) {
  console.log("Updating markdown data for tab:", tab.url);
  chrome.storage.local.get(['markdownData'], (result) => {
    const markdownData = result.markdownData || [];
    const index = markdownData.findIndex(item => item.url === tab.url);
    if (index !== -1) {
      markdownData[index].markdown = markdown;
      markdownData[index].isLoading = false;
      chrome.storage.local.set({ markdownData }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error updating markdownData:", chrome.runtime.lastError);
        } else {
          console.log("Markdown data updated successfully");
        }
      });
    } else {
      console.error("URL not found in markdownData:", tab.url);
    }
  });
}

/**
 * Opens the Markdown page in a new tab.
 *
 * This function checks if the Markdown page is already open in a tab and
 * focuses on that tab if it exists. Otherwise, it creates a new tab with the
 * Markdown page.
 */
function openMarkdownPage() {
  const markdownUrl = chrome.runtime.getURL("markdown.html");

  chrome.tabs.query({}, (tabs) => {
    const existingTab = tabs.find(tab => tab.url === markdownUrl);
    
    if (existingTab) {
      chrome.tabs.update(existingTab.id, { active: true }, (updatedTab) => {
        chrome.windows.update(updatedTab.windowId, { focused: true });
      });
    } else {
      chrome.tabs.create({ url: markdownUrl }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error("Error opening markdown page:", chrome.runtime.lastError);
        } else {
          console.log("Markdown page opened successfully");
        }
      });
    }
  });
}

/**
 * Opens the settings page in a new tab.
 *
 * This function checks if the settings page is already open in a tab and
 * focuses on that tab if it exists. Otherwise, it creates a new tab with the
 * settings page.
 */
function openSettingsPage() {
  const settingsUrl = chrome.runtime.getURL("settings.html");

  chrome.tabs.query({}, (tabs) => {
    const existingTab = tabs.find(tab => tab.url === settingsUrl);
    
    if (existingTab) {
      chrome.tabs.update(existingTab.id, { active: true }, (updatedTab) => {
        chrome.windows.update(updatedTab.windowId, { focused: true });
      });
    } else {
      chrome.tabs.create({ url: settingsUrl }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error("Error opening settings page:", chrome.runtime.lastError);
        } else {
          console.log("Settings page opened successfully");
        }
      });
    }
  });
}

/**
 * Fetches the content of a given URL.
 *
 * This function sends a GET request to the specified URL and returns the
 * response text.
 *
 * @param {string} url - The URL to fetch.
 * @param {function} sendResponse - The callback function to respond to the
 *                                  message sender.
 *
 * @returns {Promise<string>} A promise that resolves with the response text.
 */
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

/**
 * Performs a fetch operation for a given URL.
 *
 * This function creates a new tab with the specified URL, executes a content
 * script to fetch the page content, and then sends the fetched content to the
 * message sender.
 *
 * @param {string} url - The URL to fetch.
 * @param {function} sendResponse - The callback function to respond to the
 *                                  message sender.
 *
 * @returns {Promise<string>} A promise that resolves with the response text.
 */
function performFetch(url, sendResponse) {
  console.log(`Performing fetch for URL: ${url}`);
  
  chrome.tabs.create({ url: url, active: false }, (tab) => {
    chrome.tabs.executeScript(tab.id, { file: "fetchContent.js" }, () => {
      chrome.tabs.sendMessage(tab.id, { command: "getPageContent" }, (response) => {
        chrome.tabs.remove(tab.id);
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

/**
 * Saves multiple tabs' content as Markdown.
 *
 * This function sends a message to the content script to convert the content
 * of each tab to Markdown, refines the Markdown content using a language model
 * (LLM) if enabled, and then saves the refined Markdown content to the storage.
 *
 * @param {Array<Object>} tabs - The array of tab objects to save.
 * @param {boolean} copyToClipboard - Whether to copy the Markdown content to
 *                                    the clipboard.
 */
async function saveMultipleTabs(tabs, copyToClipboard = false) {
  const results = [];
  for (const tab of tabs) {
    try {
      const result = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { command: 'convert-to-markdown' }, async (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error sending message to content script:", chrome.runtime.lastError);
            resolve({ success: false, tab, error: chrome.runtime.lastError });
            return;
          }
          
          if (response && response.markdown) {
            if (response.cancelled) {
              resolve({ success: false, tab, cancelled: true });
              return;
            }
            
            let finalMarkdown = response.markdown;
            if (response.enableLLM && response.prompt) {
              finalMarkdown = await refineMDWithLLM(response.markdown, response.prompt, response.apiKey, tab.id);
            }
            
            if (finalMarkdown !== false) {
              resolve({ success: true, tab, markdown: finalMarkdown });
            } else {
              resolve({ success: false, tab, error: "Failed to process markdown" });
            }
          } else {
            resolve({ success: false, tab, error: "No markdown received" });
          }
        });
      });
      results.push(result);
    } catch (error) {
      console.error(`Error processing tab ${tab.url}:`, error);
      results.push({ success: false, tab, error });
    }
  }

  // Update storage with successful results
  const successfulResults = results.filter(r => r.success);
  if (successfulResults.length > 0) {
    chrome.storage.local.get(['markdownData'], (result) => {
      const markdownData = result.markdownData || [];
      const updatedMarkdownData = [...markdownData];

      for (const { tab, markdown } of successfulResults) {
        const existingIndex = updatedMarkdownData.findIndex(item => item.url === tab.url);
        if (existingIndex !== -1) {
          updatedMarkdownData[existingIndex] = {
            ...updatedMarkdownData[existingIndex],
            markdown,
            savedAt: new Date().toISOString()
          };
        } else {
          updatedMarkdownData.push({
            url: tab.url,
            title: tab.title,
            markdown,
            savedAt: new Date().toISOString()
          });
        }
      }

      chrome.storage.local.set({ markdownData: updatedMarkdownData }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving markdown data:", chrome.runtime.lastError);
        } else {
          console.log("Successfully saved markdown for multiple tabs");
          
          if (copyToClipboard) {
            const combinedMarkdown = successfulResults
              .map(({ tab, markdown }) => `<url>${tab.url}</url>\n<title>${tab.title}</title>\n${markdown}`)
              .join('\n\n\n');
            
            // Copy to clipboard using background page
            const textarea = document.createElement('textarea');
            textarea.value = combinedMarkdown;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
          }

          // Show notification on the last active tab
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, {
                command: 'show-notification',
                message: `Successfully processed ${successfulResults.length} tab(s)${copyToClipboard ? ' and copied to clipboard' : ''}`
              });
            }
          });
        }
      });
    });
  }

  // Show errors if any
  const failedResults = results.filter(r => !r.success);
  if (failedResults.length > 0) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          command: 'show-notification',
          message: `Failed to process ${failedResults.length} tab(s)`,
          type: 'error'
        });
      }
    });
  }
}

/**
 * Listens for commands from the browser and performs the corresponding actions.
 *
 * This function checks if the multi-tab mode is enabled and performs the
 * corresponding action for each command.
 *
 * @param {string} command - The command received from the browser.
 */
chrome.commands.onCommand.addListener(async (command) => {
  console.log("Command received:", command);
  
  // Check if multi-tab mode is enabled
  const { enableMultitab } = await new Promise(resolve => {
    chrome.storage.local.get(['enableMultitab'], resolve);
  });

  if (enableMultitab) {
    // Get highlighted tabs in current window
    chrome.tabs.query({ highlighted: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        if (command === "save-url") {
          saveMultipleTabs(tabs, false);
        } else if (command === "copy-as-markdown") {
          saveMultipleTabs(tabs, true);
        }
      }
    });
  } else {
    // Original single-tab behavior
    if (command === "save-url") {
      saveCurrentTabUrl();
    } else if (command === "copy-as-markdown") {
      copyAsMarkdown();
    } else if (command === "open-markdown-page") {
      openMarkdownPage();
    }
  }
});

/**
 * Checks if the commands are registered correctly.
 *
 * This function retrieves the registered commands and logs them to the console.
 */
function checkCommands() {
  chrome.commands.getAll((commands) => {
    console.log("Registered commands:", commands);
  });
}

checkCommands();

/**
 * Converts a JSON object to Markdown content.
 *
 * This function takes a JSON object with title and content properties and
 * converts it to Markdown content.
 *
 * @param {Object} json - The JSON object to convert.
 *
 * @returns {string} The Markdown content.
 */
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

/**
 * Removes the markdown data for a given tab.
 *
 * This function retrieves the markdown data from Chrome's local storage,
 * removes the markdown data for the specified tab, and then saves the updated
 * markdown data back to local storage.
 *
 * @param {Object} tab - The tab object containing the URL of the tab.
 */
function removeMarkdownData(tab) {
  chrome.storage.local.get(['markdownData'], (result) => {
    const markdownData = result.markdownData || [];
    const updatedMarkdownData = markdownData.filter(item => item.url !== tab.url);
    chrome.storage.local.set({ markdownData: updatedMarkdownData }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error removing markdownData:", chrome.runtime.lastError);
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
 */
function revertMarkdownData(tab) {
  chrome.storage.local.get(['markdownData'], (result) => {
    const markdownData = result.markdownData || [];
    const updatedMarkdownData = markdownData.map(item => {
      if (item.url === tab.url) {
        return { ...item, isLoading: false };
      }
      return item;
    });
    chrome.storage.local.set({ markdownData: updatedMarkdownData }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error reverting markdownData:", chrome.runtime.lastError);
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
 */
function copyAsMarkdown() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
      const tab = tabs[0];
      chrome.tabs.sendMessage(tab.id, { command: 'convert-to-markdown' }, async (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message to content script:", chrome.runtime.lastError);
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
            chrome.storage.local.get(['enableLLM', 'apiKey'], async (result) => {
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
          chrome.tabs.sendMessage(tab.id, { command: 'show-notification', message: 'Failed to generate Markdown', type: 'error' });
        }
      });
    } else {
      console.error("No active tab found");
    }
  });
}

/**
 * Proceeds with copying and saving the Markdown content.
 *
 * This function saves the Markdown content to the storage and copies it to the
 * clipboard.
 *
 * @param {Object} tab - The tab object containing the URL of the tab.
 * @param {string} markdown - The Markdown content to copy and save.
 */
function proceedWithCopyAndSave(tab, markdown) {
  const markdownText = `<url>${tab.url}</url>\n<title>${tab.title}</title>\n${markdown}`;
  
  // Save to collection
  chrome.storage.local.get(['markdownData'], (result) => {
    const markdownData = result.markdownData || [];
    const existingIndex = markdownData.findIndex(item => item.url === tab.url);
    
    if (existingIndex !== -1) {
      markdownData[existingIndex] = {
        ...markdownData[existingIndex],
        markdown,
        savedAt: new Date().toISOString()
      };
    } else {
      markdownData.push({
        url: tab.url,
        title: tab.title,
        markdown,
        savedAt: new Date().toISOString()
      });
    }
    
    chrome.storage.local.set({ markdownData }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving markdownData:", chrome.runtime.lastError);
      } else {
        console.log("Markdown data saved successfully");
      }
    });
  });

  // Copy to clipboard
  navigator.clipboard.writeText(markdownText)
    .then(() => {
      console.log("Markdown copied to clipboard");
      chrome.tabs.sendMessage(tab.id, { command: 'show-notification', message: 'Markdown copied to clipboard and saved' });
    })
    .catch(err => {
      console.error('Failed to copy to clipboard:', err);
      chrome.tabs.sendMessage(tab.id, { command: 'show-notification', message: 'Failed to copy to clipboard, but Markdown was saved', type: 'warning' });
    });
}
