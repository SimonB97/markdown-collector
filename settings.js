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
  const modelSelect = document.getElementById('model-select');
  const customModel = document.getElementById('custom-model');
  const baseUrlInput = document.getElementById('base-url');
  const saveBaseUrlButton = document.getElementById('save-base-url');
  const subSettingsContainer = document.querySelector('.sub-settings-container');

  // Initialize settings
  chrome.storage.local.get(['enableCleanup', 'enableLLM', 'apiKey', 'model', 'baseUrl'], (result) => {
    cleanupToggle.checked = result.enableCleanup || false;
    llmToggle.checked = result.enableLLM || false;
    apiKeyInput.value = result.apiKey || '';
    if (result.model && !['gpt-4o-mini', 'gpt-4o'].includes(result.model)) {
      modelSelect.value = 'custom';
      customModel.value = result.model;
    } else {
      modelSelect.value = result.model || 'gpt-4o-mini';
    }
    baseUrlInput.value = result.baseUrl || 'https://api.openai.com/v1/chat/completions';
    updateToggleVisually(cleanupToggle);
    updateToggleVisually(llmToggle);
    subSettingsContainer.style.display = result.enableLLM ? 'block' : 'none';
    updateModelInputVisibility();
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
      subSettingsContainer.style.display = isEnabled ? 'block' : 'none';
    });
  });

  modelSelect.addEventListener('change', () => {
    updateModelInputVisibility();
    saveModel();
  });

  customModel.addEventListener('input', saveModel);

  saveApiKeyButton.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    chrome.storage.local.set({ apiKey }, () => {
      console.log('API Key saved');
      alert('API Key saved successfully!');
    });
  });

  saveBaseUrlButton.addEventListener('click', () => {
    const baseUrl = baseUrlInput.value.trim();
    chrome.storage.local.set({ baseUrl }, () => {
      console.log('Base URL saved');
      alert('Base URL saved successfully!');
    });
  });

  function updateModelInputVisibility() {
    if (modelSelect.value === 'custom') {
      customModel.style.display = 'inline-block';
    } else {
      customModel.style.display = 'none';
    }
  }

  function saveModel() {
    let model;

    if (modelSelect.value === 'custom') {
      model = customModel.value.trim();
      if (!model) {
        model = 'gpt-4o-mini'; // Default if custom is empty
      }
    } else {
      model = modelSelect.value;
    }

    chrome.storage.local.set({ model }, () => {
      console.log('Model saved:', model);
    });
  }
});

// Function to update the toggle's visual state
function updateToggleVisually(toggle) {
  if (toggle.checked) {
    toggle.parentElement.classList.add('checked');
  } else {
    toggle.parentElement.classList.remove('checked');
  }
}
