import { createActionButton, showDiffModal } from './uiComponents.js';
import { groupByDate, getCoreDomain, getTodayDate, generateMockData } from './markdownUtils.js';

export function loadMarkdownData(container, openUrls, query = '', filters = { searchUrl: true, searchTitle: true, searchContents: true }) {
    browser.storage.local.get(['markdownData']).then((result) => {
      console.log("Loaded markdown data:", result.markdownData);
      let { markdownData } = result;
  
      if (!markdownData || markdownData.length === 0) {
        markdownData = generateMockData();
        browser.storage.local.set({ markdownData }).then(() => {
          renderMarkdownData(markdownData, container, openUrls, query, filters);
        }).catch((error) => {
          console.error("Error setting mock markdownData:", error);
        });
      } else {
        renderMarkdownData(markdownData, container, openUrls, query, filters);
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

function renderMarkdownData(markdownData, container, openUrls, query, filters) {
    console.log("Rendering markdown data:", markdownData);
    // Clear the container before adding new elements
    container.innerHTML = '';

    if (markdownData && markdownData.length > 0) {
      const filteredData = query ? searchMarkdownEntries(markdownData, query, filters) : markdownData;
      const groupedData = groupByDate(filteredData);
      
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
        selectAllLabel.style.color = 'var(--select-all-text-color)';
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
        dateHeader.style.color = 'var(--time-date-color)';
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
        dateContent.style.display = date === getTodayDate() || query ? 'block' : 'none'; // Ensure date headers are expanded when search results are displayed

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
          
          if (item.isBatchProcessed && item.batchInfo) {
            const titleContent = createBatchTitleContent(item.batchInfo);
            title.appendChild(pageCheckbox);
            title.appendChild(titleContent);
          } else {
            const titleContent = document.createElement('div');
            titleContent.style.cssText = `
              flex: 1;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              cursor: default;
            `;

            const titleText = document.createElement('span');
            titleText.textContent = getCoreDomain(item.url);
            titleText.style.fontSize = '20px';
            titleText.style.color = 'var(--entry-title-color)';

            const path = document.createElement('span');
            path.style.color = 'gray';
            path.style.fontSize = '20px';
            path.textContent = ` ${new URL(item.url).pathname}`;
            titleText.appendChild(path);

            const pageTitle = document.createElement('div');
            pageTitle.className = 'title-text';
            pageTitle.textContent = item.title;
            pageTitle.style.fontSize = '12px';
            pageTitle.style.color = 'gray';
            pageTitle.style.marginTop = '5px';

            titleContent.appendChild(titleText);
            titleContent.appendChild(pageTitle);

            title.appendChild(pageCheckbox);
            title.appendChild(titleContent);
          }

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
          dateTimeText.style.color = 'var(--time-date-color)';
          dateTimeText.style.fontSize = '16px';
          dateTimeText.style.fontFamily = 'monospace';

          rightSection.appendChild(actionButtons);
          rightSection.appendChild(dateTimeText);

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

export function searchMarkdownEntries(markdownData, query, filters) {
    const lowerCaseQuery = query.toLowerCase();
    return markdownData.filter(item => {
      const urlMatch = filters.searchUrl && item.url.toLowerCase().includes(lowerCaseQuery);
      const titleMatch = filters.searchTitle && item.title.toLowerCase().includes(lowerCaseQuery);
      const markdownMatch = filters.searchContents && item.markdown.toLowerCase().includes(lowerCaseQuery);
      return urlMatch || titleMatch || markdownMatch;
    });
}

function createBatchTitleContent(batchInfo) {
  const container = document.createElement('div');
  container.style.cssText = `
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: default;
  `;
  
  // Title row with chips and plus icon
  const titleRow = document.createElement('div');
  titleRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  
  const urlsByDomain = groupUrlsByDomain(batchInfo.sources);
  const domains = Object.keys(urlsByDomain);
  
  // Create title text
  const titleText = document.createElement('span');
  titleText.style.cssText = `
    font-size: 20px;
    color: var(--entry-title-color);
  `;
  
  if (domains.length === 1) {
    titleText.textContent = domains[0];
  } else {
    titleText.textContent = `${batchInfo.sources.length} combined pages`;
  }
  
  titleRow.appendChild(titleText);
  
  // Add chips inline with title
  const chipsContainer = document.createElement('div');
  chipsContainer.style.cssText = `
    display: flex;
    align-items: center;
    margin-left: 8px;
  `;
  
  if (domains.length === 1) {
    addPathChips(chipsContainer, urlsByDomain[domains[0]]);
  } else {
    addDomainChips(chipsContainer, domains);
  }
  
  titleRow.appendChild(chipsContainer);
  
  // Add plus icon at the end
  const plusIcon = createPlusIcon(batchInfo);
  titleRow.appendChild(plusIcon);
  
  container.appendChild(titleRow);
  
  // Add prompt on new line
  if (batchInfo.prompt) {
    const promptDisplay = createPromptDisplay(batchInfo.prompt);
    promptDisplay.style.cssText = `
      margin-top: 5px;
      width: 100%;
      font-size: 12px;
      color: gray;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    `;
    container.appendChild(promptDisplay);
  }
  
  return container;
}

function createPlusIcon(batchInfo) {
  const plusIcon = document.createElement('div');
  plusIcon.textContent = '+';
  plusIcon.style.cssText = `
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background-color: rgba(66, 135, 245, 0.15);
    color: #4287f5;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 8px;
    margin-top: 1px;
    cursor: pointer;
  `;
  
  let popup = null;
  let hideTimeout = null;
  let isMouseOverIcon = false;
  let isMouseOverPopup = false;
  
  function showPopup() {
    if (!popup) {
      popup = createHoverPopup(batchInfo);
      const rect = plusIcon.getBoundingClientRect();
      
      // Create invisible "safe zone" between icon and popup
      const safeZone = document.createElement('div');
      safeZone.style.cssText = `
        position: fixed;
        top: ${rect.bottom}px;
        left: ${rect.left - 20}px;
        width: ${popup.offsetWidth + 40}px;
        height: 10px;
        background: transparent;
        z-index: 999;
      `;
      document.body.appendChild(safeZone);
      
      popup.style.top = `${rect.bottom + 10}px`;
      popup.style.left = `${rect.left}px`;
      document.body.appendChild(popup);
      
      // Remove safe zone after popup is shown
      setTimeout(() => safeZone.remove(), 100);
    }
  }
  
  function hidePopup() {
    hideTimeout = setTimeout(() => {
      if (!isMouseOverIcon && !isMouseOverPopup && popup) {
        popup.remove();
        popup = null;
      }
    }, 300); // 300ms delay before hiding
  }
  
  function cancelHidePopup() {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  }
  
  plusIcon.addEventListener('mouseenter', () => {
    isMouseOverIcon = true;
    cancelHidePopup();
    showPopup();
  });
  
  plusIcon.addEventListener('mouseleave', () => {
    isMouseOverIcon = false;
    hidePopup();
  });
  
  // Update the popup event listeners
  const originalCreateHoverPopup = createHoverPopup;
  createHoverPopup = (batchInfo) => {
    const popup = originalCreateHoverPopup(batchInfo);
    
    popup.addEventListener('mouseenter', () => {
      isMouseOverPopup = true;
      cancelHidePopup();
    });
    
    popup.addEventListener('mouseleave', () => {
      isMouseOverPopup = false;
      hidePopup();
    });
    
    return popup;
  };
  
  return plusIcon;
}

function createHoverPopup(batchInfo) {
  const popup = document.createElement('div');
  popup.style.cssText = `
    position: fixed;
    background: var(--background-color);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 1000;
    max-width: 400px;
    font-size: 14px;
    max-height: 80vh;
    overflow-y: auto;
  `;
  
  // Add prompt with styling
  if (batchInfo.prompt) {
    const promptDiv = document.createElement('div');
    promptDiv.style.cssText = `
      margin-bottom: 12px;
      padding: 8px;
      background: rgba(66, 135, 245, 0.1);
      border-radius: 4px;
      font-style: italic;
      color: var(--text-color);
    `;
    promptDiv.textContent = `"${batchInfo.prompt}"`;
    popup.appendChild(promptDiv);
  }
  
  // Group and display URLs
  const urlsByDomain = groupUrlsByDomain(batchInfo.sources);
  Object.entries(urlsByDomain).forEach(([domain, urls]) => {
    const domainDiv = document.createElement('div');
    domainDiv.style.cssText = `
      margin-top: 12px;
      font-weight: bold;
      color: var(--entry-title-color);
      padding-bottom: 4px;
      border-bottom: 1px solid var(--border-color);
    `;
    domainDiv.textContent = domain;
    popup.appendChild(domainDiv);
    
    urls.forEach(url => {
      const urlDiv = createUrlEntry(url);
      popup.appendChild(urlDiv);
    });
  });
  
  // Add event listener to keep popup open when hovering over it
  popup.addEventListener('mouseenter', () => {
    popup.style.display = 'block';
  });
  
  popup.addEventListener('mouseleave', () => {
    popup.remove();
  });
  
  return popup;
}

function createUrlEntry(url) {
  const div = document.createElement('div');
  div.style.cssText = `
    padding: 4px 8px;
    margin: 2px 0;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  
  div.textContent = url.title || url.url;
  div.title = url.url;
  
  div.addEventListener('mouseover', () => {
    div.style.background = 'rgba(0,0,0,0.05)';
  });
  
  div.addEventListener('mouseout', () => {
    div.style.background = 'none';
  });
  
  div.addEventListener('click', () => {
    window.open(url.url, '_blank');
  });
  
  return div;
}

function groupUrlsByDomain(urls) {
  return urls.reduce((acc, url) => {
    const domain = getCoreDomain(url.url);
    if (!acc[domain]) {
      acc[domain] = [];
    }
    acc[domain].push(url);
    return acc;
  }, {});
}

function addPathChips(container, urls) {
  // Get full paths without the leading slash
  const paths = urls.map(url => {
    const pathname = new URL(url.url).pathname;
    return pathname.startsWith('/') ? pathname.substring(1) : pathname;
  }).filter(Boolean);
  
  addChips(container, paths, 'path');
}

function addDomainChips(container, domains) {
  addChips(container, domains, 'domain');
}

function addChips(container, items, type) {
  const maxChips = 3;
  const colors = [
    'rgba(255, 182, 193, 0.3)', // Light pink
    'rgba(173, 216, 230, 0.3)', // Light blue
    'rgba(144, 238, 144, 0.3)'  // Light green
  ];
  
  const chipWrapper = document.createElement('div');
  chipWrapper.style.cssText = `
    display: flex;
    align-items: center;
  `;
  
  items.slice(0, maxChips).forEach((item, index) => {
    const chip = document.createElement('span');
    chip.style.cssText = `
      display: inline-block;
      padding: 2px 6px;
      margin-right: 4px;
      border-radius: 3px;
      background-color: ${colors[index % colors.length]};
      font-size: 12px;
      white-space: nowrap;
    `;
    chip.textContent = item;
    chipWrapper.appendChild(chip);
  });
  
  if (items.length > maxChips) {
    const remaining = document.createElement('span');
    remaining.style.cssText = `
      color: gray;
      font-size: 12px;
      margin-right: 8px;
    `;
    remaining.textContent = `+${items.length - maxChips}`;
    chipWrapper.appendChild(remaining);
  }
  
  container.appendChild(chipWrapper);
}

function createPromptDisplay(prompt) {
  const container = document.createElement('div');
  container.style.cssText = `
    width: 100%;
    font-size: 12px;
    color: gray;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  
  const displayText = prompt.length > 100 ? prompt.slice(0, 97) + '...' : prompt;
  container.textContent = `"${displayText}"`;
  container.title = prompt;
  
  return container;
}
