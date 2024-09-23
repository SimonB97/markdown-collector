document.addEventListener('DOMContentLoaded', () => {
    const toggleListeningBtn = document.getElementById('toggleListening');
    const openHTMLPageBtn = document.getElementById('openHTMLPage');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const overwriteCheckbox = document.getElementById('overwriteCheckbox');
  
    browser.storage.local.get(['darkMode', 'overwriteExisting'], (data) => {
      darkModeToggle.checked = data.darkMode;
      overwriteCheckbox.checked = data.overwriteExisting;
      updateTheme(data.darkMode);
    });
  
    toggleListeningBtn.addEventListener('click', () => {
      browser.runtime.sendMessage({ action: "toggleListening" });
    });
  
    openHTMLPageBtn.addEventListener('click', () => {
      browser.runtime.sendMessage({ action: "openHTMLPage" });
    });
  
    darkModeToggle.addEventListener('change', (e) => {
      const isDarkMode = e.target.checked;
      browser.storage.local.set({ darkMode: isDarkMode });
      updateTheme(isDarkMode);
    });
  
    overwriteCheckbox.addEventListener('change', (e) => {
      browser.storage.local.set({ overwriteExisting: e.target.checked });
    });
  
    browser.runtime.onMessage.addListener((request) => {
      if (request.action === "updateListeningStatus") {
        toggleListeningBtn.textContent = request.isListening ? "Stop Listening" : "Start Listening";
      }
    });
  });
  
  function updateTheme(isDarkMode) {
    document.body.classList.toggle('dark', isDarkMode);
  }