/**
 * Handles LLM processing for single and multiple tabs
 */

import { jsonToMarkdown } from './markdownUtils.js';

/**
 * Process content with LLM refinement
 * @param {string} markdown - The markdown content to refine
 * @param {string} prompt - The refinement prompt
 * @param {string} apiKey - OpenAI API key
 * @param {number} tabId - ID of the tab being processed
 * @returns {Promise<string>} - Refined markdown content
 */
export async function refineMDWithLLM(markdown, prompt, apiKey, tabId) {
  try {
    const { model, baseUrl } = await browser.storage.local.get(['model', 'baseUrl']);
    
    // Show loading indicator
    await browser.tabs.sendMessage(tabId, { command: 'show-loading' });
    
    const response = await callLLMAPI(markdown, prompt, apiKey, model, baseUrl);
    
    // Hide loading indicator
    await browser.tabs.sendMessage(tabId, { command: 'hide-loading' });
    
    return response;
  } catch (error) {
    console.error('LLM processing error:', error);
    await browser.tabs.sendMessage(tabId, { 
      command: 'show-notification', 
      message: 'Error processing content', 
      type: 'error' 
    });
    return null;
  }
}

/**
 * Process multiple tabs as a batch
 * @param {Array} tabs - Array of tab objects
 * @param {string} prompt - The refinement prompt
 * @param {string} apiKey - OpenAI API key
 * @returns {Promise<Object>} - Combined and processed content
 */
export async function processBatchContent(tabs, prompt, apiKey) {
  try {
    const combinedContent = await combineTabsContent(tabs);
    const refinedContent = await refineMDWithLLM(combinedContent, prompt, apiKey, tabs[0].id);
    
    return {
      url: tabs[0].url,
      title: tabs[0].title,
      markdown: refinedContent,
      isBatchProcessed: true,
      batchInfo: {
        prompt,
        sources: tabs.map(tab => ({
          url: tab.url,
          title: tab.title
        }))
      },
      savedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Batch processing error:', error);
    return null;
  }
}

// Private helper functions

async function combineTabsContent(tabs) {
  let combined = '';
  for (const tab of tabs) {
    const response = await browser.tabs.sendMessage(tab.id, { 
      command: 'convert-to-markdown',
      isFirstTab: false 
    });
    if (response && response.markdown) {
      combined += `\n\n## ${tab.title}\n<url>${tab.url}</url>\n\n${response.markdown}\n\n`;
    }
  }
  return combined.trim();
}

async function callLLMAPI(markdown, prompt, apiKey, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1/chat/completions') {
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { 
          role: 'system', 
          content: 'You are an AI assistant that refines and structures webpage content based on user prompts.' 
        },
        { 
          role: 'user', 
          content: `Refine the following markdown content based on this prompt: "${prompt}"\n\nContent:\n${markdown}` 
        }
      ],
      functions: [{
        name: 'structure_content',
        description: 'Structure the refined content',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            content: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', enum: ['heading', 'paragraph', 'list', 'code', 'quote'] },
                  content: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
                  level: { type: 'integer', minimum: 1, maximum: 6 },
                  language: { type: 'string' }
                },
                required: ['type', 'content']
              }
            }
          },
          required: ['title', 'content']
        }
      }],
      function_call: { name: 'structure_content' }
    })
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const functionCall = data.choices[0].message.function_call;
  
  if (functionCall && functionCall.name === 'structure_content') {
    const refinedContent = JSON.parse(functionCall.arguments);
    return jsonToMarkdown(refinedContent);
  }
  
  return markdown; // Return original if processing fails
} 