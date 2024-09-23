document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('markdown-container');

  chrome.storage.local.get(['markdownData'], (result) => {
    console.log("Loaded markdown data:", result.markdownData);
    const { markdownData } = result;
    if (markdownData && markdownData.length > 0) {
      markdownData.forEach((item, index) => {
        const box = document.createElement('div');
        box.className = 'box';

        const title = document.createElement('div');
        title.className = 'box-title';
        title.textContent = getCoreDomain(item.url);

        const path = document.createElement('span');
        path.style.color = 'gray';
        path.textContent = ` ${new URL(item.url).pathname}`;
        title.appendChild(path);

        title.addEventListener('click', () => {
          const content = box.querySelector('.box-content');
          content.style.display = content.style.display === 'none' ? 'block' : 'none';
        });

        const content = document.createElement('div');
        content.className = 'box-content';

        if (item.isLoading) {
          const loading = document.createElement('div');
          loading.className = 'loading';
          loading.textContent = 'Loading...';
          content.appendChild(loading);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = item.markdown;
          textarea.addEventListener('input', () => {
            markdownData[index].markdown = textarea.value;
            chrome.storage.local.set({ markdownData }, () => {
              if (chrome.runtime.lastError) {
                console.error("Error updating markdownData:", chrome.runtime.lastError);
              }
            });
          });
          content.appendChild(textarea);
        }

        box.appendChild(title);
        box.appendChild(content);
        container.appendChild(box);
      });
    } else {
      container.textContent = 'No markdown data available.';
    }
  });

  // Listen for updates to markdownData
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.markdownData) {
      console.log("Markdown data changed:", changes.markdownData);
      // Reload the page or update the UI accordingly
      location.reload();
    }
  });
});

function getCoreDomain(url) {
  const hostname = new URL(url).hostname;
  const parts = hostname.split('.').slice(-2);
  return parts.join('.');
}