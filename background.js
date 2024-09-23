let isListening = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Received message:", request);

  if (request.command === "toggle-listening") {
    isListening = !isListening;
    chrome.storage.local.set({ isListening }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error setting isListening:", chrome.runtime.lastError);
      }
      sendResponse({ status: isListening ? "Listening started" : "Listening stopped" });
    });
    return true; // Indicates that the response is sent asynchronously
  } else if (request.command === "save-url" && isListening) {
    saveCurrentTabUrl(sendResponse);
    return true; // Indicates that the response is sent asynchronously
  } else if (request.command === "copy-markdown") {
    chrome.storage.local.get(['markdownData'], (result) => {
      const { markdownData } = result;
      if (markdownData && markdownData.every(item => !item.isLoading)) {
        const concatenated = markdownData.map(item => `<url>${item.url}</url>\n<title>${item.title}</title>\n${item.markdown}`).join('\n\n\n');
        copyToClipboard(concatenated);
        sendResponse({ status: "Markdown copied to clipboard" });
      } else {
        console.warn("Some markdown data is still loading.");
        sendResponse({ status: "Some markdown data is still loading" });
      }
    });
    return true; // Indicates that the response is sent asynchronously
  }
});

chrome.commands.onCommand.addListener((command) => {
  console.log("Command received:", command);
  if (command === "save-url" && isListening) {
    saveCurrentTabUrl();
  }
});

function saveCurrentTabUrl(sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab) {
      chrome.storage.local.get(['markdownData'], (result) => {
        const markdownData = result.markdownData || [];
        markdownData.push({ url: tab.url, title: tab.title, markdown: "", isLoading: true });
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

function copyToClipboard(text) {
  console.log("Copying to clipboard:", text);
  chrome.tabs.create({ active: false, url: "copy.html" }, (tab) => {
    chrome.tabs.executeScript(tab.id, { code: `
      const textarea = document.createElement('textarea');
      textarea.value = \`${text.replace(/`/g, '\\`')}\`;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      window.close();
    ` }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error executing copy script:", chrome.runtime.lastError);
      }
    });
  });
}

// Initialize isListening state
chrome.storage.local.get(['isListening'], (result) => {
  isListening = result.isListening || false;
});