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

document.addEventListener("DOMContentLoaded", async () => {
  const openMarkdownButton = document.getElementById("open-markdown");
  const copyMarkdownButton = document.getElementById("copy-markdown");
  const openSettingsButton = document.getElementById("open-settings");
  const statusMessage = document.getElementById("status-message");
  const infoButton = document.querySelector(
    '.utility-action[title="How to use"]'
  );
  const infoPanel = document.querySelector(".panel");

  // Define interface functions first
  function showNormalInterface() {
    document.getElementById("normal-interface").style.display = "block";
    document.getElementById("refinement-interface").classList.add("hidden");
  }

  function showRefinementInterface(pendingContent) {
    document.getElementById("normal-interface").style.display = "none";
    document.getElementById("refinement-interface").classList.remove("hidden");

    // Set up refinement interface handlers
    const promptTextarea = document.getElementById("refinement-prompt");
    const refineButton = document.getElementById("refine-content");
    const saveWithoutRefineButton = document.getElementById(
      "save-without-refine"
    );
    const cancelButton = document.getElementById("cancel-refinement");

    // Focus the textarea
    setTimeout(() => promptTextarea.focus(), 100);

    // Button state management functions
    function setButtonLoadingState(button, text, icon) {
      button.disabled = true;
      button.innerHTML = `
        <span class="button-icon">${icon}</span>
        <span class="button-text">${text}</span>
      `;
    }

    function setButtonSuccessState(button, text, icon) {
      button.innerHTML = `
        <span class="button-icon">${icon}</span>
        <span class="button-text">${text}</span>
      `;
    }

    function setButtonErrorState(button, text, icon) {
      button.innerHTML = `
        <span class="button-icon">${icon}</span>
        <span class="button-text">${text}</span>
      `;
    }

    function resetButtonState(button, text, icon) {
      button.disabled = false;
      button.innerHTML = `
        <span class="button-icon">${icon}</span>
        <span class="button-text">${text}</span>
      `;
    }

    // Handle refinement
    refineButton.addEventListener("click", async () => {
      const prompt = promptTextarea.value.trim();
      if (!prompt) {
        // If no prompt provided, automatically save without refinement
        setButtonLoadingState(refineButton, "Saving...", "⏳");
        saveWithoutRefineButton.disabled = true;
        cancelButton.disabled = true;

        try {
          const response = await browser.runtime.sendMessage({
            command: "process-refinement",
            prompt: "", // Empty prompt triggers save-without-refinement path
          });

          if (response.status === "success") {
            setButtonSuccessState(refineButton, "Saved!", "✅");
            showMessage("Content saved!", "success");
            setTimeout(() => window.close(), 1500);
          } else {
            setButtonErrorState(refineButton, "Failed", "❌");
            showMessage(response.message || "Failed to save content", "error");
            setTimeout(
              () => resetButtonState(refineButton, "Refine with AI", "✨"),
              2000
            );
          }
        } catch (error) {
          setButtonErrorState(refineButton, "Error", "❌");
          showMessage("Error saving content", "error");
          setTimeout(
            () => resetButtonState(refineButton, "Refine with AI", "✨"),
            2000
          );
        } finally {
          refineButton.disabled = false;
          saveWithoutRefineButton.disabled = false;
          cancelButton.disabled = false;
        }
        return;
      }

      // Set loading state for refinement
      setButtonLoadingState(refineButton, "Processing...", "⏳");
      saveWithoutRefineButton.disabled = true;
      cancelButton.disabled = true;

      try {
        const response = await browser.runtime.sendMessage({
          command: "process-refinement",
          prompt: prompt,
        });

        if (response.status === "success") {
          setButtonSuccessState(refineButton, "Refined!", "✅");
          showMessage("Content refined and saved!", "success");
          setTimeout(() => window.close(), 1500);
        } else {
          setButtonErrorState(refineButton, "Failed", "❌");
          showMessage(response.message || "Failed to refine content", "error");
          setTimeout(
            () => resetButtonState(refineButton, "Refine with AI", "✨"),
            2000
          );
        }
      } catch (error) {
        setButtonErrorState(refineButton, "Error", "❌");
        showMessage("Error processing refinement", "error");
        setTimeout(
          () => resetButtonState(refineButton, "Refine with AI", "✨"),
          2000
        );
      } finally {
        saveWithoutRefineButton.disabled = false;
        cancelButton.disabled = false;
      }
    });

    // Handle save without refinement
    saveWithoutRefineButton.addEventListener("click", async () => {
      // Set loading state
      setButtonLoadingState(saveWithoutRefineButton, "Saving...", "⏳");
      refineButton.disabled = true;
      cancelButton.disabled = true;

      try {
        const response = await browser.runtime.sendMessage({
          command: "process-refinement",
          prompt: "",
        });

        if (response.status === "success") {
          setButtonSuccessState(saveWithoutRefineButton, "Saved!", "✅");
          showMessage("Content saved!", "success");
          setTimeout(() => window.close(), 1500);
        } else {
          setButtonErrorState(saveWithoutRefineButton, "Failed", "❌");
          showMessage(response.message || "Failed to save content", "error");
          setTimeout(
            () => resetButtonState(saveWithoutRefineButton, "Save as-is", "💾"),
            2000
          );
        }
      } catch (error) {
        setButtonErrorState(saveWithoutRefineButton, "Error", "❌");
        showMessage("Error saving content", "error");
        setTimeout(
          () => resetButtonState(saveWithoutRefineButton, "Save as-is", "💾"),
          2000
        );
      } finally {
        refineButton.disabled = false;
        cancelButton.disabled = false;
      }
    });

    // Handle cancel
    cancelButton.addEventListener("click", async () => {
      await browser.runtime.sendMessage({
        command: "clear-pending-refinement",
      });
      window.close();
    });

    // Handle Enter key in textarea
    promptTextarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        refineButton.click();
      }
    });
  }

  function showMultiTabRefinementInterface(pendingContent) {
    console.log("Showing multi-tab refinement interface:", pendingContent);

    document.getElementById("normal-interface").style.display = "none";
    document.getElementById("refinement-interface").classList.remove("hidden");

    // Set up refinement interface handlers
    const promptTextarea = document.getElementById("refinement-prompt");
    const refineButton = document.getElementById("refine-content");
    const saveWithoutRefineButton = document.getElementById(
      "save-without-refine"
    );
    const cancelButton = document.getElementById("cancel-refinement");

    // Update interface for multi-tab
    const tabCount = pendingContent.tabCount || "Multiple";

    // Update refinement title
    const refinementTitle = document.querySelector("#refinement-interface h3");
    if (refinementTitle) {
      refinementTitle.textContent = `Refine ${tabCount} Tabs`;
    }

    // Update button texts for multi-tab
    refineButton.innerHTML = `
      <span class="button-icon">✨</span>
      <span class="button-text">Refine ${tabCount} Tabs</span>
    `;

    saveWithoutRefineButton.innerHTML = `
      <span class="button-icon">💾</span>
      <span class="button-text">Save ${tabCount} Tabs</span>
    `;

    // Update placeholder
    promptTextarea.placeholder = `Enter refinement instructions for all ${tabCount} tabs...`;

    // Focus the textarea
    setTimeout(() => promptTextarea.focus(), 100);

    // Button state management functions
    function setButtonLoadingState(button, text, icon) {
      button.disabled = true;
      button.innerHTML = `
        <span class="button-icon">${icon}</span>
        <span class="button-text">${text}</span>
      `;
    }

    function setButtonSuccessState(button, text, icon) {
      button.innerHTML = `
        <span class="button-icon">${icon}</span>
        <span class="button-text">${text}</span>
      `;
    }

    function setButtonErrorState(button, text, icon) {
      button.innerHTML = `
        <span class="button-icon">${icon}</span>
        <span class="button-text">${text}</span>
      `;
    }

    function resetButtonState(button, text, icon) {
      button.disabled = false;
      button.innerHTML = `
        <span class="button-icon">${icon}</span>
        <span class="button-text">${text}</span>
      `;
    }

    // Set up event handlers for multi-tab interface
    refineButton.addEventListener("click", async () => {
      const prompt = promptTextarea.value.trim();
      if (!prompt) {
        // If no prompt provided, automatically save without refinement
        setButtonLoadingState(refineButton, "Saving...", "⏳");
        refineButton.disabled = true;
        saveWithoutRefineButton.disabled = true;
        cancelButton.disabled = true;

        try {
          const response = await browser.runtime.sendMessage({
            command: "process-refinement",
            prompt: "", // Empty prompt triggers save-without-refinement path
          });

          if (response && response.status === "success") {
            setButtonSuccessState(refineButton, "Saved!", "✅");
            showMessage(
              response.message || "Content saved successfully",
              "success"
            );
            setTimeout(() => window.close(), 1500);
          } else {
            setButtonErrorState(refineButton, "Failed", "❌");
            showMessage(response?.message || "Failed to save content", "error");
            setTimeout(
              () =>
                resetButtonState(refineButton, `Refine ${tabCount} Tabs`, "✨"),
              2000
            );
          }
        } catch (error) {
          setButtonErrorState(refineButton, "Error", "❌");
          showMessage("Error saving content", "error");
          setTimeout(
            () =>
              resetButtonState(refineButton, `Refine ${tabCount} Tabs`, "✨"),
            2000
          );
        } finally {
          refineButton.disabled = false;
          saveWithoutRefineButton.disabled = false;
          cancelButton.disabled = false;
        }
        return;
      }

      setButtonLoadingState(refineButton, "Refining...", "⏳");
      refineButton.disabled = true;
      saveWithoutRefineButton.disabled = true;
      cancelButton.disabled = true;

      try {
        const response = await browser.runtime.sendMessage({
          command: "process-refinement",
          prompt: prompt,
        });

        if (response && response.status === "success") {
          setButtonSuccessState(refineButton, "Refined!", "✅");
          showMessage(
            response.message || "Content refined successfully",
            "success"
          );
          setTimeout(() => window.close(), 1500);
        } else {
          setButtonErrorState(refineButton, "Failed", "❌");
          showMessage(response?.message || "Failed to refine content", "error");
          setTimeout(
            () =>
              resetButtonState(refineButton, `Refine ${tabCount} Tabs`, "✨"),
            2000
          );
        }
      } catch (error) {
        setButtonErrorState(refineButton, "Error", "❌");
        showMessage("Error refining content", "error");
        setTimeout(
          () => resetButtonState(refineButton, `Refine ${tabCount} Tabs`, "✨"),
          2000
        );
      } finally {
        refineButton.disabled = false;
        saveWithoutRefineButton.disabled = false;
        cancelButton.disabled = false;
      }
    });

    // Handle save without refinement
    saveWithoutRefineButton.addEventListener("click", async () => {
      setButtonLoadingState(saveWithoutRefineButton, "Saving...", "⏳");
      saveWithoutRefineButton.disabled = true;
      refineButton.disabled = true;
      cancelButton.disabled = true;

      try {
        const response = await browser.runtime.sendMessage({
          command: "process-refinement",
          prompt: "", // Empty prompt triggers save-without-refinement path
        });

        if (response && response.status === "success") {
          setButtonSuccessState(saveWithoutRefineButton, "Saved!", "✅");
          showMessage(
            response.message || "Content saved successfully",
            "success"
          );
          setTimeout(() => window.close(), 1500);
        } else {
          setButtonErrorState(saveWithoutRefineButton, "Failed", "❌");
          showMessage(response?.message || "Failed to save content", "error");
          setTimeout(
            () =>
              resetButtonState(
                saveWithoutRefineButton,
                `Save ${tabCount} Tabs`,
                "💾"
              ),
            2000
          );
        }
      } catch (error) {
        setButtonErrorState(saveWithoutRefineButton, "Error", "❌");
        showMessage("Error saving content", "error");
        setTimeout(
          () =>
            resetButtonState(
              saveWithoutRefineButton,
              `Save ${tabCount} Tabs`,
              "💾"
            ),
          2000
        );
      } finally {
        refineButton.disabled = false;
        cancelButton.disabled = false;
      }
    });

    // Handle cancel
    cancelButton.addEventListener("click", async () => {
      await browser.runtime.sendMessage({
        command: "clear-pending-refinement",
      });
      window.close();
    });

    // Handle Enter key in textarea
    promptTextarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        refineButton.click();
      }
    });
  }

  // Check for pending refinement first
  console.log("Checking for pending refinement...");
  const response = await browser.runtime.sendMessage({
    command: "get-pending-refinement",
  });

  console.log("Pending refinement response:", response);

  if (response.pendingRefinement) {
    console.log("Found pending refinement, showing refinement interface");
    if (response.pendingRefinement.isMultiTab) {
      console.log("Multi-tab refinement detected");
      showMultiTabRefinementInterface(response.pendingRefinement);
    } else {
      console.log("Single-tab refinement detected");
      showRefinementInterface(response.pendingRefinement);
    }
    return;
  }

  // Show normal interface
  console.log("No pending refinement, showing normal interface");
  showNormalInterface();

  // Initialize button labels with new structure
  if (openMarkdownButton) {
    openMarkdownButton.innerHTML = `
      <span class="action-icon">📁</span>
      <span class="action-text">Open Collection</span>
      <span class="action-hint">Alt+M</span>
    `;
  }

  if (copyMarkdownButton) {
    copyMarkdownButton.innerHTML = `
      <span class="action-icon">📋</span>
      <span class="action-text">Copy as Markdown</span>
      <span class="action-hint">Alt+C</span>
    `;
  }

  openMarkdownButton.addEventListener("click", () => {
    browser.runtime.sendMessage(
      { command: "open-markdown-page" },
      (response) => {
        // Handle response if needed
      }
    );
  });

  copyMarkdownButton.addEventListener("click", async () => {
    try {
      // Set loading state
      copyMarkdownButton.innerHTML = `
        <span class="action-icon">⏳</span>
        <span class="action-text">Processing...</span>
        <span class="action-hint">Alt+C</span>
      `;
      copyMarkdownButton.disabled = true;

      // Use the correct copy-as-markdown command
      const response = await browser.runtime.sendMessage({
        command: "copy-as-markdown",
      });

      if (response && response.status === "success") {
        // Content was copied successfully
        copyMarkdownButton.innerHTML = `
          <span class="action-icon">✅</span>
          <span class="action-text">Copied!</span>
          <span class="action-hint">Alt+C</span>
        `;
        showMessage("Content copied to clipboard!", "success");
        setTimeout(() => {
          copyMarkdownButton.innerHTML = `
            <span class="action-icon">📋</span>
            <span class="action-text">Copy as Markdown</span>
            <span class="action-hint">Alt+C</span>
          `;
          copyMarkdownButton.disabled = false;
        }, 1500);
      } else if (response && response.status === "pending-refinement") {
        // Content is ready for refinement - switch to refinement interface
        showMessage("Content ready for refinement!", "success");

        // Check for pending refinement and switch interface
        const pendingResponse = await browser.runtime.sendMessage({
          command: "get-pending-refinement",
        });

        if (pendingResponse.pendingRefinement) {
          showRefinementInterface(pendingResponse.pendingRefinement);
        }
      } else {
        // Handle error
        copyMarkdownButton.innerHTML = `
          <span class="action-icon">❌</span>
          <span class="action-text">Failed</span>
          <span class="action-hint">Alt+C</span>
        `;
        showMessage(response?.message || "Failed to process content", "error");
        setTimeout(() => {
          copyMarkdownButton.innerHTML = `
            <span class="action-icon">📋</span>
            <span class="action-text">Copy as Markdown</span>
            <span class="action-hint">Alt+C</span>
          `;
          copyMarkdownButton.disabled = false;
        }, 2000);
      }
    } catch (error) {
      console.error("Error in copy markdown:", error);
      copyMarkdownButton.innerHTML = `
        <span class="action-icon">❌</span>
        <span class="action-text">Error</span>
        <span class="action-hint">Alt+C</span>
      `;
      showMessage("Error processing content", "error");
      setTimeout(() => {
        copyMarkdownButton.innerHTML = `
          <span class="action-icon">📋</span>
          <span class="action-text">Copy as Markdown</span>
          <span class="action-hint">Alt+C</span>
        `;
        copyMarkdownButton.disabled = false;
      }, 2000);
    }
  });

  openSettingsButton.addEventListener("click", () => {
    browser.runtime.sendMessage({ command: "open-settings" });
  });

  function showMessage(message, type = "info") {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = "block";
    setTimeout(() => {
      statusMessage.style.display = "none";
      statusMessage.className = "status-message";
    }, 3000);
  }

  // Add info panel toggle functionality
  if (infoButton && infoPanel) {
    infoButton.addEventListener("click", () => {
      infoPanel.classList.toggle("hidden");
    });
  }
});
