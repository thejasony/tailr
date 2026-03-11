function setStatus(value) {
  const el = document.getElementById('token-status');
  const input = document.getElementById('team-token');
  if (value) {
    el.textContent = '✓ Set';
    el.className = 'key-status set';
    input.classList.add('has-value');
  } else {
    el.textContent = 'Not set';
    el.className = 'key-status unset';
    input.classList.remove('has-value');
  }
}

// Load existing token on page open
chrome.storage.local.get(['teamToken'], (data) => {
  if (data.teamToken) {
    document.getElementById('team-token').value = data.teamToken;
    setStatus(true);
  }
});

// Update status live as user types
document.getElementById('team-token').addEventListener('input', e => {
  setStatus(e.target.value.trim().length > 0);
});

// Save
document.getElementById('btn-save').addEventListener('click', () => {
  const teamToken = document.getElementById('team-token').value.trim();
  chrome.storage.local.set({ teamToken }, () => {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  });
});
