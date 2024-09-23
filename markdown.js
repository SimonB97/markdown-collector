document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('markdown-container');

  // Track open URLs to preserve state after UI update
  let openUrls = new Set();

  function loadMarkdownData() {
    chrome.storage.local.get(['markdownData'], (result) => {
      console.log("Loaded markdown data:", result.markdownData);
      const { markdownData } = result;
      if (markdownData && markdownData.length > 0) {
        markdownData.forEach((item, index) => {
          const box = document.createElement('div');
          box.className = 'box';
          box.dataset.url = item.url; // Add data attribute for tracking

          const title = document.createElement('div');
          title.className = 'box-title';
          title.textContent = getCoreDomain(item.url);

          const path = document.createElement('span');
          path.style.color = 'gray';
          path.textContent = ` ${new URL(item.url).pathname}`;
          title.appendChild(path);

          title.addEventListener('click', () => {
            const content = box.querySelector('.box-content');
            if (content.style.display === 'none' || content.style.display === '') {
              content.style.display = 'block';
              openUrls.add(item.url); // Mark as open
            } else {
              content.style.display = 'none';
              openUrls.delete(item.url); // Mark as closed
            }
          });

          const content = document.createElement('div');
          content.className = 'box-content';
          content.style.display = 'none'; // Ensure initial state is hidden

          if (item.isLoading) {
            const loading = document.createElement('div');
            loading.className = 'loading';
            loading.textContent = 'Loading...';
            content.appendChild(loading);
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = item.markdown;
            
            // Change event listener from 'input' to 'blur'
            textarea.addEventListener('blur', () => {
              markdownData[index].markdown = textarea.value;
              chrome.storage.local.set({ markdownData }, () => {
                if (chrome.runtime.lastError) {
                  console.error("Error updating markdownData:", chrome.runtime.lastError);
                }
                // Do not reload or alter display state
              });
            });

            content.appendChild(textarea);
          }

          box.appendChild(title);
          box.appendChild(content);
          container.appendChild(box);

          // Restore open state if previously open
          if (openUrls.has(item.url)) {
            content.style.display = 'block';
          }
        });
      } else {
        container.textContent = 'No markdown data available.';
      }
    });
  }

  loadMarkdownData();

  // Listen for updates to markdownData without reloading the page
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.markdownData) {
      console.log("Markdown data changed:", changes.markdownData.newValue);
      updateUI(changes.markdownData.newValue);
    }
  });

  /**
   * Updates the UI with the new markdown data.
   * Preserves the open state of previously opened boxes.
   * @param {Array} markdownData - The updated markdown data array.
   */
  function updateUI(markdownData) {
    // Preserve currently open URLs
    const currentlyOpenBoxes = container.querySelectorAll('.box-content');
    currentlyOpenBoxes.forEach(content => {
      if (content.style.display === 'block') {
        const box = content.parentElement;
        openUrls.add(box.dataset.url);
      }
    });

    container.innerHTML = ''; // Clear existing content

    if (markdownData && markdownData.length > 0) {
      markdownData.forEach((item, index) => {
        const box = document.createElement('div');
        box.className = 'box';
        box.dataset.url = item.url; // Add data attribute for tracking

        const title = document.createElement('div');
        title.className = 'box-title';
        title.textContent = getCoreDomain(item.url);

        const path = document.createElement('span');
        path.style.color = 'gray';
        path.textContent = ` ${new URL(item.url).pathname}`;
        title.appendChild(path);

        title.addEventListener('click', () => {
          const content = box.querySelector('.box-content');
          if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            openUrls.add(item.url); // Mark as open
          } else {
            content.style.display = 'none';
            openUrls.delete(item.url); // Mark as closed
          }
        });

        const content = document.createElement('div');
        content.className = 'box-content';
        content.style.display = 'none'; // Ensure initial state is hidden

        if (item.isLoading) {
          const loading = document.createElement('div');
          loading.className = 'loading';
          loading.textContent = 'Loading...';
          content.appendChild(loading);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = item.markdown;
          
          // Change event listener from 'input' to 'blur'
          textarea.addEventListener('blur', () => {
            markdownData[index].markdown = textarea.value;
            chrome.storage.local.set({ markdownData }, () => {
              if (chrome.runtime.lastError) {
                console.error("Error updating markdownData:", chrome.runtime.lastError);
              }
              // Do not reload or alter display state
            });
          });

          content.appendChild(textarea);
        }

        box.appendChild(title);
        box.appendChild(content);
        container.appendChild(box);

        // Restore open state if previously open
        if (openUrls.has(item.url)) {
          content.style.display = 'block';
        }
      });
    } else {
      container.textContent = 'No markdown data available.';
    }
  }

  /**
   * Extracts the core domain from a given URL.
   * @param {string} url - The URL to extract the core domain from.
   * @returns {string} - The core domain.
   */
  function getCoreDomain(url) {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.').slice(-2);
    return parts.join('.');
  }
});