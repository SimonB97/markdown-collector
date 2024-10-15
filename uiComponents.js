export function createActionButton(text, color, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(`--${color}-button-background`).trim();
    button.style.color = 'white';
    button.style.border = '1px solid var(--button-border)';
    button.style.borderRadius = '3px';
    button.style.padding = '2px 5px';
    button.style.marginRight = '5px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '14px';
    button.style.transition = 'filter 0.2s ease';
    button.title = {
      '⎘': 'Copy',
      '↻': 'Update',
      '✕': 'Delete'
    }[text] || 'Action';
    
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
      
      // For copy button, change to checkmark
      if (text === '⎘') {
        const originalText = button.textContent;
        button.textContent = '✓';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    });
    
    button.addEventListener('mouseenter', () => {
      button.style.filter = 'brightness(115%)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.filter = 'brightness(100%)';
    });
    
    return button;
}

 // Function to show diff modal using jsdiff
export function showDiffModal(url, oldMarkdown, newMarkdown, callback) {
  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'diff-modal';

  // Close button for the entire modal
  const closeButton = document.createElement('button');
  closeButton.className = 'close-button';
  closeButton.innerHTML = '&times;';
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    callback(false);
    document.body.removeChild(modalOverlay);
  });

  modalOverlay.appendChild(closeButton);

  // Function to create a closable info box
  function createClosableInfoBox(className, content, storageKey) {
    const box = document.createElement('div');
    box.className = `info-box ${className}`;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'I understand!';
    closeBtn.className = 'info-box-close';
    closeBtn.addEventListener('click', () => {
      box.style.display = 'none';
      localStorage.setItem(storageKey, 'closed');
    });
    
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = content;
    box.appendChild(contentDiv);
    box.appendChild(closeBtn);
    
    if (localStorage.getItem(storageKey) === 'closed') {
      box.style.display = 'none';
    }
    
    return box;
  }

  // Beta notice box
  const betaNoticeBox = createClosableInfoBox(
    'beta-notice',
    `<p><strong>Notice:</strong> The update function is currently in beta. Due to cross-origin limitations, 
    website contents are fetched in XML format, which may introduce slight variations in how basic structural elements, 
    headers, or similar content are scraped. These differences are indicated in red or green in the diff below, 
    but are generally negligible.</p>`,
    'betaNoticeClosed'
  );
  modal.appendChild(betaNoticeBox);

  // Diff instructions box
  const diffInstructionsBox = createClosableInfoBox(
    'diff-instructions',
    `<p><strong>How to read the diff:</strong></p>
    <p><span style="color: green;">Green text</span> indicates content that has been added.</p>
    <p><span style="color: red;">Red text</span> indicates content that has been removed.</p>
    <p><span style="color: grey;">Grey text</span> indicates unchanged content.</p>
    <p>At the bottom of this diff, you'll find buttons to either accept or decline the changes.</p>`,
    'diffInstructionsClosed'
  );
  modal.appendChild(diffInstructionsBox);

  const diff = Diff.diffLines(oldMarkdown, newMarkdown);
  const fragment = document.createDocumentFragment();

  diff.forEach((part) => {
    const color = part.added ? 'green' :
      part.removed ? 'red' : 'grey';
    const span = document.createElement('span');
    span.style.color = color;
    span.appendChild(document.createTextNode(part.value));
    fragment.appendChild(span);
  });

  const diffContainer = document.createElement('div');
  diffContainer.appendChild(fragment);
  modal.appendChild(diffContainer);

  const acceptButton = document.createElement('button');
  acceptButton.textContent = 'Accept';
  acceptButton.style.backgroundColor = '#2E7D32';
  acceptButton.style.color = 'white';
  acceptButton.style.float = 'right';
  acceptButton.style.marginLeft = '10px';
  acceptButton.addEventListener('click', (e) => {
    e.stopPropagation();
    callback(true);
    document.body.removeChild(modalOverlay);
  });

  const declineButton = document.createElement('button');
  declineButton.textContent = 'Decline';
  declineButton.style.backgroundColor = '#8c0d0d';
  declineButton.style.color = 'white';
  declineButton.style.float = 'right';
  declineButton.addEventListener('click', (e) => {
    e.stopPropagation();
    callback(false);
    document.body.removeChild(modalOverlay);
  });

  const buttonContainer = document.createElement('div');
  buttonContainer.style.overflow = 'hidden';
  buttonContainer.appendChild(declineButton);
  buttonContainer.appendChild(acceptButton);

  modal.appendChild(acceptButton);
  modal.appendChild(declineButton);

  modalOverlay.appendChild(modal);

  // Close modal when clicking outside
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      callback(false);
      document.body.removeChild(modalOverlay);
    }
  });

  document.body.appendChild(modalOverlay);
}

export function setupTipBox(tipBox, understandButton) {
    understandButton.addEventListener('click', () => {
      tipBox.style.display = 'none';
      // Optionally, you can store this preference in local storage
      localStorage.setItem('tipBoxClosed', 'true');
    });

    // Check if the tip box should be hidden on page load
    if (localStorage.getItem('tipBoxClosed') === 'true') {
      tipBox.style.display = 'none';
    }
}