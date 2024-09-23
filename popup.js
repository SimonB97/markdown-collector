document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.getElementById('toggle-listening');
  const openMarkdownButton = document.getElementById('open-markdown');
  const copyMarkdownButton = document.getElementById('copy-markdown');

  chrome.storage.local.get(['isListening'], (result) => {
    console.log("Initial isListening state:", result.isListening);
    toggleButton.textContent = result.isListening ? 'Stop Listening' : 'Start Listening';
  });

  toggleButton.addEventListener('click', () => {
    console.log("Toggle listening button clicked");
    chrome.runtime.sendMessage({ command: 'toggle-listening' }, (response) => {
      if (response && response.status) {
        console.log("Toggle listening response:", response);
        toggleButton.textContent = response.status === 'Listening started' ? 'Stop Listening' : 'Start Listening';
      }
    });
  });

  openMarkdownButton.addEventListener('click', () => {
    console.log("Open markdown button clicked");
    chrome.tabs.create({ url: chrome.runtime.getURL('markdown.html') });
  });

  copyMarkdownButton.addEventListener('click', () => {
    console.log("Copy markdown button clicked");
    chrome.runtime.sendMessage({ command: 'copy-markdown' }, (response) => {
      if (response && response.status) {
        console.log("Copy markdown response:", response);
        alert(response.status);
      }
    });
  });
});