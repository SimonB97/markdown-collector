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

// Function to perform fetch using XMLHttpRequest
function performFetch(url, sendResponse) {
  console.log(`Performing fetch for URL: ${url}`);
  const xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      if (xhr.status === 200) {
        console.log(`Fetch successful for URL: ${url}`);
        sendResponse({ html: xhr.responseText });
      } else {
        console.error(`Error fetching URL (${url}):`, xhr.statusText);
        sendResponse({ error: xhr.statusText });
      }
    }
  };
  xhr.onerror = function () {
    console.error('Network Error while fetching URL.');
    sendResponse({ error: 'Network Error' });
  };
  xhr.send();
}

chrome.commands.onCommand.addListener((command) => {
  console.log("Command received:", command);
  if (command === "save-url") {
    saveCurrentTabUrl();
  } else if (command === "copy-markdown") {
    // Notify popup to handle copy
    // Alternatively, implement copy here if possible
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
  chrome.tabs.create({ url: chrome.runtime.getURL("markdown.html") }, (tab) => {
    if (chrome.runtime.lastError) {
      console.error("Error opening markdown page:", chrome.runtime.lastError);
    }
  });
}