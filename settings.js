document.addEventListener('DOMContentLoaded', () => {
  const cleanupToggle = document.getElementById('cleanup-toggle');

  chrome.storage.local.get(['enableCleanup'], (result) => {
    cleanupToggle.checked = result.enableCleanup || false;
  });

  cleanupToggle.addEventListener('change', () => {
    const isEnabled = cleanupToggle.checked;
    chrome.storage.local.set({ enableCleanup: isEnabled }, () => {
      console.log(`Content Cleanup ${isEnabled ? 'enabled' : 'disabled'}`);
    });
  });
});