document.addEventListener('DOMContentLoaded', () => {
  const openMarkdownButton = document.getElementById('open-markdown');
  const copyMarkdownButton = document.getElementById('copy-markdown');
  const statusMessage = document.getElementById('status-message');

  // Update initial button labels
  openMarkdownButton.innerHTML = '<span style="font-size: 2em;">&#8599;</span><br>Open Collection';
  copyMarkdownButton.innerHTML = '<span style="font-size: 2em;">&#9112;</span><br>Copy Collection';

  openMarkdownButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ command: 'open-markdown-page' }, (response) => {
      // Handle response if needed
    });
  });

  copyMarkdownButton.addEventListener('click', () => {
    chrome.tabs.query({ url: chrome.runtime.getURL("markdown.html") }, (tabs) => {
      if (tabs.length === 0) {
        showMessage('Markdown page is not open.', 'warning');
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { command: 'copy-selected-markdown' }, (response) => {
        console.log('Response from markdown page:', response); // Debug log
        if (response && response.status === 'success') {
          if (response.copiedEntries > 0) {
            showMessage(`Copied ${response.copiedEntries} entries`, 'success');
            // Display checkmark on the button
            copyMarkdownButton.innerHTML = '&#10003; Copied';
            setTimeout(() => {
              copyMarkdownButton.innerHTML = '<span style="font-size: 2em;">&#9112;</span><br>Copy Collection';
            }, 2000); // Reset button text after 2 seconds
          } else {
            showMessage('No entries selected or copied.', 'warning');
          }
        } else if (response && response.status === 'error') {
          showMessage(response.message || 'Failed to copy markdown.', 'error');
        } else {
          showMessage('Unexpected response from markdown page.', 'error');
        }
      });
    });
  });

  function showMessage(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.style.color = type === 'error' ? '#ff4444' : 
                                type === 'warning' ? '#ffaa00' : 
                                type === 'success' ? '#44ff44' : '#ffffff';
    statusMessage.style.display = 'block';
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 3000); // Hide the message after 3 seconds
  }
});