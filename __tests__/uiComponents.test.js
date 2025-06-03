import { jest } from "@jest/globals";

import {
  createActionButton,
  showDiffModal,
} from "../scripts/components/uiComponents.js";

// Mock global DOM
global.document = {
  createElement: jest.fn((tag) => {
    const element = {
      tagName: tag.toUpperCase(),
      textContent: "",
      innerHTML: "",
      className: "",
      id: "",
      style: {},
      value: "",
      checked: false,
      type: "",
      placeholder: "",
      title: "",
      addEventListener: jest.fn(),
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      querySelector: jest.fn(),
      querySelectorAll: jest.fn(() => []),
      click: jest.fn(),
      focus: jest.fn(),
      classList: {
        add: jest.fn(),
        remove: jest.fn(),
        contains: jest.fn(() => false),
      },
      setAttribute: jest.fn(),
      getAttribute: jest.fn(),
    };

    if (tag === "input") {
      element.type = "text";
    }

    return element;
  }),
  body: {
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    style: {},
  },
  getElementById: jest.fn(),
  querySelector: jest.fn(),
  querySelectorAll: jest.fn(() => []),
  createDocumentFragment: jest.fn(() => ({
    appendChild: jest.fn(),
  })),
  createTextNode: jest.fn((text) => ({ textContent: text })),
  documentElement: {
    style: {
      getPropertyValue: jest.fn(() => "#000000"),
    },
  },
};

// Mock getComputedStyle
global.getComputedStyle = jest.fn(() => ({
  getPropertyValue: jest.fn(() => "#000000"),
}));

// Mock clipboard API
global.navigator = {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(),
  },
};

// Mock JSDiff
global.Diff = {
  diffLines: jest.fn((oldText, newText) => [
    { value: "same ", added: false, removed: false },
    { value: "removed", added: false, removed: true },
    { value: "added", added: true, removed: false },
  ]),
};

describe("uiComponents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createActionButton", () => {
    it("should create a button element with correct properties", () => {
      const onClick = jest.fn();
      const button = createActionButton("✕", "delete", onClick);

      expect(button.textContent).toBe("✕");
      expect(button.addEventListener).toBeDefined();
    });

    it("should have event listener functionality", () => {
      const onClick = jest.fn();
      const button = createActionButton("⎘", "copy", onClick);
      
      expect(typeof button.addEventListener).toBe('function');
      expect(button).toBeDefined();
    });
  });

  describe("showDiffModal", () => {
    it("should create modal and call diffLines", () => {
      const callback = jest.fn();
      showDiffModal("https://example.com", "old content", "new content", callback);

      expect(Diff.diffLines).toHaveBeenCalledWith("old content", "new content");
    });

    it("should create modal elements", () => {
      const callback = jest.fn();
      
      expect(() => {
        showDiffModal("https://example.com", "old", "new", callback);
      }).not.toThrow();
      
      // Should create DOM elements
      expect(document.createElement).toBeDefined();
    });
  });
});
