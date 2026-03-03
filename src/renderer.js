// ===============================================================================
// CONSTANTS
// ===============================================================================
const AVATAR_COLORS = ['#4f3ff0','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#64748b'];
const STORAGE_PREFIX = 'salesgrok_'; // Using your app name as prefix

// ===============================================================================
// APP STATE - All initialized to null/empty (will be loaded from storage)
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
// STORAGE FUNCTIONS (using localStorage)
// ===============================================================================
async function loadAppData() {
  try {
    // Load from localStorage
    const userData = localStorage.getItem(`${STORAGE_PREFIX}user`);
    user = userData ? JSON.parse(userData) : null;
    
    const profilesData = localStorage.getItem(`${STORAGE_PREFIX}profiles`);
    savedProfiles = profilesData ? JSON.parse(profilesData) : [];
    
    const historyData = localStorage.getItem(`${STORAGE_PREFIX}history`);
    promptHistory = historyData ? JSON.parse(historyData) : [];
    
    const modeData = localStorage.getItem(`${STORAGE_PREFIX}mode`);
    currentMode = modeData || 'generate';
    
    console.log('[Storage] Data loaded:', { 
      user: !!user, 
      profiles: savedProfiles.length,
      history: promptHistory.length,
      mode: currentMode
    });
  } catch (error) {
    console.error('[Storage] Failed to load data:', error);
    user = null;
    savedProfiles = [];
    promptHistory = [];
    currentMode = 'generate';
  }
}

const saveUser = async () => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}user`, JSON.stringify(user));
    console.log('[Storage] User saved');
  } catch (error) {
    console.error('[Storage] Failed to save user:', error);
  }
};

const saveProfiles = async () => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}profiles`, JSON.stringify(savedProfiles));
    console.log('[Storage] Profiles saved');
  } catch (error) {
    console.error('[Storage] Failed to save profiles:', error);
  }
};

const savePromptHistory = async () => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}history`, JSON.stringify(promptHistory));
    console.log('[Storage] History saved');
  } catch (error) {
    console.error('[Storage] Failed to save history:', error);
  }
};

const saveCurrentMode = async () => {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}mode`, currentMode);
  } catch (error) {
    console.error('[Storage] Failed to save mode:', error);
  }
};

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

function getInitial(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

// ===============================================================================
// SCREEN TRANSITIONS
// ===============================================================================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(screen => {
    if (screen.id === screenId) {
      screen.classList.remove('exit');
      screen.classList.add('active');
    } else {
      screen.classList.remove('active');
      screen.classList.add('exit');
      setTimeout(() => screen.classList.remove('exit'), 400);
    }
  });
}

// ===============================================================================
// AVATAR COLOUR SWATCHES
// ===============================================================================
function buildSwatches(containerId, getColor, setColor, onPick) {
  const swatchContainer = $(containerId);
  swatchContainer.innerHTML = '';
  AVATAR_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch' + (getColor() === color ? ' active' : '');
    swatch.style.background = color;
    swatch.title = color;
    swatch.addEventListener('click', () => {
      setColor(color);
      buildSwatches(containerId, getColor, setColor, onPick);
      onPick(color);
    });
    swatchContainer.appendChild(swatch);
  });
}

function applyAvatarStyle(element, color, imageData, initial) {
  element.style.background = imageData ? 'transparent' : color;
  const imageElement = element.querySelector('img');
  const initialElement = element.querySelector('span') || element.querySelector('[id*="Initial"]');
  if (imageData) { 
    imageElement.src = imageData; 
    imageElement.style.display = 'block'; 
    if(initialElement) initialElement.style.display='none'; 
  }
  else { 
    imageElement.src=''; 
    imageElement.style.display='none'; 
    if(initialElement){ 
      initialElement.style.display=''; 
      initialElement.textContent = initial; 
    } 
  }
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
      $('generateBtn').innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Transform to My Style';
    } else {
      $('generateMode').style.display = 'block';
      $('transformMode').style.display = 'none';
      $('generateBtn').innerHTML = '<i class="fa-solid fa-bolt"></i> Generate Content';
    }
  }
  
  renderHistory();
  renderSavedProfiles();
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
  buildSwatches('settingsSwatches',
    () => settingsAvatarColor,
    color => { settingsAvatarColor = color; settingsAvatarImgData = null; },
    color => { applyAvatarStyle($('settingsAvatarLg'), color, null, getInitial($('settingsName').value)); $('settingsAvatarInitial').textContent = getInitial($('settingsName').value); }
  );
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
  
  // Clear all localStorage items with prefix
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
    const transformBadge = item.isTransform ? '<span style="background: #10b981; color: #fff; font-size: 8px; padding: 2px 5px; border-radius: 3px; margin-left: 4px; font-weight: 700;">TRANSFORM</span>' : '';

    promptDiv.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <span style="flex: 1; cursor: pointer;">${escHtml(truncatedPrompt)}${transformBadge}</span>
        <button class="history-delete-btn" data-id="${item.id}" data-prompt="${escHtml(item.prompt)}" style="background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:11px; padding:2px 4px; border-radius:4px; transition:color .15s,background .15s; line-height:1;" title="Delete">
          <i class="fa-solid fa-trash-can" style="font-size: 12px;"></i>
        </button>
      </div>
      <i class="fa-solid fa-arrow-right arrow"></i>
    `;
    
    promptDiv.querySelector('span').addEventListener('click', () => { 
      activePromptIndex = index;
      $('promptInput').value = item.prompt;
      
      if (item.styleApplied) {
        renderSideBySideWithData(item.original, item.styled, item.styleName);
      } else {
        renderSingleWithData(item.original);
      }
      
      $('resultsArea').classList.add('visible');
      renderHistory($('searchInput').value); 
    });
    
    promptDiv.querySelector('.history-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openHistoryDeleteConfirm(item.id, item.prompt);
    });
    
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
  freshProfile = null;
  currentFileText = null;

  console.log('[File] Parsing .docx:', file.name);
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    currentFileText = result.value.trim();
    
    console.log('[File] Extracted:', currentFileText.length, 'characters');
    console.log('[File] Word count:', currentFileText.split(/\s+/).filter(word => word.length > 0).length);
    
    if (result.messages && result.messages.length > 0) {
      console.warn('[File] Warnings:', result.messages);
    }
    
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

  1. FIRST IMPRESSION (1 sentence):
  What's the immediate feel of this writing?

  2. TONE ANALYSIS:
  - Is it formal or casual? Professional or friendly?
  - Is it urgent, calm, excited, measured?
  - Does the tone shift? Give examples.

  3. VOCABULARY ANALYSIS:
  - What types of words dominate? (simple, technical, descriptive, abstract)
  - Are there any distinctive word choices or repeated phrases?
  - What's the reading level? (easy, moderate, advanced)

  4. SENTENCE ARCHITECTURE:
  - Average sentence length? (short/medium/long)
  - Do they vary length or stay consistent?
  - How do they start sentences? Any patterns?
  - Do they use questions, exclamations, or statements?

  5. VOICE & PERSONALITY:
  - Active ("I think") or Passive ("it is thought")?
  - First person ("I"), second ("you"), or third?
  - What personality traits emerge? (confident, hesitant, warm, cold, authoritative, humble)

  6. PATTERNS & TICS:
  - Any recurring phrases? ("honestly", "basically", "in fact")
  - Preferred punctuation? (lots of commas, dashes, parentheses)
  - How do they transition between ideas?

  7. WHAT'S ABSENT:
  What do they NEVER do? (no jargon, no contractions, no humor, etc.)

  Now, based on this analysis, return a JSON object with these exact keys:

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

  IMPORTANT:
  - Be specific and detailed, not generic
  - Reference actual evidence from the text
  - Don't just list categories, describe the style
  - Return ONLY valid JSON, no other text

  Analysis:`;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid API response structure');
    }
    
    const content = data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('No valid JSON found in response');
    }
    
    const profile = JSON.parse(jsonMatch[0]);
    
    const requiredFields = ['tone', 'vocabulary', 'sentenceStyle', 'voice', 'personality'];
    const missingFields = requiredFields.filter(field => !profile[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    profile.analyzedAt = new Date().toISOString();
    profile.textLength = text.length;
    profile.wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    
    return profile;
    
  } catch (error) {
    console.error('[analyzeWritingStyle] Error:', error);
    throw error;
  }
}

$('analyseBtn').addEventListener('click', async () => {
  if (!currentFileText) {
    showToast('No document text available', 'fa-exclamation-triangle');
    return;
  }

  $('analyseBtn').disabled = true;
  $('analyseBtn').innerHTML = `<span class="spinner-ring" style="width:13px;height:13px;border-color:rgba(79,63,240,.15);border-top-color:var(--brand);display:inline-block;"></span>&nbsp;Analysing...`;
  $('freshAnalysis').classList.remove('visible');

  console.log('[Analysis] Starting');
  console.log('[Analysis] Text length:', currentFileText.length);

  try {
    freshProfile = await analyzeWritingStyle(currentFileText);
    
    console.log('[Analysis] Complete');

    const truncate = (str, max = 50) => {
      if (!str) return 'N/A';
      return str.length > max ? str.substring(0, max) + '...' : str;
    };
    
    $('traitTone').textContent = truncate(freshProfile.tone);
    $('traitVocab').textContent = truncate(freshProfile.vocabulary);
    $('traitSentence').textContent = truncate(freshProfile.sentenceStyle);
    $('traitVoice').textContent = truncate(freshProfile.voice);
    $('traitPersonality').textContent = truncate(freshProfile.personality);
    
    $('profileNameInput').value = '';
    $('freshAnalysis').classList.add('visible');
    showToast('Analysis complete', 'fa-chart-bar');

  } catch (error) {
    console.error('[Analysis] Failed:', error);
    
    let errorMessage = 'Analysis failed';
    if (error.message.includes('API error')) {
      errorMessage = 'API request failed. Check your API key.';
    } else if (error.message.includes('JSON')) {
      errorMessage = 'Failed to parse results';
    }
    
    showToast(errorMessage, 'fa-exclamation-triangle');
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
  
  if (!name) {
    $('profileNameInput').focus();
    $('profileNameInput').style.borderColor = '#ef4444';
    setTimeout(() => $('profileNameInput').style.borderColor = '', 1200);
    return;
  }
  
  if (!freshProfile) {
    showToast('No profile to save', 'fa-exclamation-triangle');
    return;
  }

  const profile = {
    id: uid(),
    name,
    date: todayLabel(),
    tone: freshProfile.tone,
    vocabulary: freshProfile.vocabulary,
    sentenceStyle: freshProfile.sentenceStyle,
    voice: freshProfile.voice,
    personality: freshProfile.personality,
    patterns: freshProfile.patterns,
    avoid: freshProfile.avoid,
    signature: freshProfile.signature,
    example: freshProfile.example,
    analyzedAt: freshProfile.analyzedAt,
    textLength: freshProfile.textLength,
    wordCount: freshProfile.wordCount
  };

  savedProfiles.push(profile);
  await saveProfiles();
  renderSavedProfiles();
  selectProfile(profile.id);
  
  $('freshAnalysis').classList.remove('visible');
  freshProfile = null;
  
  console.log('[Profile] Saved:', profile.name);
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
    
    const getDisplayValue = (value, fallback = 'Unknown') => {
      if (!value || value === 'undefined') return fallback;
      return value.length > 10 ? value.substring(0, 10) + '...' : value;
    };
    
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
          <button class="spc-del-btn" data-id="${p.id}" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
      <div class="spc-traits">
        <span class="spc-trait-pill">${tone}</span>
        <span class="spc-trait-pill">${vocab}</span>
        <span class="spc-trait-pill">${sentence}</span>
        <span class="spc-trait-pill">${voice}</span>
        <span class="spc-trait-pill">${personality}</span>
      </div>`;
    
    card.addEventListener('click', e => {
      if (e.target.closest('.spc-del-btn')) return;
      selectProfile(p.id);
    });
    
    card.querySelector('.spc-del-btn').addEventListener('click', e => {
      e.stopPropagation();
      openDeleteConfirm(p.id, p.name);
    });
    
    list.appendChild(card);
  });
  
  if (selectedProfileId && savedProfiles.find(p => p.id === selectedProfileId)) {
    $('applyRow').classList.add('visible');
  }
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
// DELETE CONFIRM
// ===============================================================================
function openDeleteConfirm(profileId, profileName) {
  pendingDeleteId = profileId;
  pendingDeleteType = 'profile';
  $('confirmProfileName').textContent = `"${profileName}"`;
  $('confirmOverlay').classList.add('visible');
}

$('confirmCancel').addEventListener('click', () => {
  $('confirmOverlay').classList.remove('visible');
  pendingDeleteId = null;
  pendingDeleteType = null;
});

$('confirmDelete').addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  
  if (pendingDeleteType === 'history') {
    const deletedIndex = promptHistory.findIndex(item => item.id === pendingDeleteId);
    if (deletedIndex !== -1) {
      promptHistory = promptHistory.filter(item => item.id !== pendingDeleteId);
      await savePromptHistory();
      
      if (activePromptIndex !== null) {
        if (deletedIndex === promptHistory.length) {
          activePromptIndex = promptHistory.length - 1;
        } else if (deletedIndex < activePromptIndex) {
          activePromptIndex--;
        } else if (deletedIndex === activePromptIndex) {
          activePromptIndex = null;
          $('resultsArea').classList.remove('visible');
        }
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
  
  pendingDeleteId = null;
  pendingDeleteType = null;
  $('confirmOverlay').classList.remove('visible');
});

$('confirmOverlay').addEventListener('click', event => {
  if (event.target === $('confirmOverlay')) {
    $('confirmOverlay').classList.remove('visible');
    pendingDeleteId = null;
    pendingDeleteType = null;
  }
});

// ===============================================================================
// GENERATE WITH HISTORY SAVING
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

    Generate content that matches this exact writing style. Return ONLY a JSON array of strings.
    Example: ["item 1", "item 2", "item 3"]`
        : `You are a helpful content generator. Return ONLY a JSON array of strings.
    Example: ["item 1", "item 2", "item 3"]`;

  const userPrompt = `Generate content based on this request:

  ${prompt}

  Return the results as a JSON array of strings. Generate at least 10-15 items.`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${user.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: styleProfile ? 0.7 : 0.5,
      max_tokens: 2000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid API response structure');
  }
  
  const content = data.choices[0].message.content;
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  
  if (!jsonMatch) {
    throw new Error('No valid JSON array found in response');
  }
  
  const generatedItems = JSON.parse(jsonMatch[0]);
  
  if (!Array.isArray(generatedItems) || generatedItems.length === 0) {
    throw new Error('Invalid response format: expected non-empty array');
  }
  
  return generatedItems;
}

// ===============================================================================
// TRANSFORM EXISTING TEXT
// ===============================================================================
async function transformText(inputText, styleProfile) {
  if (!styleProfile) {
    throw new Error('No style profile selected');
  }

  const systemPrompt = `You are an expert at rewriting text to match specific writing styles while preserving the original meaning and key information.

  STYLE PROFILE TO MATCH:
  - Tone: ${styleProfile.tone}
  - Vocabulary: ${styleProfile.vocabulary}
  - Sentence Style: ${styleProfile.sentenceStyle}
  - Voice: ${styleProfile.voice}
  - Personality: ${styleProfile.personality}

  ${styleProfile.patterns ? `Writing Patterns: ${styleProfile.patterns}` : ''}
  ${styleProfile.avoid ? `Things to Avoid: ${styleProfile.avoid}` : ''}
  ${styleProfile.signature ? `Signature Style: ${styleProfile.signature}` : ''}

  Your task: Rewrite the user's text to match this exact writing style while:
  1. Preserving all key information and meaning
  2. Maintaining the same length (roughly)
  3. Matching the tone, vocabulary, and sentence patterns
  4. Applying the personality traits

  Return ONLY the rewritten text, nothing else.`;

  const userPrompt = `Rewrite this text in the specified style:

  ${inputText}`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${user.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 3000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid API response structure');
  }
  
  return data.choices[0].message.content.trim();
}

// ===============================================================================
// MODE TOGGLE - Generate vs Transform
// ===============================================================================
$('modeToggle').addEventListener('change', async (e) => {
  currentMode = e.target.checked ? 'transform' : 'generate';
  
  await saveCurrentMode();
  
  if (currentMode === 'transform') {
    $('generateMode').style.display = 'none';
    $('transformMode').style.display = 'block';
    $('generateBtn').innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Transform to My Style';
    console.log('[Mode] Switched to Transform');
  } else {
    $('generateMode').style.display = 'block';
    $('transformMode').style.display = 'none';
    $('generateBtn').innerHTML = '<i class="fa-solid fa-bolt"></i> Generate Content';
    console.log('[Mode] Switched to Generate');
  }
});

// ===============================================================================
// UNIFIED BUTTON HANDLER
// ===============================================================================
$('generateBtn').addEventListener('click', async () => {
  if (currentMode === 'transform') {
    await handleTransform();
  } else {
    await handleGenerate();
  }
});

async function handleGenerate() {
  const applyToggle = $('applyToggle');
  const useStyle = applyToggle ? applyToggle.checked && selectedProfileId : false;
  const appliedProfile = useStyle ? savedProfiles.find(profile => profile.id === selectedProfileId) : null;
  const promptText = $('promptInput').value.trim();
  
  if (!promptText) {
    showToast('Please enter a prompt', 'fa-exclamation-triangle');
    $('promptInput').focus();
    return;
  }
  
  if (!user.apiKey) {
    showToast('Please set your API key in settings', 'fa-exclamation-triangle');
    openSettings();
    return;
  }
  
  $('generateBtn').disabled = true;
  $('generateBtn').innerHTML = `<span class="spinner-ring white"></span> Generating...`;
  $('resultsArea').classList.remove('visible');
  $('loadingRow').classList.add('visible');
  
  if (useStyle) {
    $('loadingText').textContent = `Applying "${appliedProfile.name}" style...`;
    console.log('[Generate] Using style:', appliedProfile.name);
  } else {
    $('loadingText').textContent = 'Generating content...';
    console.log('[Generate] No style applied');
  }
  
  try {
    let originalResults, styledResults;
    
    if (useStyle) {
      console.log('[Generate] Step 1: Original content');
      originalResults = await generateContent(promptText, null);
      
      console.log('[Generate] Step 2: Applying style');
      styledResults = await generateContent(
        `Rewrite these items in the specified style:\n${originalResults.join('\n')}`,
        appliedProfile
      );
      
      console.log('[Generate] Complete:', originalResults.length, 'items');
      
      const historyEntry = {
        id: uid(),
        prompt: promptText,
        original: originalResults,
        styled: styledResults,
        styleApplied: true,
        styleName: appliedProfile.name,
        isTransform: false,
        timestamp: new Date().toISOString()
      };
      
      promptHistory.push(historyEntry);
      await savePromptHistory();
      activePromptIndex = promptHistory.length - 1;
      
      $('loadingRow').classList.remove('visible');
      renderSideBySideWithData(originalResults, styledResults, appliedProfile.name);
      
    } else {
      console.log('[Generate] Generating content');
      originalResults = await generateContent(promptText, null);
      
      console.log('[Generate] Complete:', originalResults.length, 'items');
      
      const historyEntry = {
        id: uid(),
        prompt: promptText,
        original: originalResults,
        styleApplied: false,
        isTransform: false,
        timestamp: new Date().toISOString()
      };
      
      promptHistory.push(historyEntry);
      await savePromptHistory();
      activePromptIndex = promptHistory.length - 1;
      
      $('loadingRow').classList.remove('visible');
      renderSingleWithData(originalResults);
    }
    
    renderHistory();
    $('resultsArea').classList.add('visible');
    showToast('Content generated successfully', 'fa-check');
    
    const autoClose = $('autoClose');
    if (autoClose && autoClose.checked) {
      await delay(500);
      showToast('Window would close now', 'fa-xmark');
    }
    
  } catch (error) {
    console.error('[Generate] Failed:', error);
    
    let errorMessage = 'Generation failed';
    if (error.message.includes('API error')) {
      errorMessage = 'API request failed. Check your API key.';
    } else if (error.message.includes('JSON')) {
      errorMessage = 'Failed to parse generated content';
    }
    
    showToast(errorMessage, 'fa-exclamation-triangle');
    $('loadingRow').classList.remove('visible');
    
  } finally {
    $('generateBtn').disabled = false;
    $('generateBtn').innerHTML = `<i class="fa-solid fa-bolt"></i> Generate Content`;
  }
}

async function handleTransform() {
  const inputText = $('transformInput').value.trim();
  
  if (!inputText) {
    showToast('Please paste text to transform', 'fa-exclamation-triangle');
    $('transformInput').focus();
    return;
  }
  
  if (!selectedProfileId) {
    showToast('Please select a style profile first', 'fa-exclamation-triangle');
    return;
  }
  
  if (!user.apiKey) {
    showToast('Please set your API key in settings', 'fa-exclamation-triangle');
    openSettings();
    return;
  }
  
  const appliedProfile = savedProfiles.find(profile => profile.id === selectedProfileId);
  
  $('generateBtn').disabled = true;
  $('generateBtn').innerHTML = `<span class="spinner-ring white"></span> Transforming...`;
  $('resultsArea').classList.remove('visible');
  $('loadingRow').classList.add('visible');
  $('loadingText').textContent = `Applying "${appliedProfile.name}" style...`;
  
  console.log('[Transform] Starting');
  console.log('[Transform] Input length:', inputText.length);
  
  try {
    const transformedText = await transformText(inputText, appliedProfile);
    
    console.log('[Transform] Complete');
    console.log('[Transform] Output length:', transformedText.length);
    
    const historyEntry = {
      id: uid(),
      prompt: `Transform: ${inputText.substring(0, 100)}${inputText.length > 100 ? '...' : ''}`,
      original: [inputText],
      styled: [transformedText],
      styleApplied: true,
      styleName: appliedProfile.name,
      isTransform: true,
      timestamp: new Date().toISOString()
    };
    
    promptHistory.push(historyEntry);
    await savePromptHistory();
    activePromptIndex = promptHistory.length - 1;
    
    $('loadingRow').classList.remove('visible');
    renderTransformResult(inputText, transformedText, appliedProfile.name);
    
    renderHistory();
    $('resultsArea').classList.add('visible');
    showToast('Text transformed successfully', 'fa-check');
    
  } catch (error) {
    console.error('[Transform] Failed:', error);
    
    let errorMessage = 'Transformation failed';
    if (error.message.includes('API error')) {
      errorMessage = 'API request failed. Check your API key.';
    } else if (error.message.includes('No style profile')) {
      errorMessage = 'Please select a style profile first';
    }
    
    showToast(errorMessage, 'fa-exclamation-triangle');
    $('loadingRow').classList.remove('visible');
    
  } finally {
    $('generateBtn').disabled = false;
    $('generateBtn').innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Transform to My Style';
  }
}

function renderTransformResult(originalText, transformedText, profileName) {
  lastGeneratedOriginal = [originalText];
  lastGeneratedStyled = [transformedText];
  
  $('resultItemsOriginal').innerHTML = '';
  $('resultItemsStyled').innerHTML = '';
  
  const originalDiv = document.createElement('div');
  originalDiv.className = 'result-item';
  originalDiv.style.whiteSpace = 'pre-wrap';
  originalDiv.textContent = originalText;
  
  const styledDiv = document.createElement('div');
  styledDiv.className = 'result-item styled-item';
  styledDiv.style.whiteSpace = 'pre-wrap';
  styledDiv.style.animationDelay = '80ms';
  styledDiv.textContent = transformedText;
  
  $('resultItemsOriginal').appendChild(originalDiv);
  $('resultItemsStyled').appendChild(styledDiv);
  
  $('resultsBoxSingle').style.display = 'none';
  $('resultsSideBySide').style.display = 'grid';
  $('styleAppliedNote').style.display = 'flex';
  $('styleAppliedText').textContent = `"${profileName}" style applied`;
}

function renderSingleWithData(items) {
  lastGeneratedOriginal = items;
  lastGeneratedStyled = [];
  $('resultItemsSingle').innerHTML = '';
  $('resultCount').textContent = items.length;
  items.forEach((text, index) => $('resultItemsSingle').appendChild(makeItem(text, false, index * 35)));
  $('resultsBoxSingle').style.display = 'block';
  $('resultsSideBySide').style.display = 'none';
  $('styleAppliedNote').style.display = 'none';
}

function renderSideBySideWithData(originalItems, styledItems, profileName) {
  lastGeneratedOriginal = originalItems;
  lastGeneratedStyled = styledItems;
  $('resultItemsOriginal').innerHTML = '';
  $('resultItemsStyled').innerHTML = '';
  
  const maxLength = Math.max(originalItems.length, styledItems.length);
  
  for (let i = 0; i < maxLength; i++) {
    if (i < originalItems.length) {
      $('resultItemsOriginal').appendChild(makeItem(originalItems[i], false, i * 35));
    }
    if (i < styledItems.length) {
      $('resultItemsStyled').appendChild(makeItem(styledItems[i], true, i * 35 + 80));
    }
  }
  
  $('resultsBoxSingle').style.display = 'none';
  $('resultsSideBySide').style.display = 'grid';
  $('styleAppliedNote').style.display = 'flex';
  $('styleAppliedText').textContent = `"${profileName}" applied`;
}

// ===============================================================================
// COPY
// ===============================================================================
$('copyBtnSingle').addEventListener('click', () => {
  if (lastGeneratedOriginal.length === 0) {
    showToast('No content to copy', 'fa-exclamation-triangle');
    return;
  }
  navigator.clipboard.writeText(lastGeneratedOriginal.join('\n'));
  showToast('Copied', 'fa-check');
});

$('copyBtnOriginal').addEventListener('click', () => {
  if (lastGeneratedOriginal.length === 0) {
    showToast('No content to copy', 'fa-exclamation-triangle');
    return;
  }
  navigator.clipboard.writeText(lastGeneratedOriginal.join('\n'));
  showToast('Original copied', 'fa-check');
});

$('copyBtnStyled').addEventListener('click', () => {
  if (lastGeneratedStyled.length === 0) {
    showToast('No styled content to copy', 'fa-exclamation-triangle');
    return;
  }
  navigator.clipboard.writeText(lastGeneratedStyled.join('\n'));
  showToast('Styled results copied', 'fa-check');
});

// ===============================================================================
// FEATURE REQUEST BUTTON
// ===============================================================================
$('featureRequestBtn').addEventListener('click', () => {
  const requestUrl = buildFeatureRequestUrl();
  window.open(requestUrl, '_blank');
});

function buildFeatureRequestUrl() {
  const subject = encodeURIComponent('Voice Transformer - Feature Request');
  const body = encodeURIComponent(`Hi,

  I'd like to request the following feature:

  [Describe your feature request here]

  ---
  App Version: 1.0.0
  User: ${user?.name || 'Unknown'}`);
  
  return `mailto:featurerequest.scholarflux@gmail.com?subject=${subject}&body=${body}`;
}

// ===============================================================================
// INITIALIZATION
// ===============================================================================

// Properly initialize the app with stored data
(async function startApp() {
  console.log('[Init] Loading stored data...');
  
  // Load all data from localStorage
  await loadAppData();
  
  console.log('[Init] Data loaded:', { 
    hasUser: !!user, 
    profiles: savedProfiles.length,
    history: promptHistory.length,
    mode: currentMode 
  });
  
  // If no user exists, create a default one
  if (!user) {
    console.log('[Init] No user data, creating default user');
    user = {
      name: 'User',
      apiKey: '',
      avatarColor: AVATAR_COLORS[0],
      avatarImg: null
    };
    await saveUser();
  }
  
  // Always boot to main app
  console.log('[Init] Starting app');
  await bootApp();
  showScreen('screenApp');
})();