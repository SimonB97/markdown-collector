import { createActionButton, showDiffModal } from './uiComponents.js';
import { groupByDate, getCoreDomain, getTodayDate, generateMockData } from './markdownUtils.js';

export function loadMarkdownData(container, openUrls) {
    browser.storage.local.get(['markdownData']).then((result) => {
      console.log("Loaded markdown data:", result.markdownData);
      let { markdownData } = result;
  
      if (!markdownData || markdownData.length === 0) {
        markdownData = generateMockData();
        browser.storage.local.set({ markdownData }).then(() => {
          renderMarkdownData(markdownData, container, openUrls);
        }).catch((error) => {
          console.error("Error setting mock markdownData:", error);
        });
      } else {
        renderMarkdownData(markdownData, container, openUrls);
      }
    }).catch((error) => {
      console.error("Error getting markdownData:", error);
    });
}

export function updateEntry(url) {
    chrome.storage.local.get(['enableCleanup'], (result) => {
      const enableCleanup = result.enableCleanup || false;
      
      fetchAndConvertToMarkdown(url, enableCleanup, (newMarkdown) => {
        if (!newMarkdown) {
          console.error("Failed to fetch or convert the page to markdown");
          return;
        }
        chrome.storage.local.get(['markdownData'], (result) => {
          const markdownData = result.markdownData || [];
          const item = markdownData.find(item => item.url === url);
          if (item) {
            const oldMarkdown = item.markdown;
            if (newMarkdown !== oldMarkdown) {
              showDiffModal(url, oldMarkdown, newMarkdown, (accepted) => {
                if (accepted) {
                  item.markdown = newMarkdown;
                  chrome.storage.local.set({ markdownData }, () => {
                    loadMarkdownData();
                  });
                }
              });
            } else {
              console.log("No changes detected in the markdown content");
            }
          } else {
            console.error("URL not found in markdownData:", url);
          }
        });
      });
    });
}

export function deleteEntry(url) {
    browser.storage.local.get(['markdownData']).then((result) => {
      const { markdownData } = result;
      const updatedData = markdownData.filter(item => item.url !== url);
      browser.storage.local.set({ markdownData: updatedData }).then(() => {
        loadMarkdownData();
      }).catch((error) => {
        console.error("Error deleting markdownData:", error);
      });
    }).catch((error) => {
      console.error("Error getting markdownData:", error);
    });
}

export function copyEntry(url, markdown) {
    const content = `<url>${url}</url>\n${markdown}`;
    navigator.clipboard.writeText(content).then(() => {
      console.log('Entry copied to clipboard');
    }).catch((err) => {
      console.error('Error copying entry to clipboard:', err);
    });
}

function renderMarkdownData(markdownData, container, openUrls) {
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
        selectAllCheckbox.style.marginRight = '10px';
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
        dateHeader.style.color = 'var(--date-header-text-color)';
        dateHeader.style.paddingLeft = '11px';
        dateHeader.style.cursor = 'pointer';

        const dateCheckbox = document.createElement('input');
        dateCheckbox.type = 'checkbox';
        dateCheckbox.className = 'date-checkbox';
        dateCheckbox.style.marginRight = '15px';
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
          pageCheckbox.style.marginRight = '15px';
          
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

          const rightSection = document.createElement('div');
          rightSection.style.display = 'flex';
          rightSection.style.justifyContent = 'flex-end';
          rightSection.style.maxWidth = '150px';
          rightSection.style.alignItems = 'center';
          rightSection.style.marginRight = '10px';

          const actionButtons = document.createElement('div');
          actionButtons.style.display = 'none';
          actionButtons.style.marginLeft = '15px';
          actionButtons.style.position = 'relative';

          const copyButton = createActionButton('⎘', 'copy', () => copyEntry(item.url, item.markdown));
          copyButton.style.backgroundColor = 'var(--copy-button-background)';
          const updateButton = createActionButton('↻', 'update', () => updateEntry(item.url));
          updateButton.style.backgroundColor = 'var(--update-button-background)';
          const deleteButton = createActionButton('✕', 'delete', () => deleteEntry(item.url));
          deleteButton.style.backgroundColor = 'var(--delete-button-background)';

          actionButtons.appendChild(copyButton);
          actionButtons.appendChild(updateButton);
          actionButtons.appendChild(deleteButton);

          const dateTimeText = document.createElement('span');
          const savedDateTime = new Date(item.savedAt);
          dateTimeText.textContent = `${savedDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
          dateTimeText.style.color = 'gray';
          dateTimeText.style.fontSize = '16px';
          dateTimeText.style.fontFamily = 'monospace';

          rightSection.appendChild(actionButtons);
          rightSection.appendChild(dateTimeText);

          title.appendChild(pageCheckbox);
          title.appendChild(titleContent);
          title.appendChild(rightSection);

          // Show action buttons on hover
          title.addEventListener('mouseenter', () => {
            actionButtons.style.display = 'inline-flex';
            actionButtons.style.pointerEvents = 'auto';  // Enable pointer events when visible
          });
          
          title.addEventListener('mouseleave', () => {
            actionButtons.style.display = 'none';
            actionButtons.style.pointerEvents = 'none';  // Disable pointer events when hidden
          });

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

export function fetchAndConvertToMarkdown(url, enableCleanup, callback) {
    const timeoutDuration = 30000; // 30 seconds timeout
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Request timed out'));
      }, timeoutDuration);
    });

    const fetchPromise = new Promise((resolve) => {
      chrome.runtime.sendMessage({ command: "fetch-url", url: url }, (response) => {
        clearTimeout(timeoutId);
        resolve(response);
      });
    });

    Promise.race([fetchPromise, timeoutPromise])
      .then((response) => {
        if (!response) {
          throw new Error('No response received from background script');
        }
        if (response.error) {
          throw new Error(`Error fetching URL: ${response.error}`);
        }
        return response.html;
      })
      .then((html) => {
        return new Promise((resolve) => {
          if (enableCleanup) {
            // Dynamically load Readability
            const readabilityScript = document.createElement('script');
            readabilityScript.src = chrome.runtime.getURL('libs/Readability.js');
            readabilityScript.onload = () => {
              const doc = new DOMParser().parseFromString(html, 'text/html');
              const reader = new Readability(doc, {
                keepClasses: ['article-title', 'page-title', 'post-title'],
                classesToPreserve: ['article-title', 'page-title', 'post-title']
              });
              const article = reader.parse();
              let cleanHtml = article ? article.content : html;
              
              // Prepend the title if available
              if (article && article.title) {
                cleanHtml = `<h1>${article.title}</h1>${cleanHtml}`;
              }
              
              resolve(cleanHtml);
            };
            document.head.appendChild(readabilityScript);
          } else {
            resolve(html);
          }
        });
      })
      .then((html) => {
        // Inject TurndownService script
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('libs/turndown.min.js');
        document.head.appendChild(script);

        return new Promise((resolve) => {
          script.onload = () => {
            const turndownService = new TurndownService();
            const markdown = turndownService.turndown(html);
            resolve(markdown);
          };
        });
      })
      .then((markdown) => {
        callback(markdown);
      })
      .catch((error) => {
        console.error('Error in fetchAndConvertToMarkdown:', error);
        callback(null);
      });
}

