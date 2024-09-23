document.addEventListener('DOMContentLoaded', () => {
    const markdownContainer = document.getElementById('markdownContainer');
    const exportBtn = document.getElementById('exportMarkdown');
  
    browser.storage.local.get(null, (data) => {
      for (const [url, markdown] of Object.entries(data)) {
        if (url !== 'darkMode' && url !== 'overwriteExisting' && url !== 'backgroundConversion') {
          createMarkdownBox(url, markdown);
        }
      }
    });
  
    exportBtn.addEventListener('click', exportMarkdown);
  });
  
  function createMarkdownBox(url, markdown) {
    const box = document.createElement('details');
    const summary = document.createElement('summary');
    const content = document.createElement('textarea');
  
    summary.textContent = new URL(url).hostname;
    content.value = markdown;
    content.addEventListener('input', () => {
      browser.storage.local.set({ [url]: content.value });
    });
  
    box.appendChild(summary);
    box.appendChild(content);
    markdownContainer.appendChild(box);
  }
  
  function exportMarkdown() {
    browser.storage.local.get(null, (data) => {
      let concatenatedMarkdown = '';
      for (const [url, markdown] of Object.entries(data)) {
        if (url !== 'darkMode' && url !== 'overwriteExisting' && url !== 'backgroundConversion') {
          concatenatedMarkdown += `<entry>\n<url>${url}</url>\n<title>${new URL(url).hostname}</title>\n<content>\n${markdown}\n</content>\n</entry>\n\n`;
        }
      }
      copyToClipboard(concatenatedMarkdown);
    });
  }
  
  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      alert('Markdown copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  }