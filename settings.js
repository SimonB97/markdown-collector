document.addEventListener('DOMContentLoaded', () => {
  const cleanupToggle = document.getElementById('cleanup-toggle');

  // Initialize the toggle based on stored setting, defaulting to true if not set
  chrome.storage.local.get(['enableCleanup'], (result) => {
    const isEnabled = result.enableCleanup !== undefined ? result.enableCleanup : true;
    cleanupToggle.checked = isEnabled;
    updateToggleVisually(cleanupToggle);
  });

  cleanupToggle.addEventListener('change', () => {
    const isEnabled = cleanupToggle.checked;
    chrome.storage.local.set({ enableCleanup: isEnabled }, () => {
      console.log(`Content Cleanup ${isEnabled ? 'enabled' : 'disabled'}`);
      updateToggleVisually(cleanupToggle);
    });
  });
});

// Function to update the toggle's visual state
function updateToggleVisually(toggle) {
  if (toggle.checked) {
    toggle.parentElement.classList.add('checked');
  } else {
    toggle.parentElement.classList.remove('checked');
  }
}
