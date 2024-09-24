document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggle-listening');
  const openMarkdownButton = document.getElementById('open-markdown');
  const copyMarkdownButton = document.getElementById('copy-markdown');
  const statusMessage = document.getElementById('status-message');

  // Initialize toggle switch and status message based on current state
  chrome.storage.local.get(['isListening'], (result) => {
    const isListening = result.isListening || false;
    toggleSwitch.checked = isListening;
    statusMessage.textContent = isListening ? '🟢 Listening...' : '🔴 Not listening.';
  });

  toggleSwitch.addEventListener('change', () => {
    chrome.runtime.sendMessage({ command: 'toggle-listening' }, (response) => {
      if (response && response.status) {
        statusMessage.textContent = response.status === 'Listening started' ? '🟢 Listening...' : '🔴 Not listening.';
      }
    });
  });

  openMarkdownButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'open-markdown-page' }, (response) => {
      // Handle response if needed
    });
  });

  copyMarkdownButton.addEventListener('click', () => {
    chrome.tabs.query({ url: chrome.runtime.getURL("markdown.html") }, (tabs) => {
      if (tabs.length === 0) {
        alert('Markdown page is not open.');
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { command: 'copy-selected-markdown' }, (response) => {
        if (response && response.status === 'success') {
          // Display checkmark on the button
          copyMarkdownButton.textContent = '✔ Copied';
          setTimeout(() => {
            copyMarkdownButton.textContent = 'Copy Markdown';
          }, 2000); // Reset button text after 2 seconds
        } else {
          alert('Failed to copy markdown.');
        }
      });
    });
  });
});