import { formatDisplayText } from './format.js';
import { setupExport } from './features/export.js';
import { initAuth, signIn, signUp, signOutUser, getAuthToken, setAppFunctions, sendPasswordReset } from './auth.js';
import { initMetrics } from './features/metrics.js';
import { initRegistrationPopup } from './features/registration.js';
import { initAnimalSearch } from './features/animal-search.js';
import { initObjectives } from './features/objectives.js';

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
  const $forgotPasswordBtn = document.getElementById('forgot-password-btn');
  const $backToLoginBtn = document.getElementById('back-to-login-btn');
  const $authMessage = document.getElementById('auth-message');

  // Set up app functions for auth callbacks
  setAppFunctions(window.renderList, window.triggerSync);

  let isSignUp = false;
  let isPasswordReset = false;
  
  // Initialize UI state
  updateUI();

  // Toggle between sign in and sign up
  $signupBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    isSignUp = !isSignUp;
    isPasswordReset = false;
    updateUI();
    hideMessage();
  });

  // Toggle to password reset mode
  $forgotPasswordBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    isPasswordReset = true;
    isSignUp = false;
    updateUI();
    hideMessage();
  });

  // Back to login mode
  $backToLoginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    isPasswordReset = false;
    isSignUp = false;
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
    
    if (!email) {
      showMessage('Por favor ingresa tu email', 'error');
      return;
    }
    
    if (isPasswordReset) {
      showMessage('Enviando email de recuperación...', 'info');
      const result = await sendPasswordReset(email);
      
      if (result.success) {
        showMessage('¡Email enviado! Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contraseña.', 'success');
        // Reset to login mode after successful password reset
        setTimeout(() => {
          isPasswordReset = false;
          updateUI();
        }, 3000);
      } else {
        showMessage(getErrorMessage(result.error), 'error');
      }
      return;
    }
    
    if (!password && !isPasswordReset) {
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
    const $passwordField = document.getElementById('auth-password');
    const $signupSection = $signupBtn?.parentElement;
    const $forgotSection = $forgotPasswordBtn?.parentElement;
    const $backToLoginSection = document.getElementById('back-to-login-section');
    
    if (isPasswordReset) {
      $signinBtn.textContent = 'Enviar Email de Recuperación';
      $passwordField.style.display = 'none';
      $passwordField.removeAttribute('required'); // Remove required for password reset
      $signupSection.style.display = 'none';
      $forgotSection.style.display = 'none';
      $backToLoginSection.style.display = 'block';
    } else if (isSignUp) {
      $signinBtn.textContent = 'Crear Cuenta';
      $signupBtn.textContent = '¿Ya tienes cuenta? Inicia sesión';
      $passwordField.style.display = 'block';
      $passwordField.setAttribute('required', ''); // Add required for signup
      $signupSection.style.display = 'block';
      $forgotSection.style.display = 'block';
      $backToLoginSection.style.display = 'none';
    } else {
      $signinBtn.textContent = 'Iniciar Sesión';
      $signupBtn.textContent = 'Regístrate aquí';
      $passwordField.style.display = 'block';
      $passwordField.setAttribute('required', ''); // Add required for login
      $signupSection.style.display = 'block';
      $forgotSection.style.display = 'block';
      $backToLoginSection.style.display = 'none';
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
      'auth/too-many-requests': 'Demasiados intentos. Intenta más tarde',
      'auth/user-disabled': 'Esta cuenta ha sido deshabilitada',
      'auth/invalid-credential': 'Credenciales inválidas',
      'auth/operation-not-allowed': 'Operación no permitida',
      'auth/network-request-failed': 'Error de conexión. Verifica tu internet',
      'auth/too-many-requests': 'Demasiados intentos de recuperación. Intenta más tarde'
    };
    return messages[error] || 'Error: ' + error;
  }
}

// Navigation setup
let metricsInstance = null;
let registrationPopup = null;
let animalSearchInstance = null;
let objectivesInstance = null;

function setupNavigation() {
  const $metricsTab = document.getElementById('metrics-tab');
  const $cowsTab = document.getElementById('cows-tab');
  // const $pigsTab = document.getElementById('pigs-tab');
  const $searchTab = document.getElementById('search-tab');
  const $objectivesTab = document.getElementById('objectives-tab');
  const $metricsPage = document.getElementById('metrics-page');
  const $cowsPage = document.getElementById('cows-page');
  // const $pigsPage = document.getElementById('pigs-page');
  const $searchPage = document.getElementById('search-page');
  const $objectivesPage = document.getElementById('objectives-page');

  // Ensure initial state is correct
  if ($metricsPage) $metricsPage.removeAttribute('hidden');
  if ($cowsPage) $cowsPage.setAttribute('hidden', '');
  // if ($pigsPage) $pigsPage.setAttribute('hidden', '');
  if ($searchPage) $searchPage.setAttribute('hidden', '');
  if ($objectivesPage) $objectivesPage.setAttribute('hidden', '');

  // Initialize metrics and registration popup
  metricsInstance = initMetrics();
  registrationPopup = initRegistrationPopup();

  // Initialize animal search
  animalSearchInstance = initAnimalSearch();

  // Initialize objectives
  objectivesInstance = initObjectives();

  // Tab switching
  $metricsTab?.addEventListener('click', () => {
    $metricsTab.classList.add('active');
    $cowsTab?.classList.remove('active');
    // $pigsTab?.classList.remove('active');
    $searchTab?.classList.remove('active');
    $objectivesTab?.classList.remove('active');
    $metricsPage?.removeAttribute('hidden');
    $cowsPage?.setAttribute('hidden', '');
    // $pigsPage?.setAttribute('hidden', '');
    $searchPage?.setAttribute('hidden', '');
    $objectivesPage?.setAttribute('hidden', '');
    
    // Render metrics when switching to metrics tab
    if (metricsInstance) {
      metricsInstance.render();
    }
  });

  $cowsTab?.addEventListener('click', () => {
    $cowsTab.classList.add('active');
    $metricsTab?.classList.remove('active');
    // $pigsTab?.classList.remove('active');
    $searchTab?.classList.remove('active');
    $objectivesTab?.classList.remove('active');
    $cowsPage?.removeAttribute('hidden');
    $metricsPage?.setAttribute('hidden', '');
    // $pigsPage?.setAttribute('hidden', '');
    $searchPage?.setAttribute('hidden', '');
    $objectivesPage?.setAttribute('hidden', '');
    
    // Render records when switching to cows tab
    if (window.renderCowsList) {
      window.renderCowsList();
    }
  });

  /*
  $pigsTab?.addEventListener('click', () => {
    $pigsTab.classList.add('active');
    $metricsTab?.classList.remove('active');
    $cowsTab?.classList.remove('active');
    $searchTab?.classList.remove('active');
    $objectivesTab?.classList.remove('active');
    $pigsPage?.removeAttribute('hidden');
    $metricsPage?.setAttribute('hidden', '');
    $cowsPage?.setAttribute('hidden', '');
    $searchPage?.setAttribute('hidden', '');
    $objectivesPage?.setAttribute('hidden', '');
    
    // Render records when switching to pigs tab
    if (window.renderPigsList) {
      window.renderPigsList();
    }
  });
  */

  $searchTab?.addEventListener('click', () => {
    $searchTab.classList.add('active');
    $metricsTab?.classList.remove('active');
    $cowsTab?.classList.remove('active');
    // $pigsTab?.classList.remove('active');
    $objectivesTab?.classList.remove('active');
    $searchPage?.removeAttribute('hidden');
    $metricsPage?.setAttribute('hidden', '');
    $cowsPage?.setAttribute('hidden', '');
    // $pigsPage?.setAttribute('hidden', '');
    $objectivesPage?.setAttribute('hidden', '');
    
    // Perform initial search to show all animals
    if (animalSearchInstance) {
      animalSearchInstance.performSearch();
    }
  });

  $objectivesTab?.addEventListener('click', () => {
    $objectivesTab.classList.add('active');
    $metricsTab?.classList.remove('active');
    $cowsTab?.classList.remove('active');
    // $pigsTab?.classList.remove('active');
    $searchTab?.classList.remove('active');
    $objectivesPage?.removeAttribute('hidden');
    $metricsPage?.setAttribute('hidden', '');
    $cowsPage?.setAttribute('hidden', '');
    // $pigsPage?.setAttribute('hidden', '');
    $searchPage?.setAttribute('hidden', '');
    
    // Render objectives when switching to objectives tab
    if (objectivesInstance) {
      objectivesInstance.render('objectives-container');
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
  window.animalSearchInstance = animalSearchInstance;
  window.objectivesInstance = objectivesInstance;
}

export { formatDisplayText, getAuthToken };


