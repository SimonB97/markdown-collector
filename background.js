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
            } else {
              let finalMarkdown = response.markdown;
              if (enableLLM && response.prompt && apiKey) {
                console.log("Refining markdown with LLM using prompt:", response.prompt);
                finalMarkdown = await refineMDWithLLM(response.markdown, response.prompt, apiKey);
              } else if (response.prompt === undefined) {
                console.log("Saving without LLM refinement");
              } else {
                console.log("Skipping LLM refinement:", { enableLLM, hasPrompt: !!response.prompt, hasApiKey: !!apiKey });
              }
              
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

async function refineMDWithLLM(markdown, prompt, apiKey) {
  console.log('Refining markdown with LLM. Prompt:', prompt);
  console.log('API Key (first 4 characters):', apiKey.substring(0, 4));

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

    if (!response.ok) {
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
    return markdown; // Return original markdown if refinement fails
  }
}

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

chrome.commands.onCommand.addListener((command) => {
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
  chrome.commands.getAll((commands) => {
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
          const markdownText = `<url>${tab.url}</url>\n<title>${tab.title}</title>\n${response.markdown}`;
          
          // Save to collection
          chrome.storage.local.get(['markdownData'], (result) => {
            const markdownData = result.markdownData || [];
            const existingIndex = markdownData.findIndex(item => item.url === tab.url);
            
            if (existingIndex !== -1) {
              markdownData[existingIndex] = {
                ...markdownData[existingIndex],
                markdown: response.markdown,
                savedAt: new Date().toISOString()
              };
            } else {
              markdownData.push({
                url: tab.url,
                title: tab.title,
                markdown: response.markdown,
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
          try {
            await navigator.clipboard.writeText(markdownText);
            console.log("Markdown copied to clipboard");
            chrome.tabs.sendMessage(tab.id, { command: 'show-notification', message: 'Markdown copied to clipboard and saved' });
          } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            chrome.tabs.sendMessage(tab.id, { command: 'show-notification', message: 'Failed to copy to clipboard, but Markdown was saved', type: 'warning' });
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