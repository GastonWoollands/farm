const API_BASE_URL = 'https://farm-production-d087.up.railway.app';
// const API_BASE_URL = 'http://localhost:8000';
const ENDPOINT_VALIDATE = '/validate-key';
const ENDPOINT_REGISTER = '/register';
const DEFAULT_PREFIX = 'AC988';
const DEFAULT_FATHER_PREFIX = '';

import { addRecord, getRecords, markAsSynced, deleteRecord, getRecentSynced } from './db.js';
import { getAuthToken } from './app/auth.js';

// Elements
const $auth = document.getElementById('auth-screen');
const $app = document.getElementById('app-screen');
const $keyForm = document.getElementById('key-form');
const $keyInput = document.getElementById('user-key');
const $keyError = document.getElementById('key-error');
const $keyDebug = document.getElementById('key-debug');
const $toggleKey = document.getElementById('toggle-key');
// Cows elements
const $registerCowBtn = document.getElementById('register-cow-btn');
const $registerCowSection = document.getElementById('register-cow-section');
const $inlineAddCow = document.getElementById('inline-add-cow');
const $inlineAnimalCow = document.getElementById('inline-animal-cow');
const $inlineMotherCow = document.getElementById('inline-mother-cow');
const $inlineFatherCow = document.getElementById('inline-father-cow');
const $inlineBornCow = document.getElementById('inline-born-cow');
const $inlineWeightCow = document.getElementById('inline-weight-cow');
const $inlineGenderCow = document.getElementById('inline-gender-cow');
const $inlineStatusCow = document.getElementById('inline-status-cow');
const $inlineColorCow = document.getElementById('inline-color-cow');
const $inlineNotesCow = document.getElementById('inline-notes-cow');
const $inlineNotesMotherCow = document.getElementById('inline-notes-mother-cow');

// Pigs elements
/*
const $registerPigBtn = document.getElementById('register-pig-btn');
const $registerPigSection = document.getElementById('register-pig-section');
const $inlineAddPig = document.getElementById('inline-add-pig');
const $inlineAnimalPig = document.getElementById('inline-animal-pig');
const $inlineMotherPig = document.getElementById('inline-mother-pig');
const $inlineBornPig = document.getElementById('inline-born-pig');
const $inlineWeightPig = document.getElementById('inline-weight-pig');
const $inlineGenderPig = document.getElementById('inline-gender-pig');
const $inlineStatusPig = document.getElementById('inline-status-pig');
const $inlineColorPig = document.getElementById('inline-color-pig');
const $inlineNotesPig = document.getElementById('inline-notes-pig');
const $inlineNotesMotherPig = document.getElementById('inline-notes-mother-pig');
*/
const $dialog = document.getElementById('register-dialog');
const $registerForm = document.getElementById('register-form');
// Get records element when needed
function getRecordsElement() {
  return document.getElementById('records');
}

function getCowsRecordsElement() {
  return document.getElementById('cows-records');
}

/*
function getPigsRecordsElement() {
  return document.getElementById('pigs-records');
}
*/
const $statusBadge = document.getElementById('status-badge');
const $syncStatus = document.getElementById('sync-status');
const $apiBase = document.getElementById('api-base');
const $pendingCount = document.getElementById('pending-count');
const $manageSyncedBtn = document.getElementById('manage-synced');
const $manageSyncedDialog = document.getElementById('manage-synced-dialog');
const $manageSyncedList = document.getElementById('manage-synced-list');
const $toast = document.getElementById('toast');
const $exportCsv = document.getElementById('export-csv');
const $exportDialog = document.getElementById('export-dialog');
const $exportStartModal = document.getElementById('export-start-modal');
const $exportEndModal = document.getElementById('export-end-modal');
const $exportConfirm = document.getElementById('export-confirm');
const $exportCancel = document.getElementById('export-cancel');

// Sync state must be initialized before any triggerSync() execution
let syncInFlight = false;

// Local storage keys (legacy - now using Firebase auth)
const LS_USER_KEY = 'farm:userKey';

// Helper function to format display text with proper capitalization
function formatDisplayText(text) {
  if (!text) return text;
  return text.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

// Register service worker for asset caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js');
  });
}

function setOnlineUi(online) {
  $statusBadge.textContent = online ? 'Online' : 'Offline';
  $statusBadge.classList.toggle('online', !!online);
}

window.addEventListener('online', () => { setOnlineUi(true); triggerSync(); });
window.addEventListener('offline', () => setOnlineUi(false));
setOnlineUi(navigator.onLine);

// Render API base for quick diagnostics
$apiBase.textContent = API_BASE_URL;

// Screen flow
init();

async function init() {
  // Auth is now handled by Firebase auth state listener in auth.js
  // This function is kept for compatibility but auth.js will control the flow
}

function showAuth() {
  $auth.hidden = false;
  $app.hidden = true;
}

function showApp() {
  $auth.hidden = true;
  $app.hidden = false;
}

// Key validation flow
$keyForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = ($keyInput.value || '').trim();
  $keyError.hidden = true;
  $keyDebug.hidden = true;
  if (!key) return;
  try {
    const url = API_BASE_URL + ENDPOINT_VALIDATE;
    const payload = { key };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    const dbg = {
      request: { url, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload },
      response: { status: res.status, statusText: res.statusText, body: text }
    };
    if (!res.ok) {
      $keyError.textContent = `Validation failed (HTTP ${res.status}).`;
      $keyError.hidden = false;
      $keyDebug.textContent = JSON.stringify(dbg, null, 2);
      $keyDebug.hidden = false;
      return;
    }
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    if (json?.valid === true) {
      localStorage.setItem(LS_USER_KEY, key);
      showApp();
      renderList();
      triggerSync();
    } else {
      $keyError.textContent = 'Invalid key. Please try again.';
      $keyError.hidden = false;
      $keyDebug.textContent = JSON.stringify(dbg, null, 2);
      $keyDebug.hidden = false;
    }
  } catch (err) {
    $keyError.textContent = 'Unable to validate. Check connection or key.';
    $keyError.hidden = false;
    $keyDebug.textContent = String(err);
    $keyDebug.hidden = false;
  }
});

// Toggle show/hide key
$toggleKey?.addEventListener('click', () => {
  const isPw = $keyInput.type === 'password';
  $keyInput.type = isPw ? 'text' : 'password';
  $toggleKey.textContent = isPw ? 'Hide' : 'Show';
  $toggleKey.setAttribute('aria-label', isPw ? 'Hide key' : 'Show key');
  $keyInput.focus();
});

// Toggle cow register form visibility
$registerCowBtn?.addEventListener('click', () => {
  const isHidden = $registerCowSection.hidden;
  $registerCowSection.hidden = !isHidden;
  if (!isHidden) return;
  // Prefill both animal and mother id with defau convenience
  if ($inlineAnimalCow) $inlineAnimalCow.value = DEFAULT_PREFIX;
  if ($inlineMotherCow) $inlineMotherCow.value = DEFAULT_PREFIX;
  if ($inlineFatherCow) $inlineFatherCow.value = '';
  // Set default date to today
  if ($inlineBornCow) $inlineBornCow.value = new Date().toISOString().split('T')[0];
  $inlineAnimalCow?.focus();
});

// Toggle pig register form visibility
/*
$registerPigBtn?.addEventListener('click', () => {
  const isHidden = $registerPigSection.hidden;
  $registerPigSection.hidden = !isHidden;
  if (!isHidden) return;
  // Prefill both animal and mother id with default prefix for convenience
  if ($inlineAnimalPig) $inlineAnimalPig.value = DEFAULT_PREFIX;
  if ($inlineMotherPig) $inlineMotherPig.value = DEFAULT_PREFIX;
  // Set default date to today
  if ($inlineBornPig) $inlineBornPig.value = new Date().toISOString().split('T')[0];
  $inlineAnimalPig?.focus();
});
*/

// Save new cow record locally and attempt sync
async function handleAddCow(number) {
  const n = (number || '').trim().toUpperCase();
  if (!n) return;
  const userKey = getAuthToken(); // Use Firebase token instead of stored key
  const motherVal = ($inlineMotherCow?.value || '').trim().toUpperCase() || null;
  const fatherVal = ($inlineFatherCow?.value || '').trim().toUpperCase() || null;
  const bornVal = ($inlineBornCow?.value || '').trim() || null;
  const weightVal = $inlineWeightCow?.value ? parseFloat($inlineWeightCow.value) : null;
  const genderVal = ($inlineGenderCow?.value || '').toUpperCase() || null;
  const statusVal = ($inlineStatusCow?.value || '').toUpperCase() || null;
  const colorVal = ($inlineColorCow?.value || '').toUpperCase() || null;
  const notesVal = ($inlineNotesCow?.value || '').trim().toUpperCase() || null;
  const notesMotherVal = ($inlineNotesMotherCow?.value || '').trim().toUpperCase() || null;
  const record = {
    animalNumber: n,
    animalType: 1, // 1 = cow
    userKey,
    motherId: motherVal,
    fatherId: fatherVal,
    bornDate: bornVal,
    weight: (weightVal !== null && !isNaN(weightVal) && isFinite(weightVal)) ? weightVal : null,
    gender: genderVal,
    status: statusVal,
    color: colorVal,
    notes: notesVal,
    notesMother: notesMotherVal,
  };
  await addRecord(record);
  await renderCowsList();
  triggerSync();
  // Refresh metrics when new record is added
  window.refreshMetrics();
}

// Save new pig record locally and attempt sync
/*
async function handleAddPig(number) {
  const n = (number || '').trim().toUpperCase();
  if (!n) return;
  const userKey = getAuthToken(); // Use Firebase token instead of stored key
  const motherVal = ($inlineMotherPig?.value || '').trim().toUpperCase() || null;
  const bornVal = ($inlineBornPig?.value || '').trim() || null;
  const weightVal = $inlineWeightPig?.value ? parseFloat($inlineWeightPig.value) : null;
  const genderVal = ($inlineGenderPig?.value || '').toUpperCase() || null;
  const statusVal = ($inlineStatusPig?.value || '').toUpperCase() || null;
  const colorVal = ($inlineColorPig?.value || '').toUpperCase() || null;
  const notesVal = ($inlineNotesPig?.value || '').trim().toUpperCase() || null;
  const notesMotherVal = ($inlineNotesMotherPig?.value || '').trim().toUpperCase() || null;
  const record = {
    animalNumber: n,
    animalType: 2, // 2 = pig
    userKey,
    motherId: motherVal,
    bornDate: bornVal,
    weight: (weightVal !== null && !isNaN(weightVal) && isFinite(weightVal)) ? weightVal : null,
    gender: genderVal,
    status: statusVal,
    color: colorVal,
    notes: notesVal,
    notesMother: notesMotherVal,
  };
  await addRecord(record);
  await renderPigsList();
  triggerSync();
  // Refresh metrics when new record is added
  window.refreshMetrics();
}
*/

// Cow form submission
$inlineAddCow?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleAddCow($inlineAnimalCow.value);
  // Always restore suggested prefixes for rapid multiple entries
  $inlineAnimalCow.value = DEFAULT_PREFIX;
  if ($inlineMotherCow) $inlineMotherCow.value = DEFAULT_PREFIX;
  if ($inlineFatherCow) $inlineFatherCow.value = '';
  if ($inlineBornCow) $inlineBornCow.value = new Date().toISOString().split('T')[0];
  if ($inlineWeightCow) $inlineWeightCow.value = '';
  if ($inlineGenderCow) $inlineGenderCow.value = '';
  if ($inlineStatusCow) $inlineStatusCow.value = 'ALIVE';
  if ($inlineColorCow) $inlineColorCow.value = '';
  if ($inlineNotesCow) $inlineNotesCow.value = '';
  if ($inlineNotesMotherCow) $inlineNotesMotherCow.value = '';
  $inlineAnimalCow.focus();
});

// Pig form submission
/*
$inlineAddPig?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleAddPig($inlineAnimalPig.value);
  // Always restore suggested prefixes for rapid multiple entries
  $inlineAnimalPig.value = DEFAULT_PREFIX;
  if ($inlineMotherPig) $inlineMotherPig.value = DEFAULT_PREFIX;
  if ($inlineBornPig) $inlineBornPig.value = new Date().toISOString().split('T')[0];
  if ($inlineWeightPig) $inlineWeightPig.value = '';
  if ($inlineGenderPig) $inlineGenderPig.value = '';
  if ($inlineStatusPig) $inlineStatusPig.value = 'ALIVE';
  if ($inlineColorPig) $inlineColorPig.value = '';
  if ($inlineNotesPig) $inlineNotesPig.value = '';
  if ($inlineNotesMotherPig) $inlineNotesMotherPig.value = '';
  $inlineAnimalPig.focus();
});
*/

// Prevent Enter from submitting the form; use it to move to next field
function setupFormNavigation(form) {
  form?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    // Only intercept on inputs/selects/textarea, not on buttons
    const isField = target.matches('input, select, textarea');
    if (!isField) return;
    // Allow multiline entry in textarea with Shift+Enter (none used now), otherwise navigate
    e.preventDefault();
    const fields = Array.from(form.querySelectorAll('input, select, textarea'))
      .filter(el => !el.hasAttribute('disabled'));
    const idx = fields.indexOf(target);
    const nextIdx = (idx + 1) % fields.length;
    const next = fields[nextIdx];
    if (next && next instanceof HTMLElement) {
      next.focus();
      if (next instanceof HTMLInputElement && next.type === 'text') {
        next.select();
      }
    }
  });
}

// Setup form navigation for both forms
setupFormNavigation($inlineAddCow);
// setupFormNavigation($inlineAddPig);

// Render cows list from DB
async function renderCowsList() {
  const all = await getRecords();
  const cows = all.filter(r => r.animalType === 1);
  const $records = getCowsRecordsElement();
  if (!$records) {
    console.error('Cows records element not found!');
    return;
  }
  
  $records.innerHTML = '';
  for (const r of cows.sort((a,b) => (b.id||0)-(a.id||0))) {
    const li = document.createElement('li');
    li.dataset.id = r.id;
    const left = document.createElement('div');
    left.textContent = formatDisplayText(r.animalNumber) + '';
    const right = document.createElement('div');
    right.textContent = r.synced ? 'Synced' : 'Pending';
    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = '×';
    del.title = 'Delete';
    del.setAttribute('aria-label', 'Delete');
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = r.id;
      // If synced, attempt server delete first
      const userKey = getAuthToken();
      if (r.synced && userKey) {
        try {
          await fetch(API_BASE_URL + '/register', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userKey}` },
            body: JSON.stringify({ animalNumber: r.animalNumber, createdAt: r.createdAt })
          });
        } catch (e) { /* ignore network errors, still remove locally */ }
      }
      await withUndo(async () => deleteRecord(id), async () => {}, `Deleted ${r.animalNumber}`);
      await renderCowsList();
      // Refresh metrics when record is deleted
      window.refreshMetrics();
    });
    const rightWrap = document.createElement('div');
    rightWrap.className = 'row gap';
    rightWrap.appendChild(right);
    rightWrap.appendChild(del);
    li.appendChild(left);
    li.appendChild(rightWrap);
    $records.appendChild(li);
  }
  const pending = all.filter(r => !r.synced).length;
  $pendingCount.textContent = pending > 0 ? `(pending: ${pending})` : '';
}

// Render pigs list from DB - commented out
/*
async function renderPigsList() {
  // Function commented out for cows-only mode
}
*/

// Legacy renderList function for backward compatibility
async function renderList() {
  await renderCowsList();
}

// Sync logic: send unsynced to backend when online
async function triggerSync(force = false) {
  if (syncInFlight) return; // prevent overlap
  if (!navigator.onLine && !force) return;
  const userKey = getAuthToken(); // Use Firebase token
  if (!userKey) return;
  try {
    syncInFlight = true;
    const unsynced = await getRecords({ unsyncedOnly: true });
    $syncStatus.textContent = unsynced.length ? `Syncing ${unsynced.length}...` : 'Idle';
    for (const r of unsynced) {
      try {
        const res = await fetch(API_BASE_URL + ENDPOINT_REGISTER, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userKey}` },
          body: JSON.stringify({
            animalNumber: r.animalNumber,
            createdAt: r.createdAt,
            motherId: r.motherId ?? null,
            bornDate: r.bornDate ?? null,
            weight: r.weight ?? null,
            gender: r.gender ?? null,
            status: r.status ?? null,
            color: r.color ?? null,
            notes: r.notes ?? null,
            notesMother: r.notesMother ?? null,
          })
        });
        if (res.ok) {
          await markAsSynced(r.id);
          await renderList();
        } else {
          // continue syncing other items, but keep status note
          console.warn('Sync failed for record', r.id, res.status);
        }
      } catch (err) {
        console.warn('Network error during sync for record', r.id, err);
      }
    }
  } finally {
    syncInFlight = false;
    const remaining = await getRecords({ unsyncedOnly: true });
    $syncStatus.textContent = remaining.length ? `Pending ${remaining.length}` : 'Idle';
  }
}

// Expose for debugging in console
window.__farm = { triggerSync };
window.renderList = renderList;
window.renderCowsList = renderCowsList;
// window.renderPigsList = renderPigsList;
window.triggerSync = triggerSync;

// Global function to refresh metrics (called from main.js)
window.refreshMetrics = () => {
  if (window.metricsInstance) {
    window.metricsInstance.render();
  }
};

// Manage Synced dialog render
function renderManageSyncedList(records) {
  $manageSyncedList.innerHTML = '';
  for (const r of records) {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.textContent = `${r.id} • ${formatDisplayText(r.animalNumber)}`;
    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = '×';
    del.title = 'Delete';
    del.setAttribute('aria-label', 'Delete');
    del.addEventListener('click', async () => {
      await deleteRecord(r.id);
      await renderList();
      const refreshed = await getRecentSynced(1000);
      renderManageSyncedList(refreshed);
    });
    const rightWrap = document.createElement('div');
    rightWrap.className = 'row gap';
    rightWrap.appendChild(del);
    li.appendChild(left);
    li.appendChild(rightWrap);
    $manageSyncedList.appendChild(li);
  }
}

$manageSyncedBtn?.addEventListener('click', async () => {
  const all = await getRecords();
  const synced = (all || []).filter(r => r && r.synced === true).sort((a,b)=>(b.id||0)-(a.id||0));
  renderManageSyncedList(synced);
  $manageSyncedDialog.showModal();
});

// Minimal toast with optional undo
let toastTimer;
async function withUndo(doAction, undoAction, message) {
  clearTimeout(toastTimer);
  $toast.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = message;
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Undo';
  btn.addEventListener('click', async () => {
    try { await undoAction(); } finally { hideToast(); }
  });
  $toast.appendChild(span);
  $toast.appendChild(btn);
  $toast.hidden = false;
  try {
    await doAction();
  } finally {
    toastTimer = setTimeout(hideToast, 3000);
  }
}

function hideToast() {
  $toast.hidden = true;
}

async function exportData(format) {
  const userKey = getAuthToken();
  if (!userKey) return;
  const params = new URLSearchParams();
  if (format === 'csv') params.set('format', 'csv');
  const startDate = ($exportStartModal && $exportStartModal.value) ? $exportStartModal.value : '';
  const endDate = ($exportEndModal && $exportEndModal.value) ? $exportEndModal.value : '';
  if (startDate) params.set('start', startDate);
  if (endDate) params.set('end', endDate);
  const url = API_BASE_URL + '/export' + (params.toString() ? `?${params}` : '');
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${userKey}` } });
  if (!res.ok) {
    withUndo(async()=>{}, async()=>{}, `Export failed (${res.status})`);
    return;
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = 'export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

$exportCsv?.addEventListener('click', () => {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  
  // Calculate one month ago for start date
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const oneMonthAgoStr = `${oneMonthAgo.getFullYear()}-${String(oneMonthAgo.getMonth() + 1).padStart(2, '0')}-${String(oneMonthAgo.getDate()).padStart(2, '0')}`;
  
  // Set default values
  if ($exportStartModal && !$exportStartModal.value) $exportStartModal.value = oneMonthAgoStr;
  if ($exportEndModal && !$exportEndModal.value) $exportEndModal.value = todayStr;
  
  // Cap max dates to today
  if ($exportStartModal) $exportStartModal.max = todayStr;
  if ($exportEndModal) $exportEndModal.max = todayStr;
  
  $exportDialog?.showModal();
});

$exportConfirm?.addEventListener('click', (e) => {
  e.preventDefault();
  exportData('csv');
  $exportDialog?.close();
});

$exportCancel?.addEventListener('click', (e) => {
  e.preventDefault();
  $exportDialog?.close();
});

