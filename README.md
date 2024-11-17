# Markdown Collector - Website to Markdown

A Firefox extension that helps you save web pages as Markdown and manage them efficiently. Perfect for sharing content with AI assistants like ChatGPT.

## Features

- **Quick Save & Copy:**

  - `Alt+I`: Save current page(s) as Markdown
  - `Alt+C`: Save and copy to clipboard
  - `Alt+M`: View your collection

- **Process Multiple Pages at Once:**

  1. Select multiple tabs (use Ctrl+Click)
  2. Press `Alt+I` or `Alt+C`
  3. Choose how to refine them with AI:
     - **Individual:** Apply the same refinement to each page separately (press Enter)
     - **Combined:** Merge all pages into one document and apply the same refinement prompt to the combined content (press Shift+Enter)

- **AI-Powered Refinement:**

  - Let AI help structure and clean up your content
  - Works with both single pages and multiple pages
  - Supports OpenAI and local AI models

- **Smart Features:**
  - Clean up page content automatically (remove ads, menus, etc.)
  - Search through your saved pages
  - Edit saved content directly
  - Track and review content changes

## Installation

**Get it from Firefox Add-ons: [Markdown Collector](https://addons.mozilla.org/de/firefox/addon/markdown-collector/)**

_For developers:_

1. Clone: `git clone https://github.com/simonb97/markdown-collector.git`
2. Load in Firefox:
   - Go to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select `manifest.json`

## Quick Start Guide

1. **Save Web Pages:**

   - Single page: Press `Alt+I` or `Alt+C`
   - Multiple pages:
     - Hold Ctrl and click on tabs you want to save
     - Press `Alt+I` or `Alt+C`
     - Choose to process them separately or combine them

2. **Use AI Refinement:**

   - Enable it in settings
   - Add your API key
   - When saving, type what you want the AI to do with the content
   - For multiple pages:
     - Press Enter: Apply to each page separately
     - Press Shift+Enter: Apply to all pages combined

3. **Manage Your Collection:**
   - Press `Alt+M` to see all saved pages
   - Edit content directly
   - Use the search box to find pages
   - Select multiple entries to:
     - Copy them together
     - Update their content
     - Delete them

## Keyboard Shortcuts

- **Save and Convert:** `Alt+I`
- **Save, Convert, and Copy:** `Alt+C`
- **Open Collection:** `Alt+M`
- **In Prompt Dialog:**
  - Enter: Process individually
  - Shift+Enter: Process as batch (when multiple tabs selected)
  - Esc: Cancel operation

_Shortcuts can be customized in Firefox Add-ons settings._

## Roadmap

See [Roadmap.md](Roadmap.md).

Changelog is at the end of [Roadmap.md](Roadmap.md).

## Contributing

Contributions are welcome! Whether it's reporting bugs, suggesting features, or submitting pull requests, your help is appreciated.

1. **Fork the Repository**
2. **Create a New Branch:**
   ```bash
   git checkout -b feature/YourFeature
   ```
3. **Commit Your Changes:**
   ```bash
   git commit -m "Add some feature"
   ```
4. **Push to the Branch:**
   ```bash
   git push origin feature/YourFeature
   ```
5. **Open a Pull Request**

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).

## Acknowledgments

- [Turndown](https://github.com/domchristie/turndown) for HTML to Markdown conversion.
- [JsDiff](https://github.com/kpdecker/jsdiff) for showing differences between Markdown texts.
- [Readability](https://github.com/mozilla/readability) for extracting the main content of a page.
<!-- - [OkapiBM25](https://github.com/FurkanToprak/OkapiBM25) for calculating the relevance of a page to a query (used in the search feature). -->
