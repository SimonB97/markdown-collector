document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('markdown-container');
  const copyButton = document.getElementById('copy-markdown-page');
  const deleteButton = document.getElementById('delete-markdown-page');
  const updateButton = document.getElementById('update-markdown-page');

  // Track open URLs to preserve state after UI update
  let openUrls = new Set();

  function loadMarkdownData() {
    browser.storage.local.get(['markdownData']).then((result) => {
      console.log("Loaded markdown data:", result.markdownData);
      let { markdownData } = result;
  
      if (!markdownData || markdownData.length === 0) {
        markdownData = generateMockData();
        browser.storage.local.set({ markdownData }).then(() => {
          renderMarkdownData(markdownData);
        }).catch((error) => {
          console.error("Error setting mock markdownData:", error);
        });
      } else {
        renderMarkdownData(markdownData);
      }
    }).catch((error) => {
      console.error("Error getting markdownData:", error);
    });
  }

  function renderMarkdownData(markdownData) {
    console.log("Rendering markdown data:", markdownData);
    // Clear the container before adding new elements
    container.innerHTML = '';

    if (markdownData && markdownData.length > 0) {
      const groupedData = groupByDate(markdownData);
      
      // Sort date groups from newest to oldest using ISO date strings
      const dateGroups = Object.keys(groupedData).sort((a, b) => {
        if (a === 'Unknown Date') return 1; // Push 'Unknown Date' to the end
        if (b === 'Unknown Date') return -1;
        return b.localeCompare(a); // Descending order
      });

      // Add "Select All" checkbox at the top if there are multiple date groups
      if (dateGroups.length > 1) {
        const selectAllBox = document.createElement('div');
        selectAllBox.className = 'select-all-box';

        const selectAllCheckbox = document.createElement('input');
        selectAllCheckbox.type = 'checkbox';
        selectAllCheckbox.className = 'select-all-checkbox';
        selectAllBox.appendChild(selectAllCheckbox);

        const selectAllLabel = document.createElement('label');
        selectAllLabel.textContent = ' All';
        selectAllLabel.style.cursor = 'pointer';
        selectAllLabel.style.color = 'gray';
        selectAllBox.appendChild(selectAllLabel);

        container.appendChild(selectAllBox);

        function toggleAllCheckboxes() {
          const allCheckboxes = container.querySelectorAll('.page-checkbox, .date-checkbox');
          allCheckboxes.forEach(checkbox => checkbox.checked = selectAllCheckbox.checked);
        }

        selectAllCheckbox.addEventListener('change', toggleAllCheckboxes);
        selectAllLabel.addEventListener('click', () => {
          selectAllCheckbox.checked = !selectAllCheckbox.checked;
          toggleAllCheckboxes();
        });
      }

      dateGroups.forEach(date => {
        const dateBox = document.createElement('div');
        dateBox.className = 'date-box';

        const dateHeader = document.createElement('div');
        dateHeader.className = 'date-header';
        dateHeader.textContent = date; // Display date in ISO format
        dateHeader.style.color = 'lightgray';
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
          box.dataset.url = item.url;
          box.style.padding = '0';

          const title = document.createElement('div');
          title.className = 'box-title';
          title.style.display = 'flex';
          title.style.justifyContent = 'space-between';
          title.style.alignItems = 'center';

          const pageCheckbox = document.createElement('input');
          pageCheckbox.type = 'checkbox';
          pageCheckbox.className = 'page-checkbox';
          pageCheckbox.style.marginRight = '10px';
          
          const titleContent = document.createElement('div');
          titleContent.style.flex = '1';
          titleContent.style.overflow = 'hidden';
          titleContent.style.textOverflow = 'ellipsis';
          titleContent.style.whiteSpace = 'nowrap';
          titleContent.style.cursor = 'pointer';

          const titleText = document.createElement('span');
          titleText.textContent = getCoreDomain(item.url);
          titleText.style.fontSize = '20px';
          titleText.style.color = 'var(--entry-title-color)';

          const path = document.createElement('span');
          path.style.color = 'gray';
          path.style.fontSize = '20px';
          path.textContent = ` ${new URL(item.url).pathname}`;
          titleText.appendChild(path);

          titleContent.appendChild(titleText);

          const dateTimeText = document.createElement('span');
          const savedDateTime = new Date(item.savedAt);
          dateTimeText.textContent = `${savedDateTime.toLocaleTimeString()}`;
          dateTimeText.style.color = 'gray';
          dateTimeText.style.fontSize = '16px';
          dateTimeText.style.marginLeft = '10px';
          dateTimeText.style.flexShrink = '0';

          title.appendChild(pageCheckbox);
          title.appendChild(titleContent);
          title.appendChild(dateTimeText);

          // Prevent checkbox click from toggling the content
          pageCheckbox.addEventListener('click', (event) => {
            event.stopPropagation();
          });

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

            // Update the event listener
            textarea.addEventListener('blur', () => {
              const updatedMarkdown = textarea.value;
              browser.storage.local.get(['markdownData']).then((result) => {
                let { markdownData } = result;
                const itemIndex = markdownData.findIndex(md => md.url === item.url);
                if (itemIndex !== -1) {
                  markdownData[itemIndex].markdown = updatedMarkdown;
                  browser.storage.local.set({ markdownData }).then(() => {
                    console.log("Markdown updated successfully");
                  }).catch((error) => {
                    console.error("Error updating markdownData:", error);
                  });
                }
              }).catch((error) => {
                console.error("Error getting markdownData:", error);
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
  }

  loadMarkdownData();

  // Listen for updates to markdownData without reloading the page
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.markdownData) {
      console.log("Markdown data changed:", changes.markdownData.newValue);
      // Reload the markdown data
      loadMarkdownData();
    }
  });

  /**
   * Groups markdown data by date.
   * @param {Array} markdownData - The markdown data array.
   * @returns {Object} - The grouped markdown data.
   */
  function groupByDate(markdownData) {
    const grouped = markdownData.reduce((acc, item) => {
      let date;
      try {
        // Use ISO date format for consistency
        date = new Date(item.savedAt).toISOString().slice(0, 10); // "YYYY-MM-DD"
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

    // Sort entries within each date group by savedAt in descending order
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    });

    return grouped;
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
   * Retrieves today's date in ISO format (YYYY-MM-DD).
   * @returns {string} - Today's date as a string.
   */
  function getTodayDate() {
    const today = new Date();
    return today.toISOString().slice(0, 10); // "YYYY-MM-DD"
  }

  /**
   * Handles incoming messages for copying selected markdown.
   */
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

  // Add event listener for the copy button
  copyButton.addEventListener('click', () => {
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
      copyButton.textContent = '✔ Copied';
      setTimeout(() => {
        copyButton.textContent = '⎘ Copy';
      }, 2000); // Reset button text after 2 seconds
    }).catch((err) => {
      console.error('Error copying to clipboard:', err);
    });
  });

  // Add event listener for the delete button
  deleteButton.addEventListener('click', () => {
    const selectedUrls = [];

    // Collect URLs of selected entries
    const dateBoxes = container.querySelectorAll('.date-box');
    dateBoxes.forEach(dateBox => {
      const pageCheckboxes = dateBox.querySelectorAll('.page-checkbox');
      pageCheckboxes.forEach((checkbox) => {
        if (checkbox.checked) {
          const box = checkbox.closest('.box');
          selectedUrls.push(box.dataset.url);
        }
      });
    });

    // Remove selected entries from storage
    browser.storage.local.get(['markdownData']).then((result) => {
      const { markdownData } = result;
      const updatedData = markdownData.filter(item => !selectedUrls.includes(item.url));
      browser.storage.local.set({ markdownData: updatedData }).then(() => {
        loadMarkdownData(); // Reload the data to reflect changes
      }).catch((error) => {
        console.error("Error deleting markdownData:", error);
      });
    }).catch((error) => {
      console.error("Error getting markdownData:", error);
    });
  });

  // Add event listener for the update button
  updateButton.addEventListener('click', () => {
    const selectedUrls = [];

    // Collect URLs of selected entries
    const dateBoxes = container.querySelectorAll('.date-box');
    dateBoxes.forEach(dateBox => {
      const pageCheckboxes = dateBox.querySelectorAll('.page-checkbox');
      pageCheckboxes.forEach((checkbox) => {
        if (checkbox.checked) {
          const box = checkbox.closest('.box');
          selectedUrls.push(box.dataset.url);
        }
      });
    });

    // Fetch and update selected entries
    browser.storage.local.get(['markdownData']).then((result) => {
      const { markdownData } = result;
      selectedUrls.forEach(url => {
        const item = markdownData.find(item => item.url === url);
        if (item) {
          fetchAndConvertToMarkdown(url, (newMarkdown) => {
            const oldMarkdown = item.markdown;
            if (newMarkdown !== oldMarkdown) {
              showDiffModal(url, oldMarkdown, newMarkdown, (accepted) => {
                if (accepted) {
                  item.markdown = newMarkdown;
                  browser.storage.local.set({ markdownData }).then(() => {
                    loadMarkdownData(); // Reload the data to reflect changes
                  }).catch((error) => {
                    console.error("Error updating markdownData:", error);
                  });
                }
              });
            }
          });
        }
      });
    }).catch((error) => {
      console.error("Error getting markdownData:", error);
    });
  });

  function fetchAndConvertToMarkdown(url, callback) {
    browser.runtime.sendMessage({ command: "fetch-url", url: url }).then((response) => {
      if (response.error) {
        console.error('Error fetching URL:', response.error);
        return;
      }
      
      const html = response.html;
      // Inject TurndownService script
      const script = document.createElement('script');
      script.src = browser.runtime.getURL('libs/turndown.min.js');
      document.head.appendChild(script);

      script.onload = () => {
        const turndownService = new TurndownService();
        const markdown = turndownService.turndown(html);
        callback(markdown);
      };
    }).catch((error) => {
      console.error('Error sending message to fetch URL:', error);
    });
  }

  // Function to show diff modal using jsdiff
  function showDiffModal(url, oldMarkdown, newMarkdown, callback) {
    const modal = document.createElement('div');
    modal.className = 'diff-modal';

    const diff = Diff.diffLines(oldMarkdown, newMarkdown);
    const fragment = document.createDocumentFragment();

    diff.forEach((part) => {
      const color = part.added ? 'green' :
        part.removed ? 'red' : 'grey';
      const span = document.createElement('span');
      span.style.color = color;
      span.appendChild(document.createTextNode(part.value));
      fragment.appendChild(span);
    });

    const diffContainer = document.createElement('div');
    diffContainer.appendChild(fragment);
    modal.appendChild(diffContainer);

    const acceptButton = document.createElement('button');
    acceptButton.textContent = 'Accept';
    acceptButton.addEventListener('click', () => {
      callback(true);
      document.body.removeChild(modal);
    });

    const declineButton = document.createElement('button');
    declineButton.textContent = 'Decline';
    declineButton.addEventListener('click', () => {
      callback(false);
      document.body.removeChild(modal);
    });

    modal.appendChild(acceptButton);
    modal.appendChild(declineButton);

    document.body.appendChild(modal);
  }

  /**
   * Generates mock markdown data for testing purposes.
   * @returns {Array} - An array of mock markdown data objects.
   */
  function generateMockData() {
    const now = new Date();
    const mockData = [
      {
        url: "https://example.com/page1",
        title: "Example Page 1",
        markdown: "## Example Markdown 1",
        isLoading: false,
        savedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
      },
      {
        url: "https://example.net/page4",
        title: "Example Page 4",
        markdown: "## Example Markdown 4",
        isLoading: false,
        savedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
      },
      {
        url: "https://example.com/page2",
        title: "Example Page 2",
        markdown: "## Example Markdown 2",
        isLoading: false,
        savedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() // 1 day ago
      },
      {
        url: "https://example.com/page3",
        title: "Example Page 3",
        markdown: "## Example Markdown 3",
        isLoading: false,
        savedAt: now.toISOString() // Today
      },
    ];

    return mockData;
  }
});