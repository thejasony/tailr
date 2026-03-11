// ─── Proxy config ─────────────────────────────────────────────────────────────

// Change this to your deployed proxy URL (e.g. https://tailr-proxy.fly.dev)
const PROXY_BASE = 'http://localhost:8080';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  profileText: '',
  profile: { fullName: '', currentTitle: '', currentCompany: '', currentLocation: '' },
  locationOption: 'exclude',
  result: null,
};

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setStep(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `progress-step ${status}`;
  const icon = el.querySelector('.step-icon');
  if (status === 'done') icon.textContent = '✓';
  else if (status === 'active') icon.textContent = '●';
  else icon.textContent = '○';
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function getKeys() {
  return new Promise(resolve => {
    chrome.storage.local.get(['teamToken'], resolve);
  });
}

// ─── API: Anthropic (via proxy) ───────────────────────────────────────────────

async function callClaude({ system, user, maxTokens = 512 }) {
  const { teamToken } = await getKeys();
  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: user }],
  };
  if (system) body.system = system;

  const res = await fetch(`${PROXY_BASE}/api/proxy/anthropic/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'X-Team-Token': teamToken || '',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Proxy error ${res.status}`);
  }
  const data = await res.json();
  return data.content[0].text;
}

async function claudeJson(prompt, maxTokens = 512) {
  const raw = await callClaude({ user: prompt, maxTokens });
  return raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
}

// ─── API: Tavily (via proxy) ──────────────────────────────────────────────────

async function tavilySearch(query) {
  const { teamToken } = await getKeys();
  const res = await fetch(`${PROXY_BASE}/api/proxy/tavily/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Team-Token': teamToken || '',
    },
    // Note: no api_key here — the proxy injects it server-side
    body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
  });
  if (!res.ok) return '';
  const data = await res.json();
  return (data.results || [])
    .map(r => `Title: ${r.title || ''}\n${r.content || ''}`)
    .join('\n\n')
    .slice(0, 4000);
}

// ─── API: YouTube (via proxy) ─────────────────────────────────────────────────

async function youtubeSearch(query) {
  const { teamToken } = await getKeys();
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    maxResults: '3',
    type: 'video',
    // Note: no key= here — the proxy appends it server-side
  });
  const res = await fetch(`${PROXY_BASE}/api/proxy/youtube/search?${params}`, {
    headers: { 'X-Team-Token': teamToken || '' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items || []).map(item => ({
    title: item.snippet?.title || '',
    description: item.snippet?.description || '',
  }));
}

// ─── Research helpers ─────────────────────────────────────────────────────────

async function extractNegativeThemes(company, text) {
  if (!text.trim()) return [];
  const cleaned = await claudeJson(`You are analyzing employee review data for "${company}" from Glassdoor and Blind.
Extract the top 3-5 recurring NEGATIVE themes employees mention.
Return ONLY a JSON array of short theme strings (1-2 sentences each).

Text:
${text.slice(0, 3000)}`);
  try { return JSON.parse(cleaned); } catch { return []; }
}

async function extractCompanySize(company, text) {
  if (!text.trim()) return { raw: 'Unknown size', category: 'mid' };
  const cleaned = await claudeJson(`Based on this text about "${company}", estimate headcount.
Return ONLY JSON: { "headcount": number_or_null, "description": "brief size description" }

Text:
${text.slice(0, 2000)}`);
  try {
    const p = JSON.parse(cleaned);
    const n = p.headcount;
    let category = 'mid';
    if (n === null) category = 'mid';
    else if (n >= 5000) category = 'large';
    else if (n >= 1000) category = 'mid-large';
    else if (n >= 500) category = 'mid';
    else category = 'small';
    return { raw: p.description || `~${n} employees`, category };
  } catch { return { raw: 'Unknown size', category: 'mid' }; }
}

async function extractAppliedFacts(text) {
  const base = [
    'Raised $600M Series F in June 2025 at a $15B valuation, co-led by BlackRock and Kleiner Perkins',
    'Valuation more than doubled in 12 months (from $6B to $15B)',
    'Approximately 1,300 employees',
    'IPO trajectory being considered',
    'Operates across Automotive, Defense, Trucking, and Construction/Mining verticals',
  ];
  if (!text.trim()) return base;
  const cleaned = await claudeJson(`Given this news about Applied Intuition, extract any NEW notable facts not already in this list:
${base.map(f => `- ${f}`).join('\n')}

News text:
${text.slice(0, 2000)}

Return ONLY a JSON array of new fact strings. If none, return [].`);
  try {
    const extra = JSON.parse(cleaned);
    return [...base, ...extra];
  } catch { return base; }
}

async function extractCeoThemes(videos) {
  if (!videos.length) {
    return [
      'Radical pragmatism — focus on what actually works, not what sounds good',
      'Intrinsic contrarianism — deliberately challenges conventional thinking',
      'Impact-driven culture — employees are expected to own outcomes, not just tasks',
      'People-first mentality — hiring exceptional people and trusting them deeply',
    ];
  }
  const videoText = videos.map(v => `Title: ${v.title}\nDescription: ${v.description}`).join('\n\n');
  const cleaned = await claudeJson(`Based on these YouTube videos featuring Qasar Younis (CEO of Applied Intuition), extract key cultural and leadership themes.
Return ONLY a JSON array of 3-5 theme strings (1-2 sentences each).

Videos:
${videoText}`);
  try { return JSON.parse(cleaned); } catch { return []; }
}

// ─── Title category ───────────────────────────────────────────────────────────

function getTitleCategory(title) {
  const t = title.toLowerCase();
  if (/(chief people|chro|vp people|head of hr|people ops|hr director|talent)/i.test(t)) return 'hr_exec';
  if (/(engineer|software|ml|machine learning|ai|data scientist|developer|backend|frontend|fullstack|platform|infra)/i.test(t)) return 'engineer';
  if (/(sales|revenue|gtm|go.to.market|business development|account exec|ae |sdr|bdr)/i.test(t)) return 'sales';
  if (/(product manager|pm |program manager|product lead|vp product|cpo|head of product)/i.test(t)) return 'product';
  return 'general';
}

// ─── Message generation ───────────────────────────────────────────────────────

async function generateMessage(profile, locationOption, research) {
  const { fullName, currentTitle, currentCompany, currentLocation } = profile;
  const { glassdoorThemes, companySizeCategory, appliedIntuitionFacts, ceoThemes } = research;
  const titleCategory = getTitleCategory(currentTitle);

  const sizeAngles = {
    large: `Lead with impact and ownership. The candidate is at a large company (${currentCompany}). Reference—without naming Glassdoor—the frustration about slow promotion cycles and difficulty seeing direct impact. Position Applied Intuition as lean enough that work ships fast and people notice.`,
    'mid-large': `Lead with growth trajectory. The candidate is at a mid-large company of similar scale. Reference Applied doubling valuation in one year ($6B → $15B). Challenge them: are they seeing this kind of momentum where they are?`,
    mid: `Lead with growth trajectory and breadth. Position Applied Intuition as a rare company at this scale that is growing exponentially AND operating across multiple industries (Automotive, Defense, Trucking, Construction/Mining).`,
    small: `Lead with breadth of work and industry exposure. The candidate is at a small company with likely deep specialization. Applied spans Automotive, Defense, Trucking, and Construction/Mining — engineers here say they've never learned faster.`,
  };

  const titleAngles = {
    hr_exec: 'Focus heavily on Applied Intuition\'s culture and financial health. Highlight valuation growth, caliber of investors (BlackRock, Kleiner Perkins), IPO trajectory, and Qasar\'s publicly stated values around building a people-first, high-ownership culture.',
    engineer: 'Focus on technical scope, product breadth across 4 industries, and the speed at which engineers ship. Highlight the rare opportunity to work on autonomy across Automotive, Defense, Trucking, and Construction.',
    sales: 'Focus on revenue growth, expansion into new markets (Defense, Trucking, Construction/Mining), and the IPO opportunity to participate in the upside.',
    product: 'Focus on how Applied\'s multiple industries create unique, high-stakes product problems at scale that PMs rarely get access to.',
    general: 'Focus on growth momentum, culture, and the unique opportunity to work on AI for physical autonomy across multiple high-stakes industries.',
  };

  const locationInstruction = locationOption === 'exclude'
    ? 'Do NOT mention the candidate\'s location or office location in the message.'
    : 'Include this exact line naturally: "I couldn\'t find your exact location from LinkedIn, but this role is based in Sunnyvale, CA — wanted to be upfront about that."';

  const system = `You are a recruiter at Applied Intuition writing a personalized outreach message to a candidate on LinkedIn.
Write in first person, warm but direct, no corporate jargon, no bullet points, no em-dashes. Plain conversational prose. 150-200 words total.
The message must: address candidate by first name, use the size-based lead angle, incorporate title-based personalization, weave in at least 2 Applied Intuition facts, subtly reference 1-2 CEO cultural themes, address location as instructed, end with a soft specific call to action.
Do NOT mention Glassdoor or Blind by name.
Output ONLY the message text. No subject line. No "Hi [Name]," header. Start directly with the opener.`;

  const user = `Candidate: ${fullName}, ${currentTitle} at ${currentCompany}, ${currentLocation || 'unknown location'}

Size angle (${companySizeCategory}):
${sizeAngles[companySizeCategory] || sizeAngles.mid}

Title angle (${titleCategory}):
${titleAngles[titleCategory] || titleAngles.general}

Applied Intuition facts:
${appliedIntuitionFacts.map(f => `- ${f}`).join('\n')}

CEO cultural themes:
${ceoThemes.map(t => `- ${t}`).join('\n')}

Employee sentiment at ${currentCompany} (use as implicit contrast, never cite the source):
${glassdoorThemes.length ? glassdoorThemes.map(t => `- ${t}`).join('\n') : '- Use general frustrations appropriate to this company size'}

Location instruction: ${locationInstruction}`;

  return callClaude({ system, user, maxTokens: 400 });
}

// ─── Vague detection ──────────────────────────────────────────────────────────

const VAGUE_LOCS = ['united states', 'us', 'usa', 'canada', 'remote', 'worldwide', 'global', 'north america', 'europe', 'asia'];
function isVagueLocation(loc) {
  return VAGUE_LOCS.includes((loc || '').toLowerCase().trim());
}
function isVagueCompany(co) {
  const v = (co || '').toLowerCase().trim();
  return v.length < 2 || ['company', 'confidential', 'n/a', ''].includes(v);
}

// ─── Populate form ────────────────────────────────────────────────────────────

function populateForm(profile) {
  document.getElementById('f-name').value = profile.fullName || '';
  document.getElementById('f-title').value = profile.currentTitle || '';
  document.getElementById('f-company').value = profile.currentCompany || '';
  document.getElementById('f-location').value = profile.currentLocation || '';

  const vagueLocation = isVagueLocation(profile.currentLocation);
  const vagueCompany = isVagueCompany(profile.currentCompany);

  document.getElementById('f-location').classList.toggle('vague', vagueLocation);
  document.getElementById('warn-location').style.display = vagueLocation ? 'flex' : 'none';
  document.getElementById('location-options').style.display = vagueLocation ? 'block' : 'none';

  document.getElementById('f-company').classList.toggle('vague', vagueCompany);
  document.getElementById('warn-company').style.display = vagueCompany ? 'flex' : 'none';
}

function readForm() {
  return {
    fullName: document.getElementById('f-name').value.trim(),
    currentTitle: document.getElementById('f-title').value.trim(),
    currentCompany: document.getElementById('f-company').value.trim(),
    currentLocation: document.getElementById('f-location').value.trim(),
  };
}

function readLocationOption() {
  const checked = document.querySelector('input[name="location-opt"]:checked');
  return checked ? checked.value : 'exclude';
}

// ─── Render output ────────────────────────────────────────────────────────────

function renderOutput(result) {
  document.getElementById('message-text').textContent = result.message;
  const words = result.message.split(/\s+/).filter(Boolean).length;
  document.getElementById('output-meta').textContent = `${words} words · ${result.message.length} characters`;

  const panel = document.getElementById('research-panel');
  const r = result.research;

  const sizeLabels = {
    large: 'Large (5,000+)',
    'mid-large': 'Mid-Large (1,000–5,000)',
    mid: 'Mid (500–1,000)',
    small: 'Small (under 500)',
  };

  panel.innerHTML = `
    <div class="research-block">
      <div class="research-block-title">
        <span class="badge badge-blue">${sizeLabels[r.companySizeCategory] || r.companySizeCategory}</span>
        Company Size
      </div>
      <div class="research-item">${r.companySize}</div>
    </div>

    <div class="research-block">
      <div class="research-block-title">
        <span class="badge badge-amber">Internal only</span>
        Employee Sentiment Themes
      </div>
      ${r.glassdoorThemes.length
        ? r.glassdoorThemes.map(t => `<div class="research-item">${t}</div>`).join('')
        : '<div class="research-item" style="color:#475569">No themes found</div>'}
    </div>

    <div class="research-block">
      <div class="research-block-title">
        <span class="badge badge-green">Pre-seeded + Live</span>
        Applied Intuition Facts
      </div>
      ${r.appliedIntuitionFacts.map(f => `<div class="research-item">${f}</div>`).join('')}
    </div>

    <div class="research-block">
      <div class="research-block-title">
        <span style="font-size:10px;background:#dc262620;color:#f87171;border:1px solid #dc262640;padding:2px 8px;border-radius:99px;">YouTube</span>
        CEO Culture Themes
      </div>
      ${r.ceoThemes.map(t => `<div class="research-item">${t}</div>`).join('')}
      ${r.youtubeVideos.length ? `
        <div style="margin-top:8px;font-size:10px;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:5px">Source Videos</div>
        ${r.youtubeVideos.map(v => `
          <div class="yt-video">
            <div class="yt-video-title">${v.title}</div>
            ${v.description ? `<div class="yt-video-desc">${v.description}</div>` : ''}
          </div>
        `).join('')}
      ` : ''}
    </div>
  `;
}

// ─── Main flow ────────────────────────────────────────────────────────────────

async function init() {
  const { teamToken } = await getKeys();
  if (!teamToken) {
    showView('view-no-keys');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isLinkedIn = tab?.url?.includes('linkedin.com/in/');

  if (!isLinkedIn) {
    showView('view-not-linkedin');
    return;
  }

  showView('view-form');
  document.getElementById('parse-progress').style.display = 'flex';
  document.getElementById('form-fields').style.display = 'none';

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getProfileText' });
    if (!response?.ok) throw new Error('Could not read profile text');

    state.profileText = response.text;

    document.getElementById('parse-progress-text').textContent = 'Parsing profile with Claude...';
    const cleaned = await claudeJson(`You are a LinkedIn profile parser. Extract structured information from raw LinkedIn profile text.
Return ONLY valid JSON:
{
  "fullName": string,
  "currentTitle": string,
  "currentCompany": string,
  "currentLocation": string
}
Rules: use empty string "" if a field cannot be determined. Output ONLY the JSON object.

Profile text:
${response.text}`);

    state.profile = JSON.parse(cleaned);
    populateForm(state.profile);

    document.getElementById('parse-progress').style.display = 'none';
    document.getElementById('form-fields').style.display = 'block';
  } catch (err) {
    document.getElementById('parse-progress').style.display = 'none';
    document.getElementById('form-fields').style.display = 'block';
    const errEl = document.getElementById('form-error');
    errEl.style.display = 'block';
    errEl.textContent = `Auto-parse failed: ${err.message}. Fill in the fields manually.`;
  }
}

async function runGenerate() {
  const profile = readForm();
  const locationOption = readLocationOption();
  state.profile = profile;
  state.locationOption = locationOption;

  if (!profile.currentCompany) {
    const errEl = document.getElementById('form-error');
    errEl.style.display = 'block';
    errEl.textContent = 'Please enter the candidate\'s company name.';
    return;
  }

  showView('view-generating');
  document.getElementById('form-error').style.display = 'none';

  setStep('step-glassdoor', 'active');
  setStep('step-size', 'active');
  setStep('step-news', 'active');
  setStep('step-youtube', 'active');

  const [glassdoorText, companySizeText, appliedNewsText, youtubeVideos] = await Promise.all([
    tavilySearch(`${profile.currentCompany} Glassdoor reviews Blind app employee feedback`),
    tavilySearch(`${profile.currentCompany} number of employees headcount 2025`),
    tavilySearch('Applied Intuition 2025 news funding valuation IPO Series F'),
    youtubeSearch('Qasar Younis Applied Intuition'),
  ]);

  setStep('step-glassdoor', 'done');
  setStep('step-size', 'done');
  setStep('step-news', 'done');
  setStep('step-youtube', 'done');

  const [glassdoorThemes, sizeResult, appliedFacts, ceoThemes] = await Promise.all([
    extractNegativeThemes(profile.currentCompany, glassdoorText),
    extractCompanySize(profile.currentCompany, companySizeText),
    extractAppliedFacts(appliedNewsText),
    extractCeoThemes(youtubeVideos),
  ]);

  setStep('step-message', 'active');

  const research = {
    glassdoorThemes,
    companySize: sizeResult.raw,
    companySizeCategory: sizeResult.category,
    appliedIntuitionFacts: appliedFacts,
    ceoThemes,
    youtubeVideos,
  };

  const message = await generateMessage(profile, locationOption, research);
  setStep('step-message', 'done');

  state.result = { message, research };
  renderOutput(state.result);
  showView('view-output');
}

// ─── Wire up events ───────────────────────────────────────────────────────────

document.getElementById('btn-generate').addEventListener('click', async () => {
  try {
    await runGenerate();
  } catch (err) {
    showView('view-form');
    document.getElementById('form-fields').style.display = 'block';
    document.getElementById('parse-progress').style.display = 'none';
    const errEl = document.getElementById('form-error');
    errEl.style.display = 'block';
    errEl.textContent = `Error: ${err.message}`;
  }
});

document.getElementById('btn-copy').addEventListener('click', async () => {
  if (!state.result) return;
  await navigator.clipboard.writeText(state.result.message);
  const btn = document.getElementById('btn-copy');
  btn.classList.add('btn-copied');
  btn.textContent = '✓ Copied!';
  setTimeout(() => {
    btn.classList.remove('btn-copied');
    btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" stroke="currentColor" stroke-width="1.1"/><path d="M2 7H1.5a1 1 0 0 1-1-1V1.5a1 1 0 0 1 1-1H6a1 1 0 0 1 1 1V2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg> Copy`;
  }, 2000);
});

document.getElementById('research-toggle').addEventListener('click', () => {
  const toggle = document.getElementById('research-toggle');
  const panel = document.getElementById('research-panel');
  toggle.classList.toggle('open');
  panel.classList.toggle('open');
});

document.getElementById('btn-back').addEventListener('click', () => {
  showView('view-form');
  document.getElementById('form-fields').style.display = 'block';
  document.getElementById('parse-progress').style.display = 'none';
});

document.getElementById('btn-regenerate').addEventListener('click', async () => {
  try {
    showView('view-form');
    document.getElementById('form-fields').style.display = 'block';
    await runGenerate();
  } catch (err) {
    showView('view-form');
    document.getElementById('form-fields').style.display = 'block';
    const errEl = document.getElementById('form-error');
    errEl.style.display = 'block';
    errEl.textContent = `Error: ${err.message}`;
  }
});

document.getElementById('btn-open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('btn-setup-keys')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('f-location').addEventListener('input', e => {
  const vague = isVagueLocation(e.target.value);
  e.target.classList.toggle('vague', vague);
  document.getElementById('warn-location').style.display = vague ? 'flex' : 'none';
  document.getElementById('location-options').style.display = vague ? 'block' : 'none';
});

document.getElementById('f-company').addEventListener('input', e => {
  const vague = isVagueCompany(e.target.value);
  e.target.classList.toggle('vague', vague);
  document.getElementById('warn-company').style.display = vague ? 'flex' : 'none';
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
init().catch(err => {
  showView('view-form');
  document.getElementById('form-fields').style.display = 'block';
  document.getElementById('parse-progress').style.display = 'none';
  const errEl = document.getElementById('form-error');
  errEl.style.display = 'block';
  errEl.textContent = `Startup error: ${err.message}`;
});
