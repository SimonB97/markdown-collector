import { jest } from '@jest/globals';
import { 
    createActionButton, 
    showDiffModal, 
    setupTipBox, 
    createSearchBox, 
    displaySearchResults,
    createCheckbox,
    createCheckboxes,
    filterSearchResults,
    sortSearchResults
  } from '../scripts/components/uiComponents.js';
  
  // Mock the Diff object used in showDiffModal
  global.Diff = {
    diffLines: jest.fn((oldText, newText) => [
      { added: false, removed: false, value: oldText },
      { added: true, removed: false, value: newText }
    ])
  };
  
  // Mock the document and localStorage
  document.body.innerHTML = '<div id="container"></div>';
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    clear: jest.fn()
  };
  global.localStorage = localStorageMock;
  
  describe('UI Components', () => {
    describe('createActionButton', () => {
      it('creates a button with correct text and color', () => {
        // Mock the getComputedStyle method
        document.documentElement.style.setProperty('--red-button-background', 'rgb(255, 0, 0)');
        const getComputedStyleMock = jest.spyOn(window, 'getComputedStyle').mockReturnValue({
          getPropertyValue: jest.fn().mockReturnValue('rgb(255, 0, 0)')
        });

        const button = createActionButton('Test', 'red', jest.fn());
        expect(button.textContent).toBe('Test');
        expect(button.style.backgroundColor).toBe('rgb(255, 0, 0)');

        getComputedStyleMock.mockRestore();
      });
  
      it('calls onClick function when clicked', () => {
        const mockOnClick = jest.fn();
        const button = createActionButton('Test', 'blue', mockOnClick);
        button.click();
        expect(mockOnClick).toHaveBeenCalled();
      });
  
      it('changes copy button text temporarily when clicked', () => {
        jest.useFakeTimers();
        const button = createActionButton('⎘', 'green', jest.fn());
        button.click();
        expect(button.textContent).toBe('✓');
        jest.advanceTimersByTime(2000);
        expect(button.textContent).toBe('⎘');
        jest.useRealTimers();
      });
    });
  
    describe('showDiffModal', () => {
      it('creates a modal with diff content', () => {
        showDiffModal('http://example.com', 'old content', 'new content', jest.fn());
        expect(document.querySelector('.diff-modal')).toBeTruthy();
      });
  
      it('calls callback with true when accept button is clicked', async () => {
        jest.useFakeTimers();
        const mockCallback = jest.fn();
        const modal = showDiffModal('http://example.com', 'old', 'new', mockCallback);
        
        // Ensure the modal is in the document
        expect(document.body.contains(modal)).toBe(true);
    
        // Find the accept button within the modal
        const acceptButton = modal.querySelector('.accept-button');
        expect(acceptButton).not.toBeNull();
    
        // Simulate a click on the accept button
        acceptButton.click();
    
        // Run all timers and microtasks
        jest.runAllTimers();
        await Promise.resolve();
    
        expect(mockCallback).toHaveBeenCalledWith(true);
        expect(document.body.contains(modal)).toBe(false);
    
        jest.useRealTimers();
      });
    });
  
    describe('setupTipBox', () => {
      it('hides tip box when understand button is clicked', () => {
        const tipBox = document.createElement('div');
        const understandButton = document.createElement('button');
        const setItemMock = jest.spyOn(Storage.prototype, 'setItem');
        
        setupTipBox(tipBox, understandButton);
        understandButton.click();
        
        expect(tipBox.style.display).toBe('none');
        expect(setItemMock).toHaveBeenCalledWith('tipBoxClosed', 'true');
        
        setItemMock.mockRestore();
      });
    });
  
    describe('createSearchBox', () => {
      it('creates a search box with correct attributes', () => {
        const searchBox = createSearchBox();
        expect(searchBox.type).toBe('text');
        expect(searchBox.id).toBe('search-box');
        expect(searchBox.placeholder).toBe('Search...');
      });
    });
  
    describe('displaySearchResults', () => {
      it('displays search results correctly', () => {
        const container = document.createElement('div');
        const results = [{ title: 'Result 1' }, { title: 'Result 2' }];
        displaySearchResults(container, results);
        expect(container.children.length).toBe(2);
        expect(container.firstChild.textContent).toBe('Result 1');
      });
  
      it('displays "No results found" when results are empty', () => {
        const container = document.createElement('div');
        displaySearchResults(container, []);
        expect(container.textContent).toBe('No results found.');
      });
    });
  
    describe('createCheckbox', () => {
      it('creates a checkbox with correct attributes', () => {
        const checkboxContainer = createCheckbox('test-id', 'Test Label', true);
        const checkbox = checkboxContainer.querySelector('input[type="checkbox"]');
        expect(checkbox.id).toBe('test-id');
        expect(checkbox.checked).toBe(true);
        expect(checkboxContainer.textContent).toBe('Test Label');
      });
    });
  
    describe('createCheckboxes', () => {
      it('creates three checkboxes for URL, Title, and Contents', () => {
        const checkboxesContainer = createCheckboxes();
        expect(checkboxesContainer.querySelectorAll('input[type="checkbox"]').length).toBe(3);
        expect(checkboxesContainer.textContent).toContain('URL');
        expect(checkboxesContainer.textContent).toContain('Title');
        expect(checkboxesContainer.textContent).toContain('Contents');
      });
    });
  
    describe('filterSearchResults', () => {
      const testResults = [
        { url: 'http://example.com', title: 'Example', contents: 'This is an example' },
        { url: 'http://test.com', title: 'Test', contents: 'This is a test' }
      ];
  
      it('filters results based on URL', () => {
        const filtered = filterSearchResults(testResults, 'example', { searchUrl: true, searchTitle: false, searchContents: false });
        expect(filtered.length).toBe(1);
        expect(filtered[0].url).toBe('http://example.com');
      });
  
      it('filters results based on title', () => {
        const filtered = filterSearchResults(testResults, 'test', { searchUrl: false, searchTitle: true, searchContents: false });
        expect(filtered.length).toBe(1);
        expect(filtered[0].title).toBe('Test');
      });
  
      it('filters results based on contents', () => {
        const filtered = filterSearchResults(testResults, 'an example', { searchUrl: false, searchTitle: false, searchContents: true });
        expect(filtered.length).toBe(1);
        expect(filtered[0].contents).toBe('This is an example');
      });
    });
  
    describe('sortSearchResults', () => {
      const testResults = [
        { title: 'B', date: '2023-01-02' },
        { title: 'A', date: '2023-01-01' },
        { title: 'C', date: '2023-01-03' }
      ];
  
      it('sorts results by date', () => {
        const sorted = sortSearchResults(testResults, 'date');
        expect(sorted[0].date).toBe('2023-01-03');
        expect(sorted[2].date).toBe('2023-01-01');
      });
  
      it('sorts results by title', () => {
        const sorted = sortSearchResults(testResults, 'title');
        expect(sorted[0].title).toBe('A');
        expect(sorted[2].title).toBe('C');
      });
    });
  });
