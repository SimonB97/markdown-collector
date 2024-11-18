/**
   * Groups markdown data by date.
   * @param {Array} markdownData - The markdown data array.
   * @returns {Object} - The grouped markdown data.
   */
export function groupByDate(markdownData) {
    const grouped = markdownData.reduce((acc, item) => {
      let date;
      try {
        // Use ISO date format for consistency
        date = new Date(item.savedAt).toISOString().slice(0, 10); // "YYYY-MM-DD"
        if (isNaN(new Date(item.savedAt))) {
          throw new Error("Invalid Date");
        }
      } catch (error) {
        console.warn(`Invalid savedAt for URL: ${item.url}. Using 'Unknown Date'.`);
        date = 'Unknown Date';
      }

      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(item);
      return acc;
    }, {});

    // Sort entries within each date group by savedAt in descending order
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    });

    return grouped;
}

/**
   * Extracts the core domain from a given URL.
   * @param {string} url - The URL to extract the core domain from.
   * @returns {string} - The core domain.
   */
export function getCoreDomain(url) {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.').slice(-2);
    return parts.join('.');
  }

/**
   * Retrieves today's date in ISO format (YYYY-MM-DD).
   * @returns {string} - Today's date as a string.
   */
export function getTodayDate() {
    const today = new Date();
    return today.toISOString().slice(0, 10); // "YYYY-MM-DD"
  }

/**
   * Generates mock markdown data for testing purposes.
   * @returns {Array} - An array of mock markdown data objects.
   */
export function generateMockData() {
    const now = new Date();
    const mockData = [
      {
        url: "https://example.com/page1",
        title: "Example Page 1",
        markdown: "## Example Markdown 1",
        isLoading: false,
        savedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
      },
      {
        url: "https://example.net/page4",
        title: "Example Page 4",
        markdown: "## Example Markdown 4",
        isLoading: false,
        savedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
      },
      {
        url: "https://example.com/page2",
        title: "Example Page 2",
        markdown: "## Example Markdown 2",
        isLoading: false,
        savedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() // 1 day ago
      },
      {
        url: "https://example.com/page3",
        title: "Example Page 3",
        markdown: "## Example Markdown 3",
        isLoading: false,
        savedAt: now.toISOString() // Today
      },
    ];

    return mockData;
  }

/**
   * Converts JSON data to markdown format.
   * @param {Object} json - The JSON data to convert to markdown.
   * @returns {string} - The converted markdown format.
   */
export function jsonToMarkdown(json) {
  let markdown = '';
  
  if (json.title) {
    markdown += `# ${json.title}\n\n`;
  }
  
  if (json.content && Array.isArray(json.content)) {
    json.content.forEach(item => {
      switch (item.type) {
        case 'heading':
          const level = item.level || 2;
          markdown += `${'#'.repeat(level)} ${item.content}\n\n`;
          break;
        case 'paragraph':
          markdown += `${item.content}\n\n`;
          break;
        case 'list':
          if (Array.isArray(item.content)) {
            item.content.forEach(listItem => {
              markdown += `- ${listItem}\n`;
            });
            markdown += '\n';
          }
          break;
        case 'code':
          if (item.language) {
            markdown += `\`\`\`${item.language}\n${item.content}\n\`\`\`\n\n`;
          } else {
            markdown += `\`\`\`\n${item.content}\n\`\`\`\n\n`;
          }
          break;
        case 'quote':
          markdown += `> ${item.content}\n\n`;
          break;
        default:
          markdown += `${item.content}\n\n`;
      }
    });
  }
  
  return markdown.trim();
}

/**
 * Analyzes URLs to determine if they're all subdomains of the main domain
 * @param {Array} urls - Array of URLs to analyze
 * @returns {Object} - Analysis result
 */
export function analyzeDomains(urls) {
  const domains = urls.map(url => {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    const mainDomain = parts.slice(-2).join('.');
    return {
      full: hostname,
      main: mainDomain
    };
  });

  const mainDomain = domains[0].main;
  const isAllSubdomains = domains.every(d => d.main === mainDomain);
  const uniqueMainDomains = new Set(domains.map(d => d.main));

  return {
    isAllSubdomains,
    count: isAllSubdomains ? domains.length : uniqueMainDomains.size,
    type: isAllSubdomains ? 'subdomains' : 'domains'
  };
}
