/*
 * This file is part of Markdown Collector.
 *
 * Markdown Collector is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Markdown Collector is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Markdown Collector.  If not, see <https://www.gnu.org/licenses/>.
 */


document.addEventListener('DOMContentLoaded', () => {
  const cleanupToggle = document.getElementById('cleanup-toggle');
  const llmToggle = document.getElementById('llm-toggle');
  const apiKeyInput = document.getElementById('api-key');
  const saveApiKeyButton = document.getElementById('save-api-key');
  const apiKeySetting = document.getElementById('api-key-setting');

  // Initialize toggles
  chrome.storage.local.get(['enableCleanup', 'enableLLM', 'apiKey'], (result) => {
    cleanupToggle.checked = result.enableCleanup || false;
    llmToggle.checked = result.enableLLM || false;
    apiKeyInput.value = result.apiKey || '';
    updateToggleVisually(cleanupToggle);
    updateToggleVisually(llmToggle);
    apiKeySetting.style.display = result.enableLLM ? 'block' : 'none';
  });

  cleanupToggle.addEventListener('change', () => {
    const isEnabled = cleanupToggle.checked;
    chrome.storage.local.set({ enableCleanup: isEnabled }, () => {
      console.log(`Content Cleanup ${isEnabled ? 'enabled' : 'disabled'}`);
      updateToggleVisually(cleanupToggle);
    });
  });

  llmToggle.addEventListener('change', () => {
    const isEnabled = llmToggle.checked;
    chrome.storage.local.set({ enableLLM: isEnabled }, () => {
      console.log(`LLM Refinement ${isEnabled ? 'enabled' : 'disabled'}`);
      updateToggleVisually(llmToggle);
      apiKeySetting.style.display = isEnabled ? 'block' : 'none';
    });
  });

  saveApiKeyButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    chrome.storage.local.set({ apiKey }, () => {
      console.log('API Key saved');
      alert('API Key saved successfully!');
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
