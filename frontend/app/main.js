import { formatDisplayText } from './format.js';
import { setupExport } from './features/export.js';
import { initAuth, signIn, signUp, signOutUser, getAuthToken, setAppFunctions } from './auth.js';
import { initMetrics } from './features/metrics.js';
import { initRegistrationPopup } from './features/registration.js';

// Load existing application logic (initialization, UI, sync, listeners)
import '../app.js';

// Initialize Firebase auth and wire up auth UI
document.addEventListener('DOMContentLoaded', () => {
  setupExport();
  setupAuthUI();
  setupNavigation();
  initAuth();
});

function setupAuthUI() {
  const $authForm = document.getElementById('auth-form');
  const $signinBtn = document.getElementById('signin-btn');
  const $signupBtn = document.getElementById('signup-btn');
  const $authMessage = document.getElementById('auth-message');

  // Set up app functions for auth callbacks
  setAppFunctions(window.renderList, window.triggerSync);

  let isSignUp = false;

  // Toggle between sign in and sign up
  $signupBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    updateUI();
    hideMessage();
  });

  // Sign out button
  const $signoutBtn = document.getElementById('signout-btn');
  $signoutBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    const result = await signOutUser();
    if (!result.success) {
      showMessage('Error al cerrar sesión', 'error');
    }
  });

  // Form submission
  $authForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    
    if (!email || !password) {
      showMessage('Por favor completa todos los campos', 'error');
      return;
    }
    
    showMessage('Procesando...', 'info');
    
    const result = isSignUp ? await signUp(email, password) : await signIn(email, password);
    
    if (result.success) {
      showMessage(isSignUp ? '¡Cuenta creada! Iniciando sesión...' : '¡Bienvenido!', 'success');
    } else {
      showMessage(getErrorMessage(result.error), 'error');
    }
  });

  function updateUI() {
    if (isSignUp) {
      $signinBtn.textContent = 'Crear Cuenta';
      $signupBtn.textContent = '¿Ya tienes cuenta? Inicia sesión';
    } else {
      $signinBtn.textContent = 'Iniciar Sesión';
      $signupBtn.textContent = 'Regístrate aquí';
    }
  }

  function showMessage(message, type) {
    if ($authMessage) {
      $authMessage.textContent = message;
      $authMessage.hidden = false;
      $authMessage.style.backgroundColor = type === 'error' ? '#fee' : type === 'success' ? '#efe' : '#eef';
      $authMessage.style.color = type === 'error' ? '#c33' : type === 'success' ? '#363' : '#336';
    }
  }

  function hideMessage() {
    if ($authMessage) {
      $authMessage.hidden = true;
    }
  }

  function getErrorMessage(error) {
    const messages = {
      'auth/user-not-found': 'No existe una cuenta con este email',
      'auth/wrong-password': 'Contraseña incorrecta',
      'auth/email-already-in-use': 'Ya existe una cuenta con este email',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
      'auth/invalid-email': 'Email inválido',
      'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde'
    };
    return messages[error] || 'Error: ' + error;
  }
}

// Navigation setup
let metricsInstance = null;
let registrationPopup = null;

function setupNavigation() {
  const $metricsTab = document.getElementById('metrics-tab');
  const $cowsTab = document.getElementById('cows-tab');
  const $pigsTab = document.getElementById('pigs-tab');
  const $metricsPage = document.getElementById('metrics-page');
  const $cowsPage = document.getElementById('cows-page');
  const $pigsPage = document.getElementById('pigs-page');

  // Ensure initial state is correct
  if ($metricsPage) $metricsPage.removeAttribute('hidden');
  if ($cowsPage) $cowsPage.setAttribute('hidden', '');
  if ($pigsPage) $pigsPage.setAttribute('hidden', '');

  // Initialize metrics and registration popup
  metricsInstance = initMetrics();
  registrationPopup = initRegistrationPopup();

  // Tab switching
  $metricsTab?.addEventListener('click', () => {
    $metricsTab.classList.add('active');
    $cowsTab?.classList.remove('active');
    $pigsTab?.classList.remove('active');
    $metricsPage?.removeAttribute('hidden');
    $cowsPage?.setAttribute('hidden', '');
    $pigsPage?.setAttribute('hidden', '');
    
    // Render metrics when switching to metrics tab
    if (metricsInstance) {
      metricsInstance.render();
    }
  });

  $cowsTab?.addEventListener('click', () => {
    $cowsTab.classList.add('active');
    $metricsTab?.classList.remove('active');
    $pigsTab?.classList.remove('active');
    $cowsPage?.removeAttribute('hidden');
    $metricsPage?.setAttribute('hidden', '');
    $pigsPage?.setAttribute('hidden', '');
    
    // Render records when switching to cows tab
    if (window.renderCowsList) {
      window.renderCowsList();
    }
  });

  $pigsTab?.addEventListener('click', () => {
    $pigsTab.classList.add('active');
    $metricsTab?.classList.remove('active');
    $cowsTab?.classList.remove('active');
    $pigsPage?.removeAttribute('hidden');
    $metricsPage?.setAttribute('hidden', '');
    $cowsPage?.setAttribute('hidden', '');
    
    // Render records when switching to pigs tab
    if (window.renderPigsList) {
      window.renderPigsList();
    }
  });

  // Initial render of metrics and records
  if (metricsInstance) {
    metricsInstance.render();
  }
  
  // Also ensure records are loaded initially
  if (window.renderList) {
    window.renderList();
  }

  // Setup registration popup callbacks
  if (registrationPopup) {
    registrationPopup.onSuccess(() => {
      // Refresh both lists and metrics when registration succeeds
      if (window.renderList) window.renderList();
      if (window.triggerSync) window.triggerSync();
      if (window.refreshMetrics) window.refreshMetrics();
    });
  }

  // Expose instances globally for app.js
  window.metricsInstance = metricsInstance;
  window.registrationPopup = registrationPopup;
}

export { formatDisplayText, getAuthToken };


