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
        
        if (existingIndex !== -1) {
          markdownData[existingIndex].isLoading = true;
          markdownData[existingIndex].savedAt = new Date().toISOString();
        } else {
          markdownData.push({
            url: tab.url,
            title: tab.title,
            markdown: "",
            isLoading: true,
            savedAt: new Date().toISOString()
          });
        }
        
        chrome.storage.local.set({ markdownData }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error setting markdownData:", chrome.runtime.lastError);
          }
          // Send message to content script to convert
          chrome.tabs.sendMessage(tab.id, { command: 'convert-to-markdown' }, async (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending message to content script:", chrome.runtime.lastError);
            }
            console.log("Received response from content script:", response);
            if (response && response.markdown) {
              let finalMarkdown = response.markdown;
              if (enableLLM && response.prompt && apiKey) {
                console.log("Refining markdown with LLM using prompt:", response.prompt);
                finalMarkdown = await refineMDWithLLM(response.markdown, response.prompt, apiKey);
              } else {
                console.log("Skipping LLM refinement:", { enableLLM, hasPrompt: !!response.prompt, hasApiKey: !!apiKey });
              }
              updateMarkdownData(tab, finalMarkdown);
            } else {
              console.error("No markdown received from content script");
            }
            if (sendResponse) {
              sendResponse({ status: "URL saved and conversion completed" });
            }
          });
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
    { role: 'system', content: 'You are an AI assistant that refines and structures webpage content based on user prompts. Your task is to modify the given markdown content according to the user\'s instructions. While doing so, fix any markdown formatting errors and make sure the content is structured properly.' },
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
                heading: { type: 'string' },
                text: { type: 'string' }
              }
            }
          }
        },
        required: ['title', 'content']
      }
    }
  ];

  try {
    console.log('Sending request to OpenAI');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.0,
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
  
  if (json.content) {
    if (Array.isArray(json.content)) {
      json.content.forEach(section => {
        if (section.heading) {
          markdown += `## ${section.heading}\n\n`;
        }
        if (section.text) {
          markdown += `${section.text}\n\n`;
        }
      });
    } else {
      markdown += json.content;
    }
  }
  
  return markdown.trim();
}
