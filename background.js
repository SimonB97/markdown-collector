chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request);

  if (request.command === "save-url") {
    saveCurrentTabUrl(sendResponse);
    return true; // Indicates that the response is sent asynchronously
  } else if (request.command === "open-markdown-page") {
    openMarkdownPage();
    sendResponse({ status: "Markdown page opened" });
  } else if (request.command === "get-markdown-data") {
    chrome.storage.local.get(['markdownData'], (result) => {
      sendResponse({ markdownData: result.markdownData });
    });
    return true; // Indicates that the response is sent asynchronously
  } else if (request.command === "fetch-url") {
    performFetch(request.url, sendResponse);
    return true; // Indicates that the response is sent asynchronously
  }
});

// Function to perform fetch using Fetch API
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

  return true; // Indicates that the response is sent asynchronously
}

chrome.commands.onCommand.addListener((command) => {
  console.log("Command received:", command);
  if (command === "save-url") {
    saveCurrentTabUrl();
  } else if (command === "open-markdown-page") {
    openMarkdownPage();
  }
});

function saveCurrentTabUrl(sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab) {
      chrome.storage.local.get(['markdownData'], (result) => {
        const markdownData = result.markdownData || [];
        markdownData.push({
          url: tab.url,
          title: tab.title,
          markdown: "",
          isLoading: true,
          savedAt: new Date().toISOString()
        });
        chrome.storage.local.set({ markdownData }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error setting markdownData:", chrome.runtime.lastError);
          }
          injectContentScriptAndConvert(tab.id, sendResponse);
        });
      });
    }
  });
}

function injectContentScriptAndConvert(tabId, sendResponse) {
  chrome.tabs.executeScript(tabId, { file: "turndown.js" }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error injecting turndown.js:", chrome.runtime.lastError);
      return;
    }
    chrome.tabs.executeScript(tabId, { file: "content.js" }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error injecting content.js:", chrome.runtime.lastError);
        return;
      }
      chrome.tabs.sendMessage(tabId, { command: "convert-to-markdown" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error sending message to content script:", chrome.runtime.lastError);
        }
        if (response && response.markdown) {
          updateMarkdownData(tabId, response.markdown);
        }
        if (sendResponse) {
          sendResponse({ status: "URL saved and conversion started" });
        }
      });
    });
  });
}

function updateMarkdownData(tabId, markdown) {
  chrome.tabs.get(tabId, (tab) => {
    chrome.storage.local.get(['markdownData'], (result) => {
      const markdownData = result.markdownData || [];
      const index = markdownData.findIndex(item => item.url === tab.url);
      if (index !== -1) {
        markdownData[index].markdown = markdown;
        markdownData[index].isLoading = false;
        chrome.storage.local.set({ markdownData }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error updating markdownData:", chrome.runtime.lastError);
          }
        });
      }
    });
  });
}

function openMarkdownPage() {
  const markdownUrl = chrome.runtime.getURL("markdown.html");

  // First, check if the page is already open
  chrome.tabs.query({}, (tabs) => {
    const existingTab = tabs.find(tab => tab.url === markdownUrl);
    
    if (existingTab) {
      // If the tab exists, switch to it
      chrome.tabs.update(existingTab.id, { active: true }, (updatedTab) => {
        chrome.windows.update(updatedTab.windowId, { focused: true });
      });
    } else {
      // If the tab doesn't exist, create a new one
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