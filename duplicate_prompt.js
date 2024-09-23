document.addEventListener('DOMContentLoaded', () => {
    const overwriteBtn = document.getElementById('overwriteBtn');
    const createNewBtn = document.getElementById('createNewBtn');
  
    overwriteBtn.addEventListener('click', () => {
      browser.runtime.sendMessage({ action: "handleDuplicate", choice: "overwrite" });
      window.close();
    });
  
    createNewBtn.addEventListener('click', () => {
      browser.runtime.sendMessage({ action: "handleDuplicate", choice: "createNew" });
      window.close();
    });
  });