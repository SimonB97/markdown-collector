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
      chrome.storage.local.get(['markdownData'], (result) => {
        const markdownData = result.markdownData || [];
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
          chrome.tabs.sendMessage(tab.id, { command: 'convert-to-markdown' }, (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending message to content script:", chrome.runtime.lastError);
            }
            console.log("Received response from content script:", response);
            if (response && response.markdown) {
              updateMarkdownData(tab, response.markdown);
            } else {
              console.error("No markdown received from content script");
            }
            if (sendResponse) {
              sendResponse({ status: "URL saved and conversion started" });
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
