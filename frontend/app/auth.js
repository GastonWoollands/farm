import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

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
      
      // Initialize company context after authentication
      if (window.initCompanyContext) {
        await window.initCompanyContext();
      }
      
      renderList();
      triggerSync();
      
      // Show sign out button and company info
      const $signoutBtn = document.getElementById('signout-btn');
      const $companyInfo = document.getElementById('company-info');
      if ($signoutBtn) $signoutBtn.style.display = 'block';
      if ($companyInfo) $companyInfo.style.display = 'block';
    } else {
      authToken = null;
      showAuth();
      
      // Hide sign out button and company info
      const $signoutBtn = document.getElementById('signout-btn');
      const $companyInfo = document.getElementById('company-info');
      if ($signoutBtn) $signoutBtn.style.display = 'none';
      if ($companyInfo) $companyInfo.style.display = 'none';
    }
  });
}

// Get current auth token for API calls
export async function getAuthToken() {
  if (!currentUser) {
    return null;
  }
  
  try {
    // Refresh the token to ensure it's valid
    const token = await currentUser.getIdToken(true); // Force refresh
    authToken = token;
    return token;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
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

// Send password reset email
export async function sendPasswordReset(email) {
  try {
    console.log('Sending password reset email to:', email);
    console.log('Firebase Auth instance:', window.firebaseAuth);
    
    await sendPasswordResetEmail(window.firebaseAuth, email);
    console.log('Password reset email sent successfully');
    return { success: true };
  } catch (error) {
    console.error('Password reset error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
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
