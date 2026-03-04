// ===============================================================================
// CONSTANTS
// ===============================================================================
const AVATAR_COLORS = ['#4f3ff0','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#64748b'];
const STORAGE_PREFIX = 'salesgrok_';

// ===============================================================================
// APP STATE
// ===============================================================================
let user = null;
let savedProfiles = [];
let promptHistory = [];
let pendingDeleteType = null;
let currentMode = 'generate';

let activePromptIndex = null;
let currentFile = null;
let currentFileText = null;
let freshProfile = null;
let selectedProfileId = null;
let pendingDeleteId = null;
let toastTimer = null;
let lastGeneratedOriginal = [];
let lastGeneratedStyled = [];

// ===============================================================================
// SETUP STATE
// ===============================================================================
let settingsAvatarColor = null;
let settingsAvatarImgData = null;

// ===============================================================================
// HELPERS
// ===============================================================================
const $ = elementId => document.getElementById(elementId);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const uid = () => '_' + Math.random().toString(36).slice(2,9);
const escHtml = unsafeString => unsafeString.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const todayLabel = () => new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});

// ===============================================================================
// STORAGE FUNCTIONS
// ===============================================================================
async function loadAppData() {
  try {
    const userData = localStorage.getItem(`${STORAGE_PREFIX}user`);
    user = userData ? JSON.parse(userData) : null;
    const profilesData = localStorage.getItem(`${STORAGE_PREFIX}profiles`);
    savedProfiles = profilesData ? JSON.parse(profilesData) : [];
    const historyData = localStorage.getItem(`${STORAGE_PREFIX}history`);
    promptHistory = historyData ? JSON.parse(historyData) : [];
    const modeData = localStorage.getItem(`${STORAGE_PREFIX}mode`);
    currentMode = modeData || 'generate';
    console.log('[Storage] Data loaded:', { user: !!user, profiles: savedProfiles.length, history: promptHistory.length, mode: currentMode });
  } catch (error) {
    console.error('[Storage] Failed to load data:', error);
    user = null; savedProfiles = []; promptHistory = []; currentMode = 'generate';
  }
}

const saveUser = async () => { try { localStorage.setItem(`${STORAGE_PREFIX}user`, JSON.stringify(user)); } catch(e) { console.error('[Storage] Failed to save user:', e); } };
const saveProfiles = async () => { try { localStorage.setItem(`${STORAGE_PREFIX}profiles`, JSON.stringify(savedProfiles)); } catch(e) { console.error('[Storage] Failed to save profiles:', e); } };
const savePromptHistory = async () => { try { localStorage.setItem(`${STORAGE_PREFIX}history`, JSON.stringify(promptHistory)); } catch(e) { console.error('[Storage] Failed to save history:', e); } };
const saveCurrentMode = async () => { try { localStorage.setItem(`${STORAGE_PREFIX}mode`, currentMode); } catch(e) { console.error('[Storage] Failed to save mode:', e); } };

function showToast(message, icon='fa-check') {
  $('toastMsg').textContent = message;
  $('toast').querySelector('i').className = `fa-solid ${icon}`;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2400);
}

function makeItem(textContent, isStyled=false, delayMilliseconds=0) {
  const itemDiv = document.createElement('div');
  itemDiv.className = 'result-item'+(isStyled?' styled-item':'');
  itemDiv.style.animationDelay = `${delayMilliseconds}ms`;
  itemDiv.textContent = textContent;
  return itemDiv;
}

function getInitial(name) { return (name || '?').trim().charAt(0).toUpperCase(); }

function applyAvatarStyle(element, color, imageData, initial) {
  element.style.background = imageData ? 'transparent' : color;
  const imageElement = element.querySelector('img');
  const initialElement = element.querySelector('span') || element.querySelector('[id*="Initial"]');
  if (imageData) { imageElement.src = imageData; imageElement.style.display = 'block'; if(initialElement) initialElement.style.display='none'; }
  else { imageElement.src=''; imageElement.style.display='none'; if(initialElement){ initialElement.style.display=''; initialElement.textContent = initial; } }
}

// ===============================================================================
// APP BOOT
// ===============================================================================
async function bootApp() {
  $('topUserName').textContent = user?.name || 'User';
  applyAvatarStyle($('topAvatarSm'), user?.avatarColor, user?.avatarImg, getInitial(user?.name));
  $('apiKeyDisplay').value = user?.apiKey || '';
  $('promptInput').value = '';
  
  const modeToggle = $('modeToggle');
  if (modeToggle) {
    modeToggle.checked = (currentMode === 'transform');
    if (currentMode === 'transform') {
      $('generateMode').style.display = 'none';
      $('transformMode').style.display = 'block';
      $('generateBtn').innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Transform to Selected Style';
    } else {
      $('generateMode').style.display = 'block';
      $('transformMode').style.display = 'none';
      $('generateBtn').innerHTML = '<i class="fa-solid fa-bolt"></i> Generate Content';
    }
  }
  
  renderHistory();
  renderSavedProfiles();
  injectProfileModalStyles();
  buildProfileModal();
}

// ===============================================================================
// TOP BAR / USER CHIP
// ===============================================================================
$('userChip').addEventListener('click', openSettings);

// ===============================================================================
// SETTINGS PANEL
// ===============================================================================
function openSettings() {
  settingsAvatarColor = user.avatarColor;
  settingsAvatarImgData = user.avatarImg || null;
  $('settingsName').value = user.name;
  $('settingsApiKey').value = user.apiKey || '';
  applyAvatarStyle($('settingsAvatarLg'), settingsAvatarColor, settingsAvatarImgData, getInitial(user.name));
  $('settingsAvatarInitial').textContent = settingsAvatarImgData ? '' : getInitial(user.name);
  $('settingsOverlay').classList.add('open');
  $('settingsPanel').classList.add('open');
}

function closeSettings() {
  $('settingsOverlay').classList.remove('open');
  $('settingsPanel').classList.remove('open');
}

$('settingsOverlay').addEventListener('click', closeSettings);
$('settingsClose').addEventListener('click', closeSettings);

$('settingsAvatarInput').addEventListener('change', event => {
  const file = event.target.files[0]; if(!file) return;
  const fileReader = new FileReader();
  fileReader.onload = loadEvent => {
    settingsAvatarImgData = loadEvent.target.result;
    applyAvatarStyle($('settingsAvatarLg'), settingsAvatarColor, settingsAvatarImgData, '');
    $('settingsAvatarInitial').textContent = '';
  };
  fileReader.readAsDataURL(file);
});

$('settingsKeyToggle').addEventListener('click', () => {
  const inputField = $('settingsApiKey');
  const isPassword = inputField.type === 'password';
  inputField.type = isPassword ? 'text' : 'password';
  $('settingsKeyIcon').className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
});

$('settingsSave').addEventListener('click', async () => {
  const name = $('settingsName').value.trim();
  if (!name) { $('settingsName').focus(); return; }
  user.name = name;
  user.apiKey = $('settingsApiKey').value.trim();
  user.avatarColor = settingsAvatarColor;
  user.avatarImg = settingsAvatarImgData;
  await saveUser();
  $('topUserName').textContent = user.name;
  applyAvatarStyle($('topAvatarSm'), user.avatarColor, user.avatarImg, getInitial(user.name));
  $('apiKeyDisplay').value = user.apiKey;
  closeSettings();
  showToast('Settings saved', 'fa-floppy-disk');
});

$('settingsReset').addEventListener('click', async () => {
  if (!confirm('Reset everything? All saved profiles and history will be deleted.')) return;
  localStorage.removeItem(`${STORAGE_PREFIX}user`);
  localStorage.removeItem(`${STORAGE_PREFIX}profiles`);
  localStorage.removeItem(`${STORAGE_PREFIX}history`);
  localStorage.removeItem(`${STORAGE_PREFIX}mode`);
  location.reload();
});

$('toggleKey').addEventListener('click', () => {
  const inputField = $('apiKeyDisplay');
  const isPassword = inputField.type === 'password';
  inputField.type = isPassword ? 'text' : 'password';
  $('toggleIcon').className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
});

// ===============================================================================
// PROMPT HISTORY
// ===============================================================================
function renderHistory(filter='') {
  const historyList = $('historyList');
  historyList.innerHTML = '';
  if (promptHistory.length === 0) {
    historyList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px;">No history yet.<br>Generate content to start.</div>';
    return;
  }
  promptHistory.slice().reverse().forEach((item, reverseIndex) => {
    const index = promptHistory.length - 1 - reverseIndex;
    if (filter && !item.prompt.toLowerCase().includes(filter.toLowerCase())) return;
    const promptDiv = document.createElement('div');
    promptDiv.className = `prompt-item${index === activePromptIndex ? ' active' : ''}`;
    const truncatedPrompt = item.prompt.length > 50 ? item.prompt.substring(0, 50) + '...' : item.prompt;
    const transformBadge = item.isTransform ? '<span style="background:#10b981;color:#fff;font-size:8px;padding:2px 5px;border-radius:3px;margin-left:4px;font-weight:700;">TRANSFORM</span>' : '';
    promptDiv.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <span style="flex:1;cursor:pointer;">${escHtml(truncatedPrompt)}${transformBadge}</span>
        <button class="history-delete-btn" data-id="${item.id}" data-prompt="${escHtml(item.prompt)}" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:11px;padding:2px 4px;border-radius:4px;transition:color .15s,background .15s;line-height:1;" title="Delete">
          <i class="fa-solid fa-trash-can" style="font-size:12px;"></i>
        </button>
      </div>
      <i class="fa-solid fa-arrow-right arrow"></i>`;
    promptDiv.querySelector('span').addEventListener('click', () => {
      activePromptIndex = index;
      $('promptInput').value = item.prompt;
      if (item.styleApplied) renderSideBySideWithData(item.original, item.styled, item.styleName);
      else renderSingleWithData(item.original);
      $('resultsArea').classList.add('visible');
      renderHistory($('searchInput').value);
    });
    promptDiv.querySelector('.history-delete-btn').addEventListener('click', (e) => { e.stopPropagation(); openHistoryDeleteConfirm(item.id, item.prompt); });
    historyList.appendChild(promptDiv);
  });
}

$('searchInput').addEventListener('input', () => renderHistory($('searchInput').value));

// ===============================================================================
// HISTORY DELETE CONFIRMATION
// ===============================================================================
function openHistoryDeleteConfirm(historyId, promptText) {
  pendingDeleteId = historyId;
  pendingDeleteType = 'history';
  const shortPrompt = promptText.length > 50 ? promptText.substring(0, 50) + '...' : promptText;
  $('confirmProfileName').textContent = `"${shortPrompt}"`;
  $('confirmOverlay').classList.add('visible');
}

// ===============================================================================
// FILE UPLOAD + MAMMOTH.JS PARSING
// ===============================================================================
$('uploadZone').addEventListener('dragover', event=>{event.preventDefault();$('uploadZone').classList.add('dragover');});
$('uploadZone').addEventListener('dragleave',()=>$('uploadZone').classList.remove('dragover'));
$('uploadZone').addEventListener('drop',event=>{event.preventDefault();$('uploadZone').classList.remove('dragover');if(event.dataTransfer.files[0])handleFile(event.dataTransfer.files[0]);});
$('fileInput').addEventListener('change',()=>{if($('fileInput').files[0])handleFile($('fileInput').files[0]);});

async function handleFile(file) {
  currentFile = file;
  $('fileName').textContent = file.name;
  $('uploadZone').style.display = 'none';
  $('fileSelected').classList.add('visible');
  $('analyseBtn').disabled = false;
  $('freshAnalysis').classList.remove('visible');
  freshProfile = null; currentFileText = null;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    currentFileText = result.value.trim();
    console.log('[File] Extracted:', currentFileText.length, 'characters');
    showToast('Document parsed successfully', 'fa-file-word');
  } catch (error) {
    console.error('[File] Parse error:', error);
    showToast('Failed to parse document', 'fa-exclamation-triangle');
    currentFileText = null;
  }
}

$('fileRemove').addEventListener('click',()=>{
  currentFile=null; currentFileText=null; $('fileInput').value='';
  $('uploadZone').style.display='block'; $('fileSelected').classList.remove('visible');
  $('analyseBtn').disabled=true; $('freshAnalysis').classList.remove('visible'); freshProfile=null;
  $('analyseBtn').innerHTML='<i class="fa-solid fa-wand-sparkles"></i> Analyse My Style';
});

// ===============================================================================
// ANALYZE
// ===============================================================================
async function analyzeWritingStyle(text) {
  const prompt = `You are an expert writing style analyst. Analyze this text and return a comprehensive style profile.

  TEXT TO ANALYZE:
  """
  ${text}
  """

  First, think through this analysis step by step:

  1. FIRST IMPRESSION (1 sentence): What's the immediate feel of this writing?
  2. TONE ANALYSIS: Is it formal or casual? Professional or friendly? Is it urgent, calm, excited, measured?
  3. VOCABULARY ANALYSIS: What types of words dominate? Any distinctive word choices?
  4. SENTENCE ARCHITECTURE: Average sentence length? Patterns in how sentences start?
  5. VOICE & PERSONALITY: Active or Passive? What personality traits emerge?
  6. PATTERNS & TICS: Any recurring phrases? Preferred punctuation?
  7. WHAT'S ABSENT: What do they NEVER do?

  Return a JSON object with these exact keys:
  {
    "tone": "detailed description of the overall tone",
    "vocabulary": "description of word choices and patterns",
    "sentenceStyle": "description of sentence structure and rhythm",
    "voice": "active/passive and person used",
    "personality": "emerging personality traits with examples",
    "patterns": "key writing patterns observed",
    "avoid": "things the writer consistently avoids",
    "signature": "one sentence that captures their unique voice",
    "example": "a 2-sentence sample of what they might write about any topic"
  }

  IMPORTANT: Be specific, reference actual evidence, return ONLY valid JSON.`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${user.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.3, max_tokens: 1500 })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error('Invalid API response structure');
  const content = data.choices[0].message.content;
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No valid JSON found in response');
  const profile = JSON.parse(jsonMatch[0]);
  const requiredFields = ['tone', 'vocabulary', 'sentenceStyle', 'voice', 'personality'];
  const missingFields = requiredFields.filter(field => !profile[field]);
  if (missingFields.length > 0) throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  profile.analyzedAt = new Date().toISOString();
  profile.textLength = text.length;
  profile.wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  return profile;
}

$('analyseBtn').addEventListener('click', async () => {
  if (!currentFileText) { showToast('No document text available', 'fa-exclamation-triangle'); return; }
  $('analyseBtn').disabled = true;
  $('analyseBtn').innerHTML = `<span class="spinner-ring" style="width:13px;height:13px;border-color:rgba(79,63,240,.15);border-top-color:var(--brand);display:inline-block;"></span>&nbsp;Analysing...`;
  $('freshAnalysis').classList.remove('visible');
  try {
    freshProfile = await analyzeWritingStyle(currentFileText);
    const truncateDisplay = (str, max = 10) => { if (!str) return '—'; return str.length > max ? str.substring(0, max) + '…' : str; };
    $('traitTone').textContent = truncateDisplay(freshProfile.tone);
    $('traitVocab').textContent = truncateDisplay(freshProfile.vocabulary);
    $('traitSentence').textContent = truncateDisplay(freshProfile.sentenceStyle);
    $('traitVoice').textContent = truncateDisplay(freshProfile.voice);
    $('traitPersonality').textContent = truncateDisplay(freshProfile.personality);
    $('traitTone').title = freshProfile.tone || '';
    $('traitVocab').title = freshProfile.vocabulary || '';
    $('traitSentence').title = freshProfile.sentenceStyle || '';
    $('traitVoice').title = freshProfile.voice || '';
    $('traitPersonality').title = freshProfile.personality || '';
    $('profileNameInput').value = '';
    $('freshAnalysis').classList.add('visible');
    showToast('Analysis complete', 'fa-chart-bar');
  } catch (error) {
    console.error('[Analysis] Failed:', error);
    showToast(error.message.includes('API error') ? 'API request failed. Check your API key.' : 'Analysis failed', 'fa-exclamation-triangle');
  } finally {
    $('analyseBtn').disabled = false;
    $('analyseBtn').innerHTML = '<i class="fa-solid fa-rotate-right"></i> Re-analyse';
  }
});

// ===============================================================================
// SAVE PROFILE
// ===============================================================================
$('saveProfileBtn').addEventListener('click', async () => {
  const name = $('profileNameInput').value.trim();
  if (!name) { $('profileNameInput').focus(); $('profileNameInput').style.borderColor = '#ef4444'; setTimeout(() => $('profileNameInput').style.borderColor = '', 1200); return; }
  if (!freshProfile) { showToast('No profile to save', 'fa-exclamation-triangle'); return; }
  const truncateValue = (value) => { if (!value || value === 'undefined') return '—'; return value.length > 10 ? value.substring(0, 10) + '…' : value; };
  const profile = {
    id: uid(), name, date: todayLabel(),
    tone: freshProfile.tone, vocabulary: freshProfile.vocabulary, sentenceStyle: freshProfile.sentenceStyle,
    voice: freshProfile.voice, personality: freshProfile.personality, patterns: freshProfile.patterns,
    avoid: freshProfile.avoid, signature: freshProfile.signature, example: freshProfile.example,
    analyzedAt: freshProfile.analyzedAt, textLength: freshProfile.textLength, wordCount: freshProfile.wordCount,
    toneShort: truncateValue(freshProfile.tone), vocabularyShort: truncateValue(freshProfile.vocabulary),
    sentenceStyleShort: truncateValue(freshProfile.sentenceStyle), voiceShort: truncateValue(freshProfile.voice),
    personalityShort: truncateValue(freshProfile.personality)
  };
  savedProfiles.push(profile);
  await saveProfiles();
  renderSavedProfiles();
  selectProfile(profile.id);
  $('freshAnalysis').classList.remove('visible');
  freshProfile = null;
  showToast(`"${name}" saved and selected`, 'fa-fingerprint');
});

// ===============================================================================
// SAVED PROFILES
// ===============================================================================
function renderSavedProfiles() {
  const list = $('savedProfilesList');
  $('profileCount').textContent = savedProfiles.length;
  list.innerHTML = '';
  if (!savedProfiles.length) {
    list.innerHTML = `<div class="no-profiles-msg"><i class="fa-solid fa-ghost" style="font-size:18px;opacity:.35;display:block;margin-bottom:6px;"></i>No saved profiles yet.<br>Analyse a document to get started.</div>`;
    $('applyRow').classList.remove('visible');
    return;
  }
  savedProfiles.forEach(p => {
    const card = document.createElement('div');
    card.className = `saved-profile-card${selectedProfileId === p.id ? ' selected' : ''}`;
    const getDisplayValue = (value, fallback = 'Unknown') => { if (!value || value === 'undefined') return fallback; return value.length > 10 ? value.substring(0, 10) + '...' : value; };
    const tone = getDisplayValue(p.tone);
    const vocab = getDisplayValue(p.vocabulary || p.vocab);
    const sentence = getDisplayValue(p.sentenceStyle || p.sentence);
    const voice = getDisplayValue(p.voice);
    const personality = getDisplayValue(p.personality);
    card.innerHTML = `
      <div class="spc-header">
        <div class="spc-name">
          <i class="fa-solid fa-check-circle selected-check"></i>
          <i class="fa-solid fa-id-card-clip" style="color:var(--brand-light);font-size:10px;"></i>
          ${escHtml(p.name)}
        </div>
        <div class="spc-actions">
          <span class="spc-date">${p.date}</span>
          <button class="spc-view-btn" data-id="${p.id}" title="View / Edit details"><i class="fa-solid fa-eye"></i></button>
          <button class="spc-del-btn" data-id="${p.id}" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
      <div class="spc-traits">
        <span class="spc-trait-pill" title="${escHtml(p.tone||'')}">${tone}</span>
        <span class="spc-trait-pill" title="${escHtml(p.vocabulary||'')}">${vocab}</span>
        <span class="spc-trait-pill" title="${escHtml(p.sentenceStyle||'')}">${sentence}</span>
        <span class="spc-trait-pill" title="${escHtml(p.voice||'')}">${voice}</span>
        <span class="spc-trait-pill" title="${escHtml(p.personality||'')}">${personality}</span>
      </div>`;
    card.addEventListener('click', e => { if (e.target.closest('.spc-del-btn') || e.target.closest('.spc-view-btn')) return; selectProfile(p.id); });
    card.querySelector('.spc-view-btn').addEventListener('click', e => { e.stopPropagation(); openProfileModal(p.id); });
    card.querySelector('.spc-del-btn').addEventListener('click', e => { e.stopPropagation(); openDeleteConfirm(p.id, p.name); });
    list.appendChild(card);
  });
  if (selectedProfileId && savedProfiles.find(p => p.id === selectedProfileId)) $('applyRow').classList.add('visible');
}

function selectProfile(profileId) {
  selectedProfileId = profileId;
  const selectedProfile = savedProfiles.find(profile => profile.id === profileId);
  if (selectedProfile) {
    $('applyRow').classList.add('visible');
    $('activeStyleBar').classList.add('visible');
    $('activeStyleName').textContent = `Style: "${selectedProfile.name}"`;
  }
  renderSavedProfiles();
}

function deselectProfile() {
  selectedProfileId = null;
  $('applyRow').classList.remove('visible');
  $('activeStyleBar').classList.remove('visible');
  $('applyToggle').checked = false;
  renderSavedProfiles();
}

$('clearStyleBtn').addEventListener('click', deselectProfile);

// ===============================================================================
// PROFILE DETAIL / EDIT MODAL
// ===============================================================================
function injectProfileModalStyles() {
  if ($('profileModalStyles')) return;
  const style = document.createElement('style');
  style.id = 'profileModalStyles';
  style.textContent = `
    #profileModalOverlay {
      position: fixed; inset: 0;
      background: rgba(10,10,20,0.72);
      backdrop-filter: blur(4px);
      z-index: 1200;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      opacity: 0; pointer-events: none;
      transition: opacity 0.22s ease;
    }
    #profileModalOverlay.open { opacity: 1; pointer-events: all; }

    #profileModal {
      background: var(--bg-white, #fff);
      border-radius: 16px;
      box-shadow: 0 32px 64px rgba(0,0,0,0.32), 0 0 0 1px rgba(79,63,240,0.1);
      width: 100%; max-width: 580px; max-height: 88vh;
      display: flex; flex-direction: column;
      transform: translateY(18px) scale(0.98);
      transition: transform 0.22s ease;
      overflow: hidden;
    }
    #profileModalOverlay.open #profileModal { transform: translateY(0) scale(1); }

    .pm-header {
      display: flex; align-items: center; gap: 10px;
      padding: 18px 22px 16px;
      border-bottom: 1.5px solid var(--brand-border, #e0d8ff);
      flex-shrink: 0;
    }
    .pm-header-icon {
      width: 34px; height: 34px;
      background: var(--brand-pale, #f0eeff);
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      color: var(--brand, #4f3ff0); font-size: 15px; flex-shrink: 0;
    }
    .pm-header-title {
      flex: 1; font-size: 15px; font-weight: 700;
      color: var(--text-dark, #1e1854);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .pm-header-meta { font-size: 11px; color: var(--text-muted, #9b94cc); white-space: nowrap; }
    .pm-close-btn {
      background: none; border: none; cursor: pointer;
      color: var(--text-muted, #9b94cc); font-size: 16px;
      padding: 4px 6px; border-radius: 6px;
      transition: background 0.15s, color 0.15s; line-height: 1;
    }
    .pm-close-btn:hover { background: var(--brand-pale, #f0eeff); color: var(--brand, #4f3ff0); }

    .pm-tabs {
      display: flex; padding: 12px 22px 0;
      border-bottom: 1.5px solid var(--brand-border, #e0d8ff);
      flex-shrink: 0;
    }
    .pm-tab {
      padding: 8px 16px; font-size: 12px; font-weight: 600;
      color: var(--text-muted, #9b94cc); cursor: pointer;
      border: none; background: none;
      border-bottom: 2.5px solid transparent; margin-bottom: -1.5px;
      transition: color 0.15s, border-color 0.15s;
      display: flex; align-items: center; gap: 6px;
    }
    .pm-tab:hover { color: var(--brand, #4f3ff0); }
    .pm-tab.active { color: var(--brand, #4f3ff0); border-bottom-color: var(--brand, #4f3ff0); }

    .pm-body {
      overflow-y: auto; flex: 1;
      padding: 18px 22px;
      display: flex; flex-direction: column; gap: 14px;
    }

    .pm-field-row { display: flex; flex-direction: column; gap: 5px; }
    .pm-field-label {
      font-size: 11px; font-weight: 700;
      color: var(--brand, #4f3ff0);
      text-transform: uppercase; letter-spacing: 0.06em;
      display: flex; align-items: center; gap: 5px;
    }
    .pm-field-value {
      font-size: 13px; color: var(--text-dark, #1e1854);
      line-height: 1.65;
      background: var(--bg-main, #f5f3ff);
      border-radius: 8px; padding: 10px 13px;
      border: 1.5px solid var(--brand-border, #e0d8ff);
      white-space: pre-wrap; word-break: break-word;
    }
    .pm-field-value.signature {
      font-style: italic; color: var(--brand, #4f3ff0); font-weight: 500;
      background: linear-gradient(135deg, var(--brand-pale, #f0eeff), #fff);
    }
    .pm-field-value.example-text {
      font-family: Georgia, 'Times New Roman', serif;
      background: #fffdf5; border-color: #f59e0b44;
    }
    .pm-stats-strip { display: flex; gap: 12px; flex-wrap: wrap; }
    .pm-stat {
      background: var(--brand-pale, #f0eeff);
      border: 1px solid var(--brand-border, #e0d8ff);
      border-radius: 7px; padding: 8px 12px;
      font-size: 11px; color: var(--text-mid, #4a4580);
      display: flex; flex-direction: column; gap: 2px;
    }
    .pm-stat strong { font-size: 16px; font-weight: 700; color: var(--brand, #4f3ff0); }
    .pm-section-divider { height: 1px; background: var(--brand-border, #e0d8ff); margin: 2px 0; }

    .pm-edit-field { display: flex; flex-direction: column; gap: 5px; }
    .pm-edit-label {
      font-size: 11px; font-weight: 700; color: var(--brand, #4f3ff0);
      text-transform: uppercase; letter-spacing: 0.06em;
      display: flex; align-items: center; gap: 5px;
    }
    .pm-edit-textarea {
      width: 100%; border: 1.5px solid var(--brand-border, #e0d8ff);
      border-radius: 8px; padding: 9px 12px;
      font-size: 13px; color: var(--text-dark, #1e1854);
      background: var(--bg-white, #fff); font-family: inherit;
      line-height: 1.6; resize: vertical; min-height: 60px;
      transition: border-color 0.15s, box-shadow 0.15s; outline: none;
    }
    .pm-edit-textarea:focus { border-color: var(--brand, #4f3ff0); box-shadow: 0 0 0 3px rgba(79,63,240,0.1); }
    .pm-edit-name-input {
      width: 100%; border: 1.5px solid var(--brand-border, #e0d8ff);
      border-radius: 8px; padding: 9px 12px;
      font-size: 14px; font-weight: 600; color: var(--text-dark, #1e1854);
      background: var(--bg-white, #fff); font-family: inherit;
      transition: border-color 0.15s, box-shadow 0.15s; outline: none;
    }
    .pm-edit-name-input:focus { border-color: var(--brand, #4f3ff0); box-shadow: 0 0 0 3px rgba(79,63,240,0.1); }
    .pm-edit-hint { font-size: 10.5px; color: var(--text-muted, #9b94cc); font-style: italic; }

    .pm-footer {
      padding: 14px 22px;
      border-top: 1.5px solid var(--brand-border, #e0d8ff);
      display: flex; align-items: center; gap: 10px;
      flex-shrink: 0; flex-wrap: wrap;
    }
    .pm-btn-select {
      display: inline-flex; align-items: center; gap: 7px;
      background: var(--brand, #4f3ff0); color: #fff;
      border: none; border-radius: 8px; padding: 9px 18px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.15s, transform 0.1s; font-family: inherit;
    }
    .pm-btn-select:hover { background: var(--brand-light, #7c6ff7); transform: translateY(-1px); }
    .pm-btn-save-edit {
      display: inline-flex; align-items: center; gap: 7px;
      background: #10b981; color: #fff; border: none; border-radius: 8px;
      padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.15s, transform 0.1s; font-family: inherit;
    }
    .pm-btn-save-edit:hover { background: #059669; transform: translateY(-1px); }
    .pm-btn-cancel-edit {
      display: inline-flex; align-items: center; gap: 7px;
      background: none; color: var(--text-mid, #4a4580);
      border: 1.5px solid var(--brand-border, #e0d8ff);
      border-radius: 8px; padding: 8px 16px;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.15s; font-family: inherit;
    }
    .pm-btn-cancel-edit:hover { background: var(--brand-pale, #f0eeff); }
    .pm-footer-selected-badge {
      display: inline-flex; align-items: center; gap: 5px;
      background: #d1fae5; color: #065f46;
      font-size: 11px; font-weight: 700;
      padding: 5px 10px; border-radius: 100px; border: 1px solid #a7f3d0;
    }

    .spc-view-btn {
      background: none; border: none; cursor: pointer;
      color: var(--text-muted, #9b94cc); font-size: 11px;
      padding: 2px 5px; border-radius: 4px;
      transition: color .15s, background .15s; line-height: 1;
    }
    .spc-view-btn:hover { color: var(--brand, #4f3ff0); background: var(--brand-pale, #f0eeff); }
  `;
  document.head.appendChild(style);
}

function buildProfileModal() {
  if ($('profileModalOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'profileModalOverlay';
  overlay.innerHTML = `
    <div id="profileModal">
      <div class="pm-header">
        <div class="pm-header-icon"><i class="fa-solid fa-fingerprint"></i></div>
        <div class="pm-header-title" id="pmTitle">Style Profile</div>
        <div class="pm-header-meta" id="pmMeta"></div>
        <button class="pm-close-btn" id="pmClose"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="pm-tabs">
        <button class="pm-tab active" id="pmTabView"><i class="fa-solid fa-eye"></i> View</button>
        <button class="pm-tab" id="pmTabEdit"><i class="fa-solid fa-pen-to-square"></i> Edit</button>
      </div>
      <div class="pm-body" id="pmBody"></div>
      <div class="pm-footer" id="pmFooter"></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeProfileModal(); });
  $('pmClose').addEventListener('click', closeProfileModal);
  $('pmTabView').addEventListener('click', () => switchPmTab('view'));
  $('pmTabEdit').addEventListener('click', () => switchPmTab('edit'));
}

let pmCurrentProfileId = null;
let pmCurrentTab = 'view';

function openProfileModal(profileId) {
  pmCurrentProfileId = profileId;
  pmCurrentTab = 'view';
  switchPmTab('view');
  $('profileModalOverlay').classList.add('open');
}

function closeProfileModal() {
  $('profileModalOverlay').classList.remove('open');
  pmCurrentProfileId = null;
}

function switchPmTab(tab) {
  pmCurrentTab = tab;
  $('pmTabView').classList.toggle('active', tab === 'view');
  $('pmTabEdit').classList.toggle('active', tab === 'edit');
  const profile = savedProfiles.find(p => p.id === pmCurrentProfileId);
  if (!profile) return;
  $('pmTitle').textContent = profile.name;
  $('pmMeta').textContent = `Saved ${profile.date}`;
  if (tab === 'view') renderPmViewMode(profile);
  else renderPmEditMode(profile);
}

function renderPmViewMode(profile) {
  const isSelected = selectedProfileId === profile.id;
  const fields = [
    { key: 'tone',          label: 'Tone',            icon: 'fa-face-smile' },
    { key: 'vocabulary',    label: 'Vocabulary',      icon: 'fa-book-open' },
    { key: 'sentenceStyle', label: 'Sentence Style',  icon: 'fa-ruler' },
    { key: 'voice',         label: 'Voice',           icon: 'fa-pen-fancy' },
    { key: 'personality',   label: 'Personality',     icon: 'fa-fire' },
    { key: 'patterns',      label: 'Patterns & Tics', icon: 'fa-repeat' },
    { key: 'avoid',         label: 'What They Avoid', icon: 'fa-ban' },
  ];

  const statsHtml = (profile.wordCount || profile.textLength) ? `
    <div class="pm-stats-strip">
      ${profile.wordCount ? `<div class="pm-stat"><strong>${profile.wordCount.toLocaleString()}</strong>Words analysed</div>` : ''}
      ${profile.textLength ? `<div class="pm-stat"><strong>${profile.textLength.toLocaleString()}</strong>Characters</div>` : ''}
      ${profile.analyzedAt ? `<div class="pm-stat"><strong>${new Date(profile.analyzedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</strong>Analysed on</div>` : ''}
    </div>` : '';

  const fieldsHtml = fields.map(f => {
    const val = profile[f.key];
    if (!val || val === '—') return '';
    return `<div class="pm-field-row">
      <div class="pm-field-label"><i class="fa-solid ${f.icon}"></i>${f.label}</div>
      <div class="pm-field-value">${escHtml(val)}</div>
    </div>`;
  }).join('');

  const signatureHtml = profile.signature ? `
    <div class="pm-section-divider"></div>
    <div class="pm-field-row">
      <div class="pm-field-label"><i class="fa-solid fa-quote-left"></i>Signature Style</div>
      <div class="pm-field-value signature">${escHtml(profile.signature)}</div>
    </div>` : '';

  const exampleHtml = profile.example ? `
    <div class="pm-field-row">
      <div class="pm-field-label"><i class="fa-solid fa-flask"></i>Example Writing</div>
      <div class="pm-field-value example-text">${escHtml(profile.example)}</div>
    </div>` : '';

  $('pmBody').innerHTML = statsHtml + fieldsHtml + signatureHtml + exampleHtml;

  $('pmFooter').innerHTML = isSelected
    ? `<span class="pm-footer-selected-badge"><i class="fa-solid fa-check-circle"></i> Currently selected</span>
       <button class="pm-btn-select" id="pmDeselectBtn" style="background:var(--text-muted,#9b94cc);">
         <i class="fa-solid fa-times"></i> Deselect
       </button>
       <button class="pm-btn-select" id="pmGoEditBtn" style="margin-left:auto;">
         <i class="fa-solid fa-pen-to-square"></i> Edit Profile
       </button>`
    : `<button class="pm-btn-select" id="pmSelectBtn">
         <i class="fa-solid fa-check"></i> Select This Style
       </button>
       <button class="pm-btn-select" id="pmGoEditBtn" style="margin-left:auto;">
         <i class="fa-solid fa-pen-to-square"></i> Edit Profile
       </button>`;

  const selectBtn = $('pmSelectBtn');
  const deselectBtn = $('pmDeselectBtn');
  const goEditBtn = $('pmGoEditBtn');

  if (selectBtn) selectBtn.addEventListener('click', () => { selectProfile(profile.id); closeProfileModal(); showToast(`"${profile.name}" selected`, 'fa-fingerprint'); });
  if (deselectBtn) deselectBtn.addEventListener('click', () => { deselectProfile(); closeProfileModal(); showToast('Style deselected', 'fa-times'); });
  if (goEditBtn) goEditBtn.addEventListener('click', () => switchPmTab('edit'));
}

function renderPmEditMode(profile) {
  const editableFields = [
    { key: 'name',          label: 'Profile Name',    icon: 'fa-tag',        type: 'input',    hint: 'A short, memorable name for this style profile.' },
    { key: 'tone',          label: 'Tone',            icon: 'fa-face-smile', type: 'textarea', hint: 'Describe the overall tone and feel of the writing.' },
    { key: 'vocabulary',    label: 'Vocabulary',      icon: 'fa-book-open',  type: 'textarea', hint: 'Word choices, complexity, and distinctive terms.' },
    { key: 'sentenceStyle', label: 'Sentence Style',  icon: 'fa-ruler',      type: 'textarea', hint: 'Sentence length, rhythm, and structural patterns.' },
    { key: 'voice',         label: 'Voice',           icon: 'fa-pen-fancy',  type: 'textarea', hint: 'Active/passive, first/second/third person, etc.' },
    { key: 'personality',   label: 'Personality',     icon: 'fa-fire',       type: 'textarea', hint: 'Personality traits that emerge from the writing.' },
    { key: 'patterns',      label: 'Patterns & Tics', icon: 'fa-repeat',     type: 'textarea', hint: 'Recurring phrases, punctuation habits, transitions.' },
    { key: 'avoid',         label: 'What to Avoid',   icon: 'fa-ban',        type: 'textarea', hint: 'Things this writer never does.' },
    { key: 'signature',     label: 'Signature Style', icon: 'fa-quote-left', type: 'textarea', hint: "One sentence capturing this writer's unique voice." },
    { key: 'example',       label: 'Example Writing', icon: 'fa-flask',      type: 'textarea', hint: 'A short sample that illustrates this style.' },
  ];

  const fieldsHtml = editableFields.map(f => {
    const val = profile[f.key] && profile[f.key] !== '—' ? profile[f.key] : '';
    if (f.type === 'input') {
      return `<div class="pm-edit-field">
        <div class="pm-edit-label"><i class="fa-solid ${f.icon}"></i>${f.label}</div>
        <input type="text" class="pm-edit-name-input" id="pme_${f.key}" value="${escHtml(val)}" maxlength="48" />
        <div class="pm-edit-hint">${f.hint}</div>
      </div>`;
    }
    const rows = ['tone','vocabulary','personality'].includes(f.key) ? 3 : f.key === 'example' ? 4 : 2;
    return `<div class="pm-edit-field">
      <div class="pm-edit-label"><i class="fa-solid ${f.icon}"></i>${f.label}</div>
      <textarea class="pm-edit-textarea" id="pme_${f.key}" rows="${rows}">${escHtml(val)}</textarea>
      <div class="pm-edit-hint">${f.hint}</div>
    </div>`;
  }).join('');

  $('pmBody').innerHTML = fieldsHtml;
  $('pmFooter').innerHTML = `
    <button class="pm-btn-save-edit" id="pmSaveEditBtn"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
    <button class="pm-btn-cancel-edit" id="pmCancelEditBtn">Cancel</button>`;

  $('pmSaveEditBtn').addEventListener('click', () => savePmEdit(profile.id));
  $('pmCancelEditBtn').addEventListener('click', () => switchPmTab('view'));
}

async function savePmEdit(profileId) {
  const profile = savedProfiles.find(p => p.id === profileId);
  if (!profile) return;
  const newName = ($('pme_name')?.value || '').trim();
  if (!newName) {
    $('pme_name').style.borderColor = '#ef4444';
    $('pme_name').focus();
    setTimeout(() => $('pme_name').style.borderColor = '', 1200);
    showToast('Profile name is required', 'fa-exclamation-triangle');
    return;
  }
  profile.name = newName;
  ['tone','vocabulary','sentenceStyle','voice','personality','patterns','avoid','signature','example'].forEach(key => {
    const el = $(`pme_${key}`);
    if (el) profile[key] = el.value.trim();
  });
  const trunc = (v) => { if (!v || v === 'undefined' || v === '—') return '—'; return v.length > 10 ? v.substring(0, 10) + '…' : v; };
  profile.toneShort = trunc(profile.tone);
  profile.vocabularyShort = trunc(profile.vocabulary);
  profile.sentenceStyleShort = trunc(profile.sentenceStyle);
  profile.voiceShort = trunc(profile.voice);
  profile.personalityShort = trunc(profile.personality);
  await saveProfiles();
  renderSavedProfiles();
  if (selectedProfileId === profileId) $('activeStyleName').textContent = `Style: "${profile.name}"`;
  showToast(`"${profile.name}" updated`, 'fa-floppy-disk');
  switchPmTab('view');
}

// ===============================================================================
// DELETE CONFIRM
// ===============================================================================
function openDeleteConfirm(profileId, profileName) {
  pendingDeleteId = profileId;
  pendingDeleteType = 'profile';
  $('confirmProfileName').textContent = `"${profileName}"`;
  $('confirmOverlay').classList.add('visible');
}

$('confirmCancel').addEventListener('click', () => { $('confirmOverlay').classList.remove('visible'); pendingDeleteId = null; pendingDeleteType = null; });

$('confirmDelete').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  if (pendingDeleteType === 'history') {
    const deletedIndex = promptHistory.findIndex(item => item.id === pendingDeleteId);
    if (deletedIndex !== -1) {
      promptHistory = promptHistory.filter(item => item.id !== pendingDeleteId);
      await savePromptHistory();
      if (activePromptIndex !== null) {
        if (deletedIndex === promptHistory.length) activePromptIndex = promptHistory.length - 1;
        else if (deletedIndex < activePromptIndex) activePromptIndex--;
        else if (deletedIndex === activePromptIndex) { activePromptIndex = null; $('resultsArea').classList.remove('visible'); }
      }
      renderHistory($('searchInput').value);
      showToast(`Generation deleted`, 'fa-trash-can');
    }
  } else {
    const deletedProfileName = savedProfiles.find(profile => profile.id === pendingDeleteId)?.name;
    savedProfiles = savedProfiles.filter(profile => profile.id !== pendingDeleteId);
    if (selectedProfileId === pendingDeleteId) deselectProfile();
    await saveProfiles();
    renderSavedProfiles();
    showToast(`"${deletedProfileName}" deleted`, 'fa-trash-can');
  }
  pendingDeleteId = null; pendingDeleteType = null;
  $('confirmOverlay').classList.remove('visible');
});

$('confirmOverlay').addEventListener('click', event => {
  if (event.target === $('confirmOverlay')) { $('confirmOverlay').classList.remove('visible'); pendingDeleteId = null; pendingDeleteType = null; }
});

// ===============================================================================
// GENERATE
// ===============================================================================
async function generateContent(prompt, styleProfile = null) {
  const systemPrompt = styleProfile
    ? `You are a content generator that mimics specific writing styles.
    STYLE PROFILE TO MATCH:
    - Tone: ${styleProfile.tone}
    - Vocabulary: ${styleProfile.vocabulary}
    - Sentence Style: ${styleProfile.sentenceStyle}
    - Voice: ${styleProfile.voice}
    - Personality: ${styleProfile.personality}
    ${styleProfile.patterns ? `Writing Patterns: ${styleProfile.patterns}` : ''}
    ${styleProfile.avoid ? `Things to Avoid: ${styleProfile.avoid}` : ''}
    ${styleProfile.signature ? `Signature Style: ${styleProfile.signature}` : ''}
    Generate content matching this style. Return ONLY a JSON array of strings.
    Example: ["item 1", "item 2", "item 3"]`
    : `You are a helpful content generator. Return ONLY a JSON array of strings.
    Example: ["item 1", "item 2", "item 3"]`;

  const userPrompt = `Generate content based on this request:\n\n${prompt}\n\nReturn results as a JSON array of strings. Generate at least 10-15 items.`;
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${user.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: styleProfile ? 0.7 : 0.5, max_tokens: 2000 })
  });
  if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error?.message || `API error: ${response.status}`); }
  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error('Invalid API response structure');
  const content = data.choices[0].message.content;
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('No valid JSON array found in response');
  const generatedItems = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(generatedItems) || generatedItems.length === 0) throw new Error('Invalid response format');
  return generatedItems;
}

// ===============================================================================
// TRANSFORM
// ===============================================================================
async function transformText(inputText, styleProfile) {
  if (!styleProfile) throw new Error('No style profile selected');
  const systemPrompt = `You are an expert at rewriting text to match specific writing styles while preserving meaning.
  STYLE PROFILE TO MATCH:
  - Tone: ${styleProfile.tone}
  - Vocabulary: ${styleProfile.vocabulary}
  - Sentence Style: ${styleProfile.sentenceStyle}
  - Voice: ${styleProfile.voice}
  - Personality: ${styleProfile.personality}
  ${styleProfile.patterns ? `Writing Patterns: ${styleProfile.patterns}` : ''}
  ${styleProfile.avoid ? `Things to Avoid: ${styleProfile.avoid}` : ''}
  ${styleProfile.signature ? `Signature Style: ${styleProfile.signature}` : ''}
  Rewrite preserving meaning, maintaining length, matching tone/vocabulary/sentence patterns.
  Return ONLY the rewritten text, nothing else.`;
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${user.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: `Rewrite this text in the specified style:\n\n${inputText}` }], temperature: 0.7, max_tokens: 3000 })
  });
  if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error?.message || `API error: ${response.status}`); }
  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) throw new Error('Invalid API response structure');
  return data.choices[0].message.content.trim();
}

// ===============================================================================
// MODE TOGGLE
// ===============================================================================
$('modeToggle').addEventListener('change', async (e) => {
  currentMode = e.target.checked ? 'transform' : 'generate';
  await saveCurrentMode();
  if (currentMode === 'transform') { $('generateMode').style.display = 'none'; $('transformMode').style.display = 'block'; $('generateBtn').innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Transform to Selected Style'; }
  else { $('generateMode').style.display = 'block'; $('transformMode').style.display = 'none'; $('generateBtn').innerHTML = '<i class="fa-solid fa-bolt"></i> Generate Content'; }
});

// ===============================================================================
// UNIFIED BUTTON HANDLER
// ===============================================================================
$('generateBtn').addEventListener('click', async () => { if (currentMode === 'transform') await handleTransform(); else await handleGenerate(); });

async function handleGenerate() {
  const applyToggle = $('applyToggle');
  const useStyle = applyToggle ? applyToggle.checked && selectedProfileId : false;
  const appliedProfile = useStyle ? savedProfiles.find(profile => profile.id === selectedProfileId) : null;
  const promptText = $('promptInput').value.trim();
  if (!promptText) { showToast('Please enter a prompt', 'fa-exclamation-triangle'); $('promptInput').focus(); return; }
  if (!user.apiKey) { showToast('Please set your API key in settings', 'fa-exclamation-triangle'); openSettings(); return; }
  $('generateBtn').disabled = true;
  $('generateBtn').innerHTML = `<span class="spinner-ring white"></span> Generating...`;
  $('resultsArea').classList.remove('visible');
  $('loadingRow').classList.add('visible');
  $('loadingText').textContent = useStyle ? `Applying "${appliedProfile.name}" style...` : 'Generating content...';
  try {
    let originalResults, styledResults;
    if (useStyle) {
      originalResults = await generateContent(promptText, null);
      styledResults = await generateContent(`Rewrite these items in the specified style:\n${originalResults.join('\n')}`, appliedProfile);
      promptHistory.push({ id: uid(), prompt: promptText, original: originalResults, styled: styledResults, styleApplied: true, styleName: appliedProfile.name, isTransform: false, timestamp: new Date().toISOString() });
      await savePromptHistory(); activePromptIndex = promptHistory.length - 1;
      $('loadingRow').classList.remove('visible');
      renderSideBySideWithData(originalResults, styledResults, appliedProfile.name);
    } else {
      originalResults = await generateContent(promptText, null);
      promptHistory.push({ id: uid(), prompt: promptText, original: originalResults, styleApplied: false, isTransform: false, timestamp: new Date().toISOString() });
      await savePromptHistory(); activePromptIndex = promptHistory.length - 1;
      $('loadingRow').classList.remove('visible');
      renderSingleWithData(originalResults);
    }
    renderHistory(); $('resultsArea').classList.add('visible');
    showToast('Content generated successfully', 'fa-check');
  } catch (error) {
    console.error('[Generate] Failed:', error);
    showToast(error.message.includes('API error') ? 'API request failed. Check your API key.' : 'Generation failed', 'fa-exclamation-triangle');
    $('loadingRow').classList.remove('visible');
  } finally {
    $('generateBtn').disabled = false;
    $('generateBtn').innerHTML = `<i class="fa-solid fa-bolt"></i> Generate Content`;
  }
}

async function handleTransform() {
  const inputText = $('transformInput').value.trim();
  if (!inputText) { showToast('Please paste text to transform', 'fa-exclamation-triangle'); $('transformInput').focus(); return; }
  if (!selectedProfileId) { showToast('Please select a style profile first', 'fa-exclamation-triangle'); return; }
  if (!user.apiKey) { showToast('Please set your API key in settings', 'fa-exclamation-triangle'); openSettings(); return; }
  const appliedProfile = savedProfiles.find(profile => profile.id === selectedProfileId);
  $('generateBtn').disabled = true;
  $('generateBtn').innerHTML = `<span class="spinner-ring white"></span> Transforming...`;
  $('resultsArea').classList.remove('visible');
  $('loadingRow').classList.add('visible');
  $('loadingText').textContent = `Applying "${appliedProfile.name}" style...`;
  try {
    const transformedText = await transformText(inputText, appliedProfile);
    promptHistory.push({ id: uid(), prompt: `Transform: ${inputText.substring(0, 100)}${inputText.length > 100 ? '...' : ''}`, original: [inputText], styled: [transformedText], styleApplied: true, styleName: appliedProfile.name, isTransform: true, timestamp: new Date().toISOString() });
    await savePromptHistory(); activePromptIndex = promptHistory.length - 1;
    $('loadingRow').classList.remove('visible');
    renderTransformResult(inputText, transformedText, appliedProfile.name);
    renderHistory(); $('resultsArea').classList.add('visible');
    showToast('Text transformed successfully', 'fa-check');
  } catch (error) {
    console.error('[Transform] Failed:', error);
    showToast(error.message.includes('API error') ? 'API request failed. Check your API key.' : 'Transformation failed', 'fa-exclamation-triangle');
    $('loadingRow').classList.remove('visible');
  } finally {
    $('generateBtn').disabled = false;
    $('generateBtn').innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Transform to Selected Style';
  }
}

function renderTransformResult(originalText, transformedText, profileName) {
  lastGeneratedOriginal = [originalText]; lastGeneratedStyled = [transformedText];
  $('resultItemsOriginal').innerHTML = ''; $('resultItemsStyled').innerHTML = '';
  const originalDiv = document.createElement('div'); originalDiv.className = 'result-item'; originalDiv.style.whiteSpace = 'pre-wrap'; originalDiv.textContent = originalText;
  const styledDiv = document.createElement('div'); styledDiv.className = 'result-item styled-item'; styledDiv.style.whiteSpace = 'pre-wrap'; styledDiv.style.animationDelay = '80ms'; styledDiv.textContent = transformedText;
  $('resultItemsOriginal').appendChild(originalDiv); $('resultItemsStyled').appendChild(styledDiv);
  $('resultsBoxSingle').style.display = 'none'; $('resultsSideBySide').style.display = 'grid';
  $('styleAppliedNote').style.display = 'flex'; $('styleAppliedText').textContent = `"${profileName}" style applied`;
}

function renderSingleWithData(items) {
  lastGeneratedOriginal = items; lastGeneratedStyled = [];
  $('resultItemsSingle').innerHTML = ''; $('resultCount').textContent = items.length;
  items.forEach((text, index) => $('resultItemsSingle').appendChild(makeItem(text, false, index * 35)));
  $('resultsBoxSingle').style.display = 'block'; $('resultsSideBySide').style.display = 'none'; $('styleAppliedNote').style.display = 'none';
}

function renderSideBySideWithData(originalItems, styledItems, profileName) {
  lastGeneratedOriginal = originalItems; lastGeneratedStyled = styledItems;
  $('resultItemsOriginal').innerHTML = ''; $('resultItemsStyled').innerHTML = '';
  const maxLength = Math.max(originalItems.length, styledItems.length);
  for (let i = 0; i < maxLength; i++) {
    if (i < originalItems.length) $('resultItemsOriginal').appendChild(makeItem(originalItems[i], false, i * 35));
    if (i < styledItems.length) $('resultItemsStyled').appendChild(makeItem(styledItems[i], true, i * 35 + 80));
  }
  $('resultsBoxSingle').style.display = 'none'; $('resultsSideBySide').style.display = 'grid';
  $('styleAppliedNote').style.display = 'flex'; $('styleAppliedText').textContent = `"${profileName}" applied`;
}

// ===============================================================================
// COPY
// ===============================================================================
$('copyBtnSingle').addEventListener('click', () => { if (!lastGeneratedOriginal.length) { showToast('No content to copy', 'fa-exclamation-triangle'); return; } navigator.clipboard.writeText(lastGeneratedOriginal.join('\n')); showToast('Copied', 'fa-check'); });
$('copyBtnOriginal').addEventListener('click', () => { if (!lastGeneratedOriginal.length) { showToast('No content to copy', 'fa-exclamation-triangle'); return; } navigator.clipboard.writeText(lastGeneratedOriginal.join('\n')); showToast('Original copied', 'fa-check'); });
$('copyBtnStyled').addEventListener('click', () => { if (!lastGeneratedStyled.length) { showToast('No styled content to copy', 'fa-exclamation-triangle'); return; } navigator.clipboard.writeText(lastGeneratedStyled.join('\n')); showToast('Styled results copied', 'fa-check'); });

// ===============================================================================
// FEATURE REQUEST
// ===============================================================================
$('featureRequestBtn').addEventListener('click', () => {
  const subject = encodeURIComponent('Voice Transformer - Feature Request');
  const body = encodeURIComponent(`Hi,\n\nI'd like to request the following feature:\n\n[Describe your feature request here]\n\n---\nApp Version: 1.0.0\nUser: ${user?.name || 'Unknown'}`);
  window.open(`mailto:sabasabamosa@gmail.com?subject=${subject}&body=${body}`, '_blank');
});

// ===============================================================================
// INITIALIZATION
// ===============================================================================
(async function startApp() {
  await loadAppData();
  if (!user) { user = { name: 'User', apiKey: '', avatarColor: AVATAR_COLORS[0], avatarImg: null }; await saveUser(); }
  await bootApp();
})();