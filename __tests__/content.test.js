import { jest } from "@jest/globals";

// Mock global browser API
global.browser = {
  runtime: { onMessage: { addListener: jest.fn() }, getURL: jest.fn((path) => `chrome-extension://test/${path}`) },
  storage: { local: { get: jest.fn() } },
};

// Mock global objects
global.Readability = jest.fn().mockImplementation(() => ({
  parse: jest.fn().mockReturnValue({ title: "Test Article", content: "<p>Test content</p>" }),
}));

global.TurndownService = jest.fn().mockImplementation(() => ({
  turndown: jest.fn().mockReturnValue("Test markdown content"),
}));

global.DOMParser = jest.fn().mockImplementation(() => ({
  parseFromString: jest.fn().mockReturnValue({
    documentElement: { outerHTML: "<html><body>Test</body></html>" },
  }),
}));

// Mock document
Object.defineProperty(global, "document", {
  value: {
    title: "Test Page Title",
    body: { innerHTML: "<p>Test body content</p>" },
    documentElement: { outerHTML: "<html><body>Test page content</body></html>" },
  },
  writable: true,
});

describe("content script functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    browser.storage.local.get.mockResolvedValue({ enableCleanup: false, enableLLM: false });
  });

  it("should convert page to markdown without cleanup", () => {
    const turndownService = new TurndownService();
    const title = document.title;
    const bodyHTML = document.body.innerHTML;
    const bodyMarkdown = turndownService.turndown(bodyHTML);
    const result = `# ${title}\n\n${bodyMarkdown}`;

    expect(result).toContain("# Test Page Title");
    expect(result).toContain("Test markdown content");
    expect(turndownService.turndown).toHaveBeenCalledWith("<p>Test body content</p>");
  });

  it("should convert page to markdown with Readability cleanup", () => {
    const doc = new DOMParser().parseFromString(document.documentElement.outerHTML, "text/html");
    const reader = new Readability(doc);
    const article = reader.parse();

    expect(article).toEqual({ title: "Test Article", content: "<p>Test content</p>" });
    expect(reader.parse).toHaveBeenCalled();

    if (article && article.content) {
      const turndownService = new TurndownService();
      const bodyMarkdown = turndownService.turndown(article.content);
      const result = `# ${article.title}\n\n${bodyMarkdown}`;

      expect(result).toContain("# Test Article");
      expect(result).toContain("Test markdown content");
      expect(turndownService.turndown).toHaveBeenCalledWith("<p>Test content</p>");
    }
  });

  it("should handle Readability parse errors", () => {
    // Mock Readability to return null (parse failed)
    global.Readability = jest.fn().mockImplementation(() => ({
      parse: jest.fn().mockReturnValue(null),
    }));

    const doc = new DOMParser().parseFromString(document.documentElement.outerHTML, "text/html");
    const reader = new Readability(doc);
    const article = reader.parse();

    expect(article).toBeNull();
    
    // Should fallback to regular conversion
    const turndownService = new TurndownService();
    const fallbackMarkdown = turndownService.turndown(document.body.innerHTML);
    
    expect(fallbackMarkdown).toBe("Test markdown content");
  });
});
