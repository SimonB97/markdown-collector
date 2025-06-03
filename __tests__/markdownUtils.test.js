import { jest } from "@jest/globals";
import {
  groupByDate,
  getCoreDomain,
  getTodayDate,
  generateMockData,
  jsonToMarkdown,
} from "../scripts/components/markdownUtils.js";

describe("markdownUtils", () => {
  describe("groupByDate", () => {
    it("should group markdown data by date", () => {
      const mockData = [
        { url: "https://example.com/1", title: "Page 1", markdown: "# Page 1", savedAt: "2023-12-01T10:00:00.000Z" },
        { url: "https://example.com/2", title: "Page 2", markdown: "# Page 2", savedAt: "2023-12-02T10:00:00.000Z" },
      ];

      const grouped = groupByDate(mockData);

      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped["2023-12-01"]).toHaveLength(1);
      expect(grouped["2023-12-02"]).toHaveLength(1);
    });

    it("should handle invalid dates", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
      const mockData = [
        { url: "https://example.com/invalid", title: "Invalid", markdown: "# Invalid", savedAt: "invalid-date" },
      ];

      const grouped = groupByDate(mockData);

      expect(grouped["Unknown Date"]).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("getCoreDomain", () => {
    it("should extract core domain from URLs", () => {
      expect(getCoreDomain("https://www.example.com/path")).toBe("example.com");
      expect(getCoreDomain("https://subdomain.example.org/page")).toBe("example.org");
    });

    it("should throw error for invalid URLs", () => {
      expect(() => getCoreDomain("not-a-url")).toThrow();
      expect(() => getCoreDomain("")).toThrow();
    });
  });

  describe("getTodayDate", () => {
    it("should return date in YYYY-MM-DD format", () => {
      const today = getTodayDate();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("generateMockData", () => {
    it("should generate array of mock data objects", () => {
      const mockData = generateMockData();
      expect(Array.isArray(mockData)).toBe(true);
      expect(mockData.length).toBeGreaterThan(0);
      
      // Verify each object has required properties
      mockData.forEach((item) => {
        expect(item).toHaveProperty("url");
        expect(item).toHaveProperty("title");
        expect(item).toHaveProperty("markdown");
        expect(item).toHaveProperty("isLoading");
        expect(item).toHaveProperty("savedAt");
        expect(item.isLoading).toBe(false);
        expect(() => new URL(item.url)).not.toThrow(); // Valid URL
        expect(new Date(item.savedAt)).toBeInstanceOf(Date); // Valid date
      });
    });
  });

  describe("jsonToMarkdown", () => {
    it("should convert JSON with title to markdown", () => {
      const json = { title: "Test Title", content: [] };
      const markdown = jsonToMarkdown(json);
      expect(markdown).toBe("# Test Title");
    });

    it("should convert JSON with basic content", () => {
      const json = {
        content: [{ type: "paragraph", content: "This is a paragraph." }]
      };
      const markdown = jsonToMarkdown(json);
      expect(markdown).toBe("This is a paragraph.");
    });

    it("should convert headings", () => {
      const json = {
        content: [{ type: "heading", level: 2, content: "Subtitle" }]
      };
      const markdown = jsonToMarkdown(json);
      expect(markdown).toBe("## Subtitle");
    });

    it("should convert lists", () => {
      const json = {
        content: [{ type: "list", content: ["Item 1", "Item 2"] }]
      };
      const markdown = jsonToMarkdown(json);
      expect(markdown).toBe("- Item 1\n- Item 2");
    });

    it("should convert code blocks", () => {
      const json = {
        content: [{ type: "code", language: "javascript", content: "console.log('hello');" }]
      };
      const markdown = jsonToMarkdown(json);
      expect(markdown).toBe("```javascript\nconsole.log('hello');\n```");
    });

    it("should handle empty or malformed content", () => {
      expect(jsonToMarkdown({})).toBe("");
      expect(jsonToMarkdown({ content: [] })).toBe("");
    });
  });
});
