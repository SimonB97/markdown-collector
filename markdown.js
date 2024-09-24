document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('markdown-container');

  // Track open URLs to preserve state after UI update
  let openUrls = new Set();

  function loadMarkdownData() {
    chrome.storage.local.get(['markdownData'], (result) => {
      console.log("Loaded markdown data:", result.markdownData);
      const { markdownData } = result;
      if (markdownData && markdownData.length > 0) {
        const groupedData = groupByDate(markdownData);
        const dateGroups = Object.keys(groupedData);

        // Add "Select All" checkbox at the top if there are multiple date groups
        if (dateGroups.length > 1) {
          const selectAllBox = document.createElement('div');
          selectAllBox.className = 'select-all-box';

          const selectAllCheckbox = document.createElement('input');
          selectAllCheckbox.type = 'checkbox';
          selectAllCheckbox.className = 'select-all-checkbox';
          selectAllBox.appendChild(selectAllCheckbox);

          const selectAllLabel = document.createElement('label');
          selectAllLabel.textContent = 'Select All';
          selectAllBox.appendChild(selectAllLabel);

          container.appendChild(selectAllBox);

          selectAllCheckbox.addEventListener('change', () => {
            const allCheckboxes = container.querySelectorAll('.page-checkbox, .date-checkbox');
            allCheckboxes.forEach(checkbox => checkbox.checked = selectAllCheckbox.checked);
          });
        }

        dateGroups.forEach(date => {
          const dateBox = document.createElement('div');
          dateBox.className = 'date-box';

          const dateHeader = document.createElement('div');
          dateHeader.className = 'date-header';
          dateHeader.textContent = date;
          dateHeader.style.color = 'orange';
          dateHeader.style.paddingLeft = '11px';
          dateHeader.style.cursor = 'pointer';

          const dateCheckbox = document.createElement('input');
          dateCheckbox.type = 'checkbox';
          dateCheckbox.className = 'date-checkbox';
          dateCheckbox.style.marginRight = '10px'; // Add space between checkbox and date header
          dateHeader.prepend(dateCheckbox);

          // Prevent checkbox click from toggling the date group
          dateCheckbox.addEventListener('click', (event) => {
            event.stopPropagation();
          });

          const dateContent = document.createElement('div');
          dateContent.className = 'date-content';
          dateContent.style.display = date === getTodayDate() ? 'block' : 'none'; // Only current date expanded by default

          dateHeader.addEventListener('click', () => {
            dateContent.style.display = dateContent.style.display === 'none' ? 'block' : 'none';
          });

          dateCheckbox.addEventListener('change', () => {
            const checkboxes = dateContent.querySelectorAll('.page-checkbox');
            checkboxes.forEach(checkbox => checkbox.checked = dateCheckbox.checked);
          });

          groupedData[date].forEach((item, index) => {
            const box = document.createElement('div');
            box.className = 'box';
            box.dataset.url = item.url; // Add data attribute for tracking

            const title = document.createElement('div');
            title.className = 'box-title';

            const pageCheckbox = document.createElement('input');
            pageCheckbox.type = 'checkbox';
            pageCheckbox.className = 'page-checkbox';
            pageCheckbox.style.marginRight = '10px'; // Add some space between checkbox and title
            title.prepend(pageCheckbox);

            // Prevent checkbox click from toggling the content
            pageCheckbox.addEventListener('click', (event) => {
              event.stopPropagation();
            });

            const titleText = document.createElement('span');
            titleText.textContent = getCoreDomain(item.url);

            const path = document.createElement('span');
            path.style.color = 'gray';
            path.textContent = ` ${new URL(item.url).pathname}`;
            titleText.appendChild(path);

            title.appendChild(titleText);

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
              textarea.style.height = '50vh';

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
            dateContent.appendChild(box);

            // Restore open state if previously open
            if (openUrls.has(item.url)) {
              content.style.display = 'block';
            }
          });

          dateBox.appendChild(dateHeader);
          dateBox.appendChild(dateContent);
          container.appendChild(dateBox);
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
   * Groups markdown data by date.
   * @param {Array} markdownData - The markdown data array.
   * @returns {Object} - The grouped markdown data.
   */
  function groupByDate(markdownData) {
    return markdownData.reduce((acc, item) => {
      let date;
      try {
        date = new Date(item.savedAt).toLocaleDateString();
        if (isNaN(new Date(item.savedAt))) {
          throw new Error("Invalid Date");
        }
      } catch (error) {
        console.warn(`Invalid savedAt for URL: ${item.url}. Using 'Unknown Date'.`);
        date = 'Unknown Date';
      }

      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(item);
      return acc;
    }, {});
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

  /**
   * Gets today's date in locale string format.
   * @returns {string} - Today's date.
   */
  function getTodayDate() {
    return new Date().toLocaleDateString();
  }

  /**
   * Handles incoming messages for copying selected markdown.
   */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.command === 'copy-selected-markdown') {
      const selectedMarkdown = [];

      // Iterate through each date group
      const dateBoxes = container.querySelectorAll('.date-box');
      dateBoxes.forEach(dateBox => {
        const pageCheckboxes = dateBox.querySelectorAll('.page-checkbox');
        pageCheckboxes.forEach((checkbox, index) => {
          if (checkbox.checked) {
            const box = checkbox.closest('.box');
            const content = box.querySelector('.box-content textarea');
            if (content) {
              const title = box.querySelector('.box-title span').textContent;
              selectedMarkdown.push(`<url>${box.dataset.url}</url>\n<title>${title}</title>\n${content.value}`);
            }
          }
        });
      });

      const markdownText = selectedMarkdown.join('\n\n\n');
      navigator.clipboard.writeText(markdownText).then(() => {
        sendResponse({ status: 'success' });
      }).catch((err) => {
        console.error('Error copying to clipboard:', err);
        sendResponse({ status: 'failure', error: err });
      });

      // Return true to indicate that the response is sent asynchronously
      return true;
    }
  });
});