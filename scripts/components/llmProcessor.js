/**
 * Handles LLM processing for single and multiple tabs
 */

import { jsonToMarkdown } from "./markdownUtils.js";

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
    const { model, baseUrl } = await browser.storage.local.get([
      "model",
      "baseUrl",
    ]);

    // Show loading indicator
    if (tabId) {
      await browser.tabs.sendMessage(tabId, { command: "show-loading" });
    }

    const response = await callLLMAPI(markdown, prompt, apiKey, model, baseUrl);

    // Hide loading indicator
    if (tabId) {
      await browser.tabs.sendMessage(tabId, { command: "hide-loading" });
    }

    return response;
  } catch (error) {
    console.error("LLM processing failed:", {
      error: error.message,
      model: (await browser.storage.local.get(["model"])).model,
    });

    // Hide loading indicator in case of error (only if tabId is provided)
    if (tabId) {
      await browser.tabs.sendMessage(tabId, { command: "hide-loading" });
    }

    // Show detailed error message to user
    const errorMessage = error.message.includes("API error")
      ? `LLM API Error: ${error.message}`
      : error.message.includes("network") || error.message.includes("fetch")
      ? `Network Error: Unable to connect to LLM service. Check your internet connection.`
      : error.message.includes("API key")
      ? `Authentication Error: Invalid API key. Please check your settings.`
      : `LLM Processing Error: ${error.message}`;

    if (tabId) {
      await browser.tabs.sendMessage(tabId, {
        command: "show-notification",
        message: errorMessage,
        type: "error",
      });
    }
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
    // If prompt is empty, return null to trigger individual processing
    // regardless of whether Enter or Shift+Enter was used
    if (!prompt?.trim()) {
      return null;
    }

    const combinedContent = await combineTabsContent(tabs);
    const refinedContent = await refineMDWithLLM(
      combinedContent,
      prompt,
      apiKey,
      tabs[0].id
    );

    return {
      url: tabs[0].url,
      title: tabs[0].title,
      markdown: refinedContent,
      isBatchProcessed: true,
      batchInfo: {
        prompt,
        sources: tabs.map((tab) => ({
          url: tab.url,
          title: tab.title,
        })),
      },
      savedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Batch processing failed:", error.message);
    return null;
  }
}

// Private helper functions

async function combineTabsContent(tabs) {
  let combined = "";
  for (const tab of tabs) {
    try {
      const response = await browser.tabs.sendMessage(tab.id, {
        command: "convert-to-markdown",
        isFirstTab: false,
      });
      if (response && response.markdown) {
        combined += `\n\n## ${tab.title}\n<url>${tab.url}</url>\n\n${response.markdown}\n\n`;
      }
    } catch (error) {
      console.error("Error getting content from tab:", error.message);
    }
  }
  return combined.trim();
}

async function callLLMAPI(
  markdown,
  prompt,
  apiKey,
  model,
  baseUrl = "https://api.openai.com/v1/chat/completions"
) {
  if (!apiKey) {
    throw new Error("API key is required");
  }

  // Check content length to prevent token limit issues
  const contentLength = (prompt?.length || 0) + (markdown?.length || 0);
  if (contentLength > 50000) {
    console.warn("Content length may exceed token limits:", contentLength);
  }

  try {
    const requestBody = {
      model: model,
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant that refines and structures webpage content based on user prompts.",
        },
        {
          role: "user",
          content: `Refine the following markdown content based on this prompt: "${prompt}"\n\nContent:\n${markdown}`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "structure_content",
            description: "Structure the refined content",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                content: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["heading", "paragraph", "list", "code", "quote"],
                      },
                      content: {
                        oneOf: [
                          { type: "string" },
                          { type: "array", items: { type: "string" } },
                        ],
                      },
                      level: { type: "integer", minimum: 1, maximum: 6 },
                      language: { type: "string" },
                    },
                    required: ["type", "content"],
                  },
                },
              },
              required: ["title", "content"],
            },
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "structure_content" },
      },
    };

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`;

      if (response.statusText) {
        errorMessage += ` - ${response.statusText}`;
      }

      try {
        const errorData = await response.json();
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (parseError) {
        try {
          const responseText = await response.text();
          if (responseText) {
            errorMessage += ` - ${responseText.substring(0, 200)}`;
          }
        } catch (textError) {
          // Use status-based error message
        }
      }

      console.error("LLM API error:", errorMessage);
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      throw new Error("Invalid API response: no choices returned");
    }

    const message = data.choices[0].message;

    // Handle new tool calling format
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      if (toolCall.function && toolCall.function.name === "structure_content") {
        try {
          const refinedContent = JSON.parse(toolCall.function.arguments);
          return jsonToMarkdown(refinedContent);
        } catch (parseError) {
          console.error(
            "Failed to parse tool call arguments:",
            parseError.message
          );
          throw new Error("Invalid response format from LLM");
        }
      }
    }

    // Fallback: handle legacy function call format
    if (
      message.function_call &&
      message.function_call.name === "structure_content"
    ) {
      try {
        const refinedContent = JSON.parse(message.function_call.arguments);
        return jsonToMarkdown(refinedContent);
      } catch (parseError) {
        console.error(
          "Failed to parse function call arguments:",
          parseError.message
        );
        throw new Error("Invalid response format from LLM");
      }
    }

    // If no tool/function call, try to use the content directly
    if (message.content) {
      return message.content;
    }

    console.warn(
      "No tool/function call or content in response, returning original markdown"
    );
    return markdown; // Return original if processing fails
  } catch (fetchError) {
    if (
      fetchError.name === "TypeError" &&
      fetchError.message.includes("fetch")
    ) {
      throw new Error("Network error: Unable to connect to LLM service");
    }
    throw fetchError;
  }
}
