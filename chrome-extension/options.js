function setStatus(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (value) {
    el.textContent = '✓ Set';
    el.className = 'key-status set';
    const input = document.getElementById(id.replace('-status', '-key').replace('anthropic', 'anthropic').replace('tavily', 'tavily').replace('youtube', 'youtube'));
    if (input) input.classList.add('has-value');
  } else {
    if (id === 'youtube-status') {
      el.textContent = 'Not set — CEO themes will use defaults';
    } else {
      el.textContent = 'Not set';
    }
    el.className = 'key-status unset';
  }
}

// Load existing keys on page open
chrome.storage.local.get(['anthropicKey', 'tavilyKey', 'youtubeKey'], (data) => {
  if (data.anthropicKey) {
    document.getElementById('anthropic-key').value = data.anthropicKey;
    setStatus('anthropic-status', true);
  }
  if (data.tavilyKey) {
    document.getElementById('tavily-key').value = data.tavilyKey;
    setStatus('tavily-status', true);
  }
  if (data.youtubeKey) {
    document.getElementById('youtube-key').value = data.youtubeKey;
    setStatus('youtube-status', true);
  }
});

// Update status indicators live as user types
document.getElementById('anthropic-key').addEventListener('input', e => {
  setStatus('anthropic-status', e.target.value.trim().length > 0);
});
document.getElementById('tavily-key').addEventListener('input', e => {
  setStatus('tavily-status', e.target.value.trim().length > 0);
});
document.getElementById('youtube-key').addEventListener('input', e => {
  setStatus('youtube-status', e.target.value.trim().length > 0);
});

// Save
document.getElementById('btn-save').addEventListener('click', () => {
  const anthropicKey = document.getElementById('anthropic-key').value.trim();
  const tavilyKey = document.getElementById('tavily-key').value.trim();
  const youtubeKey = document.getElementById('youtube-key').value.trim();

  chrome.storage.local.set({ anthropicKey, tavilyKey, youtubeKey }, () => {
    const toast = document.getElementById('toast');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  });
});
