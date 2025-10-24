/**
 * Company Context Management
 * Handles user company information and company switching
 */

import { getAuthToken } from './auth.js';

// Get API_BASE_URL from the global scope (defined in app.js)
const API_BASE_URL = window.API_BASE_URL || 'http://localhost:8000';

let currentUserContext = null;
let availableCompanies = [];
let currentCompanyId = null;

/**
 * Load user context from backend
 */
export async function loadUserContext() {
  try {
    const token = await getAuthToken();
    if (!token) {
      console.error('No auth token available');
      return null;
    }

    const response = await fetch(`${API_BASE_URL}/user-context/context`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Failed to load user context:', response.status);
      return null;
    }

    const context = await response.json();
    currentUserContext = context;
    currentCompanyId = context.company.id;
    
    return context;
  } catch (error) {
    console.error('Error loading user context:', error);
    return null;
  }
}

/**
 * Load available companies for the user
 */
export async function loadAvailableCompanies() {
  try {
    const token = await getAuthToken();
    if (!token) {
      console.error('No auth token available');
      return [];
    }

    const response = await fetch(`${API_BASE_URL}/user-context/companies`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Failed to load companies:', response.status);
      return [];
    }

    const data = await response.json();
    availableCompanies = data.companies || [];
    
    console.log('Available companies loaded:', availableCompanies);
    return data;
  } catch (error) {
    console.error('Error loading companies:', error);
    return { companies: [], can_switch_companies: false };
  }
}

/**
 * Get current user context
 */
export function getUserContext() {
  return currentUserContext;
}

/**
 * Get current company ID
 */
export function getCurrentCompanyId() {
  return currentCompanyId;
}

/**
 * Get available companies
 */
export function getAvailableCompanies() {
  return availableCompanies;
}

/**
 * Check if user can switch companies
 */
export function canSwitchCompanies() {
  return currentUserContext?.permissions?.can_manage_companies || false;
}

/**
 * Check if user has a company
 */
export function hasCompany() {
  return currentUserContext?.company?.has_company || false;
}

/**
 * Get current company name
 */
export function getCurrentCompanyName() {
  if (!currentUserContext?.company?.has_company) {
    return 'Personal Data';
  }
  return currentUserContext.company.name || 'Unknown Company';
}

/**
 * Switch to a different company (for admin users)
 */
export async function switchCompany(companyId) {
  if (!canSwitchCompanies()) {
    console.warn('User cannot switch companies');
    return false;
  }

  // For now, we'll just update the local state
  // In a real implementation, you might want to store this in localStorage
  // or have the backend track the current company selection
  currentCompanyId = companyId;
  
  // Update the UI
  updateCompanyUI();
  
  // Trigger data refresh
  if (window.triggerSync) {
    window.triggerSync();
  }
  
  return true;
}

/**
 * Update company UI elements
 */
export function updateCompanyUI() {
  const companyNameElement = document.getElementById('current-company-name');
  const companySwitcherElement = document.getElementById('company-switcher');
  
  if (companyNameElement) {
    const companyName = getCurrentCompanyName();
    companyNameElement.textContent = companyName;
  }
  
  if (companySwitcherElement) {
    // Update the dropdown selection
    const options = companySwitcherElement.querySelectorAll('option');
    options.forEach(option => {
      option.selected = option.value === currentCompanyId?.toString();
    });
  }
}

/**
 * Initialize company context
 */
export async function initCompanyContext() {
  // Load user context
  const context = await loadUserContext();
  if (!context) {
    console.error('Failed to load user context, cannot initialize company context');
    return;
  }
  
  // Load available companies
  await loadAvailableCompanies();
  
  // Update UI
  updateCompanyUI();
  
  // Setup company switcher if user can switch
  setupCompanySwitcher();
}

/**
 * Setup company switcher dropdown
 */
function setupCompanySwitcher() {
  const companySwitcher = document.getElementById('company-switcher');
  if (!companySwitcher || !canSwitchCompanies()) {
    return;
  }

  // Clear existing options
  companySwitcher.innerHTML = '';

  // Add current company option
  if (hasCompany()) {
    const currentOption = document.createElement('option');
    currentOption.value = currentCompanyId;
    currentOption.textContent = getCurrentCompanyName();
    currentOption.selected = true;
    companySwitcher.appendChild(currentOption);
  }

  // Add other companies
  availableCompanies.forEach(company => {
    if (company.id !== currentCompanyId) {
      const option = document.createElement('option');
      option.value = company.id;
      option.textContent = company.name;
      companySwitcher.appendChild(option);
    }
  });

  // Add event listener for company switching
  companySwitcher.addEventListener('change', (e) => {
    const selectedCompanyId = parseInt(e.target.value);
    if (selectedCompanyId !== currentCompanyId) {
      switchCompany(selectedCompanyId);
    }
  });
}

/**
 * Get API headers with current company context
 */
export function getApiHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };

  // Add company context if user has a company
  if (hasCompany() && currentCompanyId) {
    headers['X-Company-ID'] = currentCompanyId.toString();
  }

  return headers;
}

/**
 * Make API call with company context
 */
export async function apiCall(url, options = {}) {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('No auth token available');
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    ...getApiHeaders(),
    ...options.headers
  };

  return fetch(url, {
    ...options,
    headers
  });
}
