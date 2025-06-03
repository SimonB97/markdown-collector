import { jest } from "@jest/globals";
import {
  getSelectedTabs,
  hasMultipleTabsSelected,
} from "../scripts/components/tabManager.js";

// Mock the browser API
global.browser = {
  tabs: {
    query: jest.fn(),
  },
};

describe("tabManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSelectedTabs", () => {
    it("should return selected tabs from browser API", async () => {
      const mockTabs = [
        { id: 1, url: "https://example.com", title: "Example Page", highlighted: true },
        { id: 2, url: "https://test.com", title: "Test Page", highlighted: true },
      ];

      browser.tabs.query.mockResolvedValue(mockTabs);

      const result = await getSelectedTabs();

      expect(browser.tabs.query).toHaveBeenCalledWith({
        currentWindow: true,
        highlighted: true,
      });
      expect(result).toEqual(mockTabs);
    });

    it("should handle errors gracefully", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      browser.tabs.query.mockRejectedValue(new Error("Browser API error"));

      const result = await getSelectedTabs();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("hasMultipleTabsSelected", () => {
    it("should return true when multiple tabs are selected", async () => {
      browser.tabs.query.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await hasMultipleTabsSelected();

      expect(result).toBe(true);
    });

    it("should return false when one or no tabs are selected", async () => {
      // Test one tab
      browser.tabs.query.mockResolvedValueOnce([{ id: 1 }]);
      let result = await hasMultipleTabsSelected();
      expect(result).toBe(false);

      // Test zero tabs
      browser.tabs.query.mockResolvedValueOnce([]);
      result = await hasMultipleTabsSelected();
      expect(result).toBe(false);
    });
  });
});
