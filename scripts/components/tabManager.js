/**
 * Handles tab selection and management functionality
 */
export async function getSelectedTabs() {
  try {
    // Get all tabs in current window
    const tabs = await browser.tabs.query({currentWindow: true, highlighted: true});
    return tabs;
  } catch (error) {
    console.error('Error getting selected tabs:', error);
    return [];
  }
}

/**
 * Checks if multiple tabs are selected
 */
export async function hasMultipleTabsSelected() {
  const tabs = await getSelectedTabs();
  return tabs.length > 1;
} 