const API_BASE_URL = 'https://farm-production-d087.up.railway.app';
const ENDPOINT_VALIDATE = '/validate-key';
const ENDPOINT_REGISTER = '/register';
const DEFAULT_PREFIX = 'AC988';

import { addRecord, getRecords, markAsSynced, deleteRecord, getRecentSynced } from './db.js';

// Elements
const $auth = document.getElementById('auth-screen');
const $app = document.getElementById('app-screen');
const $keyForm = document.getElementById('key-form');
const $keyInput = document.getElementById('user-key');
const $keyError = document.getElementById('key-error');
const $keyDebug = document.getElementById('key-debug');
const $toggleKey = document.getElementById('toggle-key');
const $registerBtn = document.getElementById('register-btn');
const $registerSection = document.getElementById('register-section');
const $inlineAdd = document.getElementById('inline-add');
const $inlineAnimal = document.getElementById('inline-animal');
const $inlineMother = document.getElementById('inline-mother');
const $inlineBorn = document.getElementById('inline-born');
const $inlineWeight = document.getElementById('inline-weight');
const $inlineGender = document.getElementById('inline-gender');
const $inlineStatus = document.getElementById('inline-status');
const $inlineColor = document.getElementById('inline-color');
const $inlineNotes = document.getElementById('inline-notes');
const $inlineNotesMother = document.getElementById('inline-notes-mother');
const $dialog = document.getElementById('register-dialog');
const $registerForm = document.getElementById('register-form');
const $records = document.getElementById('records');
const $statusBadge = document.getElementById('status-badge');
const $syncStatus = document.getElementById('sync-status');
const $apiBase = document.getElementById('api-base');
const $pendingCount = document.getElementById('pending-count');
const $manageSyncedBtn = document.getElementById('manage-synced');
const $manageSyncedDialog = document.getElementById('manage-synced-dialog');
const $manageSyncedList = document.getElementById('manage-synced-list');
const $toast = document.getElementById('toast');
const $exportJson = document.getElementById('export-json');
const $exportCsv = document.getElementById('export-csv');

// Sync state must be initialized before any triggerSync() execution
let syncInFlight = false;

// Local storage keys
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
  const existingKey = localStorage.getItem(LS_USER_KEY);
  if (existingKey) {
    showApp();
    renderList();
    triggerSync();
  } else {
    showAuth();
  }
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

// Toggle register form visibility
$registerBtn?.addEventListener('click', () => {
  const isHidden = $registerSection.hidden;
  $registerSection.hidden = !isHidden;
  if (!isHidden) return;
  // Prefill both animal and mother id with default prefix for convenience
  if ($inlineAnimal) $inlineAnimal.value = DEFAULT_PREFIX;
  if ($inlineMother) $inlineMother.value = DEFAULT_PREFIX;
  $inlineAnimal?.focus();
});

// Save new record locally and attempt sync
async function handleAdd(number) {
  const n = (number || '').trim().toUpperCase();
  if (!n) return;
  const userKey = localStorage.getItem(LS_USER_KEY);
  const motherVal = ($inlineMother?.value || '').trim().toUpperCase() || null;
  let bornVal = ($inlineBorn?.value || '').trim() || null;
  // Convert dd/mm/aaaa -> yyyy-mm-dd
  if (bornVal) {
    const m = bornVal.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/);
    if (m) {
      const dd = m[1].padStart(2, '0');
      const mm = m[2].padStart(2, '0');
      const yyyy = m[3];
      bornVal = `${yyyy}-${mm}-${dd}`;
    }
  }
  const weightVal = $inlineWeight?.value ? parseFloat($inlineWeight.value) : null;
  const genderVal = ($inlineGender?.value || '').toUpperCase() || null;
  const statusVal = ($inlineStatus?.value || '').toUpperCase() || null;
  const colorVal = ($inlineColor?.value || '').toUpperCase() || null;
  const notesVal = ($inlineNotes?.value || '').trim().toUpperCase() || null;
  const notesMotherVal = ($inlineNotesMother?.value || '').trim().toUpperCase() || null;
  const record = {
    animalNumber: n,
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
  await renderList();
  triggerSync();
}

// Inline add
$inlineAdd?.addEventListener('submit', async (e) => {
  e.preventDefault();
  await handleAdd($inlineAnimal.value);
  // Always restore suggested prefixes for rapid multiple entries
  $inlineAnimal.value = DEFAULT_PREFIX;
  if ($inlineMother) $inlineMother.value = DEFAULT_PREFIX;
  if ($inlineBorn) $inlineBorn.value = '';
  if ($inlineWeight) $inlineWeight.value = '';
  if ($inlineGender) $inlineGender.value = '';
  if ($inlineStatus) $inlineStatus.value = '';
  if ($inlineColor) $inlineColor.value = '';
  if ($inlineNotes) $inlineNotes.value = '';
  if ($inlineNotesMother) $inlineNotesMother.value = '';
  $inlineAnimal.focus();
});

// Prevent Enter from submitting the form; use it to move to next field
$inlineAdd?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return;
  // Only intercept on inputs/selects/textarea, not on buttons
  const isField = target.matches('input, select, textarea');
  if (!isField) return;
  // Allow multiline entry in textarea with Shift+Enter (none used now), otherwise navigate
  e.preventDefault();
  const fields = Array.from($inlineAdd.querySelectorAll('input, select, textarea'))
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

// Render list from DB
async function renderList() {
  const all = await getRecords();
  $records.innerHTML = '';
  for (const r of all.sort((a,b) => (b.id||0)-(a.id||0))) {
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
      const userKey = localStorage.getItem(LS_USER_KEY);
      if (r.synced && userKey) {
        try {
          await fetch(API_BASE_URL + '/register', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'X-User-Key': userKey },
            body: JSON.stringify({ animalNumber: r.animalNumber, createdAt: r.createdAt })
          });
        } catch (e) { /* ignore network errors, still remove locally */ }
      }
      await withUndo(async () => deleteRecord(id), async () => {}, `Deleted ${r.animalNumber}`);
      await renderList();
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

// Sync logic: send unsynced to backend when online
async function triggerSync(force = false) {
  if (syncInFlight) return; // prevent overlap
  if (!navigator.onLine && !force) return;
  const userKey = localStorage.getItem(LS_USER_KEY);
  if (!userKey) return;
  try {
    syncInFlight = true;
    const unsynced = await getRecords({ unsyncedOnly: true });
    $syncStatus.textContent = unsynced.length ? `Syncing ${unsynced.length}...` : 'Idle';
    for (const r of unsynced) {
      try {
        const res = await fetch(API_BASE_URL + ENDPOINT_REGISTER, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-User-Key': userKey },
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
  const userKey = localStorage.getItem(LS_USER_KEY);
  if (!userKey) return;
  const url = API_BASE_URL + '/export' + (format === 'csv' ? '?format=csv' : '');
  const res = await fetch(url, { headers: { 'X-User-Key': userKey } });
  if (!res.ok) {
    withUndo(async()=>{}, async()=>{}, `Export failed (${res.status})`);
    return;
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = format === 'csv' ? 'export.csv' : 'export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

$exportJson?.addEventListener('click', () => exportData('json'));
$exportCsv?.addEventListener('click', () => exportData('csv'));

