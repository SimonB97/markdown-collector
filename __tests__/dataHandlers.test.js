import { jest } from "@jest/globals";

import {
  loadMarkdownData,
  updateEntry,
  deleteEntry,
  copyEntry,
  fetchAndConvertToMarkdown,
  searchMarkdownEntries,
} from "../scripts/components/dataHandlers.js";

// Mock global browser API
global.browser = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://test/${path}`),
    sendMessage: jest.fn(),
  },
};

// Mock global chrome API (for legacy support)
global.chrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://test/${path}`),
    sendMessage: jest.fn(),
  },
};

// Mock clipboard API
global.navigator = {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(),
  },
};

// Mock fetch
global.fetch = jest.fn();

// Mock DOM elements
global.document = {
  createElement: jest.fn(() => ({
    innerHTML: "",
    textContent: "",
    style: {},
    className: "",
    appendChild: jest.fn(),
    addEventListener: jest.fn(),
    querySelector: jest.fn(),
    querySelectorAll: jest.fn(() => []),
    dataset: {},
  })),
  head: {
    appendChild: jest.fn(),
  },
};

// Mock TurndownService
global.TurndownService = jest.fn().mockImplementation(() => ({
  turndown: jest.fn().mockReturnValue("# Converted Markdown"),
}));

// Mock Readability
global.Readability = jest.fn().mockImplementation(() => ({
  parse: jest.fn().mockReturnValue({
    title: "Parsed Title",
    content: "<p>Parsed content</p>",
  }),
}));

describe("dataHandlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("loadMarkdownData", () => {
    it("should load existing data", async () => {
      const mockData = [
        {
          url: "https://example.com/page1",
          title: "Page 1",
          markdown: "# Content 1",
          savedAt: "2023-12-01T10:00:00.000Z",
        },
      ];

      browser.storage.local.get.mockResolvedValue({ markdownData: mockData });

      const mockContainer = {
        innerHTML: "",
        appendChild: jest.fn(),
        querySelectorAll: jest.fn(() => []),
      };
      const mockOpenUrls = new Set();

      await loadMarkdownData(mockContainer, mockOpenUrls);

      expect(browser.storage.local.get).toHaveBeenCalledWith(["markdownData"]);
    });

    it("should generate mock data when no data exists", async () => {
      browser.storage.local.get.mockResolvedValue({ markdownData: null });
      browser.storage.local.set.mockResolvedValue();

      const mockContainer = { innerHTML: "", appendChild: jest.fn(), querySelectorAll: jest.fn(() => []) };
      const mockOpenUrls = new Set();

      await loadMarkdownData(mockContainer, mockOpenUrls);

      expect(browser.storage.local.set).toHaveBeenCalled();
    });
  });

  describe("deleteEntry", () => {
    it("should delete entry from storage", async () => {
      const testUrl = "https://example.com/test";
      const mockData = [
        { url: testUrl, title: "Test", markdown: "# Test", savedAt: "2023-12-01T10:00:00.000Z" },
        { url: "https://example.com/other", title: "Other", markdown: "# Other", savedAt: "2023-12-01T11:00:00.000Z" },
      ];

      browser.storage.local.get.mockResolvedValue({ markdownData: mockData });
      browser.storage.local.set.mockResolvedValue();

      await deleteEntry(testUrl);

      expect(browser.storage.local.get).toHaveBeenCalledWith(["markdownData"]);
      expect(browser.storage.local.set).toHaveBeenCalledWith({
        markdownData: [mockData[1]],
      });
    });
  });

  describe("copyEntry", () => {
    it("should copy entry to clipboard", async () => {
      const url = "https://example.com/test";
      const markdown = "# Test Content";

      // Mock navigator.clipboard for this test
      const originalClipboard = global.navigator.clipboard;
      global.navigator.clipboard = {
        writeText: jest.fn().mockResolvedValue()
      };

      await copyEntry(url, markdown);

      expect(global.navigator.clipboard.writeText).toHaveBeenCalledWith(
        `<url>${url}</url>\n${markdown}`
      );

      // Restore original
      global.navigator.clipboard = originalClipboard;
    });
  });

  describe("searchMarkdownEntries", () => {
    it("should filter entries by URL", () => {
      const mockData = [
        { url: "https://example.com/page1", title: "Test Page", markdown: "# Test", savedAt: "2023-12-01T10:00:00.000Z" },
        { url: "https://other.com/page2", title: "Other Page", markdown: "# Other", savedAt: "2023-12-01T11:00:00.000Z" },
      ];

      const filters = { searchUrl: true, searchTitle: false, searchContents: false };
      const results = searchMarkdownEntries(mockData, "example", filters);
      
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe("https://example.com/page1");
    });

    it("should filter entries by title", () => {
      const mockData = [
        { url: "https://example.com/page1", title: "Test Page", markdown: "# Test", savedAt: "2023-12-01T10:00:00.000Z" },
        { url: "https://other.com/page2", title: "Other Page", markdown: "# Other", savedAt: "2023-12-01T11:00:00.000Z" },
      ];

      const filters = { searchUrl: false, searchTitle: true, searchContents: false };
      const results = searchMarkdownEntries(mockData, "Test", filters);
      
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("Test Page");
    });

    it("should filter entries by content", () => {
      const mockData = [
        { url: "https://example.com/page1", title: "Page 1", markdown: "# Special Content", savedAt: "2023-12-01T10:00:00.000Z" },
        { url: "https://other.com/page2", title: "Page 2", markdown: "# Normal Content", savedAt: "2023-12-01T11:00:00.000Z" },
      ];

      const filters = { searchUrl: false, searchTitle: false, searchContents: true };
      const results = searchMarkdownEntries(mockData, "Special", filters);
      
      expect(results).toHaveLength(1);
      expect(results[0].markdown).toBe("# Special Content");
    });

    it("should return all entries for empty search query", () => {
      const mockData = [
        { url: "https://example.com/page1", title: "Test Page", markdown: "# Test", savedAt: "2023-12-01T10:00:00.000Z" },
      ];

      const filters = { searchUrl: true, searchTitle: true, searchContents: true };
      const results = searchMarkdownEntries(mockData, "", filters);
      
      expect(results).toEqual(mockData);
    });

    it("should handle malformed data gracefully", () => {
      const malformedData = [
        { url: "https://example.com" }, // missing other properties
        null,
        undefined,
      ];

      const filters = { searchUrl: true, searchTitle: true, searchContents: true };
      
      expect(() => {
        const results = searchMarkdownEntries(malformedData, "test", filters);
        expect(Array.isArray(results)).toBe(true);
      }).not.toThrow();
    });
  });

  describe("function existence", () => {
    it("should export all required functions", () => {
      expect(loadMarkdownData).toBeDefined();
      expect(updateEntry).toBeDefined();
      expect(deleteEntry).toBeDefined();
      expect(copyEntry).toBeDefined();
      expect(fetchAndConvertToMarkdown).toBeDefined();
      expect(searchMarkdownEntries).toBeDefined();
    });
  });
});
