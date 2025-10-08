import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let currentUser = null;
let authToken = null;

// Initialize auth state listener
export function initAuth() {
  if (!window.firebaseAuth) {
    console.error('Firebase Auth not initialized');
    return;
  }

  onAuthStateChanged(window.firebaseAuth, async (user) => {
    currentUser = user;
    if (user) {
      authToken = await user.getIdToken();
      showApp();
      renderList();
      triggerSync();
      // Show sign out button
      const $signoutBtn = document.getElementById('signout-btn');
      if ($signoutBtn) $signoutBtn.style.display = 'block';
    } else {
      authToken = null;
      showAuth();
      // Hide sign out button
      const $signoutBtn = document.getElementById('signout-btn');
      if ($signoutBtn) $signoutBtn.style.display = 'none';
    }
  });
}

// Get current auth token for API calls
export function getAuthToken() {
  return authToken;
}

// Get current user
export function getCurrentUser() {
  return currentUser;
}

// Sign in with email/password
export async function signIn(email, password) {
  try {
    await signInWithEmailAndPassword(window.firebaseAuth, email, password);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Sign up with email/password
export async function signUp(email, password) {
  try {
    await createUserWithEmailAndPassword(window.firebaseAuth, email, password);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Sign out
export async function signOutUser() {
  try {
    await signOut(window.firebaseAuth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// UI functions (these will be called from main.js)
function showAuth() {
  const $auth = document.getElementById('auth-screen');
  const $app = document.getElementById('app-screen');
  if ($auth) $auth.hidden = false;
  if ($app) $app.hidden = true;
}

function showApp() {
  const $auth = document.getElementById('auth-screen');
  const $app = document.getElementById('app-screen');
  if ($auth) $auth.hidden = true;
  if ($app) $app.hidden = false;
}

// These will be set by main.js
let renderList, triggerSync;
export function setAppFunctions(renderListFn, triggerSyncFn) {
  renderList = renderListFn;
  triggerSync = triggerSyncFn;
}
