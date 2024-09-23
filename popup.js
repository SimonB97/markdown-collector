document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.getElementById('toggle-listening');
  const openMarkdownButton = document.getElementById('open-markdown');
  const copyMarkdownButton = document.getElementById('copy-markdown');
  const statusMessage = document.getElementById('status-message'); // Add a status message element

  // Initialize toggle button text and status message based on current state
  chrome.storage.local.get(['isListening'], (result) => {
    const isListening = result.isListening || false;
    toggleButton.textContent = isListening ? 'Stop Listening' : 'Start Listening';
    statusMessage.textContent = isListening ? '🟢 Listening for URLs...' : '🔴 Not listening.';
  });

  toggleButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'toggle-listening' }, (response) => {
      if (response && response.status) {
        toggleButton.textContent = response.status === 'Listening started' ? 'Stop Listening' : 'Start Listening';
        statusMessage.textContent = response.status === 'Listening started' ? '🟢 Listening for URLs...' : '🔴 Not listening.';
      }
    });
  });

  openMarkdownButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'open-markdown-page' }, (response) => {
      // Handle response if needed
    });
  });

  copyMarkdownButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'get-markdown-data' }, (response) => {
      if (response && response.markdownData) {
        const concatenated = response.markdownData.map(item => `<url>${item.url}</url>\n<title>${item.title}</title>\n${item.markdown}`).join('\n\n\n');
        copyToClipboard(concatenated)
          .then(() => {
            // Display checkmark on the button
            copyMarkdownButton.textContent = '✔ Copied';
            setTimeout(() => {
              copyMarkdownButton.textContent = 'Copy Markdown';
            }, 2000); // Reset button text after 2 seconds
          })
          .catch((err) => {
            console.error('Error copying to clipboard:', err);
            alert('Failed to copy markdown.');
          });
      } else {
        alert('No markdown data available to copy.');
      }
    });
  });

  /**
   * Copies the provided text to the clipboard using the Clipboard API.
   * @param {string} text - The text to copy.
   * @returns {Promise}
   */
  function copyToClipboard(text) {
    return navigator.clipboard.writeText(text);
  }
});