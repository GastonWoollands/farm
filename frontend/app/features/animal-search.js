import { getRecords, deleteRecord } from '../../db.js';
import { getAuthToken } from '../auth.js';

// Get API base URL
const API_BASE_URL = window.API_BASE_URL_OVERRIDE || 'http://localhost:8000';

/**
 * Normalize string data for database storage
 * @param {string} value - The string value to normalize
 * @returns {string|null} - Normalized string or null if empty
 */
function normalizeString(value) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
}

/**
 * Animal Search Module
 * Provides comprehensive search functionality for the dedicated search tab
 */
export class AnimalSearch {
  constructor() {
    this.searchBar = null;
    this.resultsContainer = null;
    this.currentQuery = '';
    this.debounceTimer = null;
    this.debounceDelay = 300;
    this.currentPage = 1;
    this.pageSize = 10;
  }

  /**
   * Initialize the search interface
   */
  init() {
    this.createSearchInterface();
    this.setupEventListeners();
    
    // Listen for data updates to refresh search results
    window.addEventListener('dataUpdated', () => {
      this.performSearch();
    });
  }

  /**
   * Create the search interface HTML
   */
  createSearchInterface() {
    const container = document.getElementById('search-interface-container');
    if (!container) {
      console.error('Search interface container not found');
      return;
    }

    const searchHTML = `
      <div class="search-interface">
        <div class="search-input-group">
          <div class="search-input-container">
            <input 
              type="text" 
              id="animal-search-input" 
              class="search-input" 
              placeholder="Buscar por ID, madre, padre, notas..."
              autocomplete="off"
              aria-label="Buscar animales"
            />
            <button id="search-clear-btn" class="search-clear-btn" aria-label="Limpiar búsqueda" title="Limpiar búsqueda">×</button>
          </div>
          <button id="search-submit-btn" class="search-submit-btn" aria-label="Buscar" title="Buscar">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
          </button>
        </div>
        <div class="search-filters">
          <label class="filter-label">
            <input type="radio" name="animal-type" value="all" checked>
            <span>Todos los Animales</span>
          </label>
          <label class="filter-label">
            <input type="radio" name="animal-type" value="cows">
            <span>Vacas</span>
          </label>
          <label class="filter-label">
            <input type="radio" name="animal-type" value="bulls">
            <span>Toros</span>
          </label>
        </div>
      </div>
    `;

    container.innerHTML = searchHTML;
    this.searchBar = container.querySelector('#animal-search-input');
    this.clearBtn = container.querySelector('#search-clear-btn');
    this.submitBtn = container.querySelector('#search-submit-btn');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    if (!this.searchBar || !this.clearBtn || !this.submitBtn) return;

    // Input change with debouncing
    this.searchBar.addEventListener('input', (e) => {
      this.currentQuery = e.target.value;
      this.updateClearButton();
      this.debouncedSearch();
    });

    // Clear button
    this.clearBtn.addEventListener('click', () => {
      this.clearSearch();
    });

    // Submit button
    this.submitBtn.addEventListener('click', () => {
      this.performSearch();
    });

    // Keyboard navigation
    this.searchBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.performSearch();
      } else if (e.key === 'Escape') {
        this.clearSearch();
      }
    });

    // Filter change
    const filterInputs = document.querySelectorAll('input[name="animal-type"]');
    filterInputs.forEach(input => {
      input.addEventListener('change', () => {
        this.performSearch();
      });
    });

    // Edit button event delegation
    document.addEventListener('click', (e) => {
      if (e.target.closest('.edit-btn')) {
        const editBtn = e.target.closest('.edit-btn');
        const recordId = parseInt(editBtn.dataset.recordId);
        this.openEditModal(recordId);
      }
      if (e.target.closest('.delete-btn')) {
        const delBtn = e.target.closest('.delete-btn');
        const recordId = parseInt(delBtn.dataset.recordId);
        const animalNumber = delBtn.dataset.animalNumber;
        const createdAt = delBtn.dataset.createdAt || null;
        const synced = delBtn.dataset.synced === 'true';
        this.confirmAndDelete(recordId, animalNumber, createdAt, synced);
      }
      if (e.target.closest('.pagination button')) {
        const btn = e.target.closest('.pagination button');
        const page = parseInt(btn.dataset.page);
        if (!isNaN(page)) {
          this.currentPage = page;
          this.performSearch();
        }
      }
    });
  }

  /**
   * Debounced search to avoid excessive API calls
   */
  debouncedSearch() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.performSearch();
    }, this.debounceDelay);
  }

  /**
   * Perform the actual search
   */
  async performSearch() {
    const query = this.currentQuery.trim();
    const selectedType = document.querySelector('input[name="animal-type"]:checked')?.value || 'all'; // Default to all animals
    
    try {
      const results = await this.searchAnimals(query, selectedType);
      this.displayResults(results, query);
    } catch (error) {
      this.displayError(error.message);
    }
  }

  /**
   * Search animals in the database
   * @param {string} query - Search query
   * @param {string} animalType - Animal type filter
   * @returns {Promise<Array>}
   */
  async searchAnimals(query, animalType) {
    const allRecords = await getRecords();
    // Filter by animal type (1 = cows/bulls) and then by gender
    let filteredRecords = allRecords.filter(r => r.animalType === 1);
    
    // Apply gender-based filtering
    if (animalType === 'cows') {
      filteredRecords = filteredRecords.filter(r => r.gender === 'FEMALE');
    } else if (animalType === 'bulls') {
      filteredRecords = filteredRecords.filter(r => r.gender === 'MALE');
    }
    // 'all' shows all animals (no additional filtering)


    const searchTerm = (query || '').toLowerCase().trim();

    const matched = !searchTerm ? filteredRecords : filteredRecords.filter(record => {
      // Search in multiple fields
      const searchableFields = [
        record.animalNumber,
        record.motherId,
        record.fatherId,
        record.notes,
        record.notesMother,
        record.gender,
        record.status,
        record.color,
        record.scrotalCircumference
      ].filter(field => field !== null && field !== undefined);

      return searchableFields.some(field => 
        field.toString().toLowerCase().includes(searchTerm)
      );
    });

    // Sort by createdAt desc (fallback to id desc)
    matched.sort((a, b) => {
      const ad = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bd = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (bd !== ad) return bd - ad;
      return (b.id || 0) - (a.id || 0);
    });

    return matched;
  }

  /**
   * Display search results
   * @param {Array} results - Search results
   * @param {string} query - Search query
   */
  displayResults(results, query) {
    const container = document.getElementById('search-results-container');
    if (!container) return;

    let html = '';

    if (results.length === 0) {
      html = `
        <div class="search-results-info no-results">
          ${query ? `No se encontraron animales para "${query}"` : 'No hay animales registrados'}
        </div>
      `;
    } else {
      const total = results.length;
      const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
      if (this.currentPage > totalPages) this.currentPage = totalPages;
      const start = (this.currentPage - 1) * this.pageSize;
      const pageItems = results.slice(start, start + this.pageSize);

      html = `
        <div class="search-results-info has-results">
          ${query ? `Se encontraron ${total} animal${total === 1 ? '' : 'es'} para "${query}"` : `Total: ${total} animales`}
        </div>
        <div class="search-results-list">
          ${pageItems.map(record => this.renderAnimalCard(record)).join('')}
        </div>
        ${this.renderPagination(totalPages)}
      `;
    }

    container.innerHTML = html;
  }

  renderPagination(totalPages) {
    if (totalPages <= 1) return '';
    const buttons = [];
    const maxButtons = 7;
    let start = Math.max(1, this.currentPage - 3);
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);

    buttons.push(`<button class="btn" data-page="${Math.max(1, this.currentPage - 1)}" ${this.currentPage === 1 ? 'disabled' : ''}>Anterior</button>`);
    for (let p = start; p <= end; p++) {
      buttons.push(`<button class="btn ${p === this.currentPage ? 'primary' : ''}" data-page="${p}">${p}</button>`);
    }
    buttons.push(`<button class="btn" data-page="${Math.min(totalPages, this.currentPage + 1)}" ${this.currentPage === totalPages ? 'disabled' : ''}>Siguiente</button>`);

    return `<div class="pagination" style="display:flex; gap:8px; justify-content:center; margin-top:12px;">${buttons.join('')}</div>`;
  }

  /**
   * Render individual animal card
   * @param {Object} record - Animal record
   * @returns {string}
   */
  renderAnimalCard(record) {
    const animalType = this.getAnimalTypeName(record.animalType);
    const syncStatus = record.synced ? 'Sincronizado' : 'Pendiente';
    const syncClass = record.synced ? 'synced' : 'pending';
    

    return `
      <div class="animal-card">
        <div class="animal-card-header">
          <div class="animal-id">${this.formatDisplayText(record.animalNumber)}</div>
          <div class="animal-type-badge">${animalType}</div>
        </div>
        
        <div class="animal-card-body">
          <div class="animal-details">
            ${record.motherId ? `<div class="detail-item"><span class="detail-label">Madre:</span> ${this.formatDisplayText(record.motherId)}</div>` : ''}
            ${record.fatherId ? `<div class="detail-item"><span class="detail-label">Padre:</span> ${this.formatDisplayText(record.fatherId)}</div>` : ''}
            ${record.bornDate ? `<div class="detail-item"><span class="detail-label">Nacimiento:</span> ${this.formatDate(record.bornDate)}</div>` : ''}
            ${record.weight ? `<div class="detail-item"><span class="detail-label">Peso:</span> ${record.weight} kg</div>` : ''}
            ${record.gender ? `<div class="detail-item"><span class="detail-label">Sexo:</span> ${this.formatGender(record.gender)}</div>` : ''}
            ${record.scrotalCircumference ? `<div class="detail-item"><span class="detail-label">Circunferencia Escrotal:</span> ${record.scrotalCircumference} cm</div>` : ''}
            ${record.status ? `<div class="detail-item"><span class="detail-label">Estado:</span> ${this.formatStatus(record.status)}</div>` : ''}
            ${record.color ? `<div class="detail-item"><span class="detail-label">Color:</span> ${this.formatColor(record.color)}</div>` : ''}
          </div>
          
          ${record.notes ? `<div class="animal-notes"><span class="notes-label">Notas:</span> ${this.formatDisplayText(record.notes)}</div>` : ''}
          ${record.notesMother ? `<div class="animal-notes"><span class="notes-label">Notas Madre:</span> ${this.formatDisplayText(record.notesMother)}</div>` : ''}
        </div>
        
        <div class="animal-card-footer">
          <div class="sync-status ${syncClass}">${syncStatus}</div>
          <div class="record-date">Registrado: ${this.formatDate(record.createdAt)}</div>
          <div class="row gap">
            <button class="edit-btn" data-record-id="${record.id}" title="Editar animal">✎</button>
            <button class="delete-btn" data-record-id="${record.id}" data-animal-number="${record.animalNumber}" data-created-at="${record.createdAt || ''}" data-synced="${record.synced ? 'true' : 'false'}" title="Eliminar registro">🗑</button>
          </div>
        </div>
      </div>
    `;
  }

  async confirmAndDelete(recordId, animalNumber, createdAt, synced) {
    const ok = window.confirm(`¿Eliminar el registro ${this.formatDisplayText(animalNumber)}? Esta acción no se puede deshacer.`);
    if (!ok) return;

    // If synced, attempt server delete first
    if (synced) {
      try {
        const token = await getAuthToken();
        const legacyKey = (() => { try { return localStorage.getItem('farm:userKey'); } catch { return null; } })();
        const apiBaseEl = document.getElementById('api-base');
        const apiBase = apiBaseEl ? apiBaseEl.textContent.trim() : '';
        if (apiBase) {
          await fetch(apiBase + '/register', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
              ...(!token && legacyKey ? { 'x-user-key': legacyKey } : {})
            },
            body: JSON.stringify({ animalNumber, createdAt: createdAt || null })
          });
        }
      } catch (_) {
        // ignore network errors, still remove locally
      }
    }

    try {
      await deleteRecord(recordId);
      this.performSearch();
      if (window.refreshMetrics) window.refreshMetrics();
    } catch (e) {
      this.showSuccess('No se pudo eliminar el registro');
    }
  }

  /**
   * Display error message
   * @param {string} message - Error message
   */
  displayError(message) {
    const container = document.getElementById('search-results-container');
    if (!container) return;

    container.innerHTML = `
      <div class="search-results-info no-results">
        Error en la búsqueda: ${message}
      </div>
    `;
  }

  /**
   * Update clear button visibility
   */
  updateClearButton() {
    if (this.clearBtn) {
      this.clearBtn.style.display = this.currentQuery.length > 0 ? 'flex' : 'none';
    }
  }

  /**
   * Clear the search
   */
  clearSearch() {
    if (this.searchBar) {
      this.searchBar.value = '';
      this.currentQuery = '';
      this.updateClearButton();
      this.performSearch();
    }
  }

  /**
   * Format display text with proper capitalization
   */
  formatDisplayText(text) {
    if (!text) return text;
    return text.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Format date for display
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES');
  }

  /**
   * Format gender for display
   */
  formatGender(gender) {
    const genderMap = {
      'MALE': 'Macho',
      'FEMALE': 'Hembra',
      'UNKNOWN': 'Desconocido'
    };
    return genderMap[gender] || gender;
  }

  /**
   * Format status for display
   */
  formatStatus(status) {
    const statusMap = {
      'ALIVE': 'Vivo',
      'DEAD': 'Muerto',
      'UNKNOWN': 'Desconocido'
    };
    return statusMap[status] || status;
  }

  /**
   * Format color for display
   */
  formatColor(color) {
    const colorMap = {
      'COLORADO': 'Colorado',
      'NEGRO': 'Negro',
      'OTHERS': 'Otros'
    };
    return colorMap[color] || color;
  }

  /**
   * Get animal type name from ID
   */
  getAnimalTypeName(animalTypeId) {
    const typeMap = {
      1: 'Vaca',
      2: 'Toro'
    };
    return typeMap[animalTypeId] || 'Animal';
  }

  /**
   * Open edit modal for a specific record
   * @param {number} recordId - Record ID to edit
   */
  async openEditModal(recordId) {
    try {
      const records = await this.searchAnimals('', 'all'); // Get all animal records
      const record = records.find(r => r.id === recordId);
      
      if (!record) {
        this.showError('Registro no encontrado');
        return;
      }

      this.createEditModal(record);
    } catch (error) {
      this.showError('Error al cargar el registro: ' + error.message);
    }
  }

  /**
   * Create and show edit modal
   * @param {Object} record - Record to edit
   */
  createEditModal(record) {
    // Remove existing modal if any
    const existingModal = document.getElementById('edit-animal-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modalHTML = `
      <dialog id="edit-animal-modal" class="edit-modal">
        <div class="edit-modal-header">
          <h3>Editar Animal - ${this.formatDisplayText(record.animalNumber)}</h3>
          <button id="close-edit-modal" class="close-btn" aria-label="Cerrar">×</button>
        </div>
        <form id="edit-animal-form" class="edit-form">
          <input type="hidden" id="edit-record-id" value="${record.id}">
          <input type="hidden" id="edit-animal-type" value="${record.animalType}">
          <div class="edit-form-grid">
            <div class="edit-form-field">
              <label for="edit-animal-number">ID del Animal *</label>
              <input id="edit-animal-number" type="text" value="${record.animalNumber}" required autocomplete="off">
            </div>
            <div class="edit-form-field">
              <label>Tipo de Animal</label>
              <input type="text" value="${this.getAnimalTypeName(record.animalType)}" readonly style="background-color: #f5f5f5; color: #666;">
            </div>
            <div class="edit-form-field">
              <label for="edit-mother-id">ID de la Madre</label>
              <input id="edit-mother-id" type="text" value="${record.motherId || ''}" autocomplete="off">
            </div>
            <div class="edit-form-field">
              <label for="edit-father-id">ID del Padre</label>
              <input id="edit-father-id" type="text" value="${record.fatherId || ''}" placeholder="e.g., Repaso, 2399" autocomplete="off">
            </div>
            <div class="edit-form-field">
              <label for="edit-born-date">Fecha de Nacimiento</label>
              <input id="edit-born-date" type="date" value="${record.bornDate || ''}" autocomplete="off">
            </div>
            <div class="edit-form-field">
              <label for="edit-weight">Peso (kg)</label>
              <input id="edit-weight" type="number" step="0.01" min="0" value="${record.weight || ''}" placeholder="e.g., 250.5" autocomplete="off">
            </div>
            <div class="edit-form-field">
              <label for="edit-gender">Sexo</label>
              <select id="edit-gender">
                <option value="">— Seleccionar —</option>
                <option value="MALE" ${record.gender === 'MALE' ? 'selected' : ''}>Macho</option>
                <option value="FEMALE" ${record.gender === 'FEMALE' ? 'selected' : ''}>Hembra</option>
                <option value="UNKNOWN" ${record.gender === 'UNKNOWN' ? 'selected' : ''}>Desconocido</option>
              </select>
            </div>
            <div class="edit-form-field" id="edit-scrotal-circumference-field" style="display: ${record.gender === 'MALE' ? 'block' : 'none'};">
              <label for="edit-scrotal-circumference">Circunferencia Escrotal (cm)</label>
              <input id="edit-scrotal-circumference" type="number" step="0.1" min="0" max="100" value="${record.scrotalCircumference || ''}" placeholder="e.g., 35.5" autocomplete="off">
            </div>
            <div class="edit-form-field">
              <label for="edit-status">Estado</label>
              <select id="edit-status">
                <option value="">— Seleccionar —</option>
                <option value="ALIVE" ${record.status === 'ALIVE' ? 'selected' : ''}>Vivo</option>
                <option value="DEAD" ${record.status === 'DEAD' ? 'selected' : ''}>Muerto</option>
                <option value="UNKNOWN" ${record.status === 'UNKNOWN' ? 'selected' : ''}>Desconocido</option>
              </select>
            </div>
            <div class="edit-form-field">
              <label for="edit-color">Color</label>
              <select id="edit-color">
                <option value="">— Seleccionar —</option>
                <option value="COLORADO" ${record.color === 'COLORADO' ? 'selected' : ''}>Colorado</option>
                <option value="NEGRO" ${record.color === 'NEGRO' ? 'selected' : ''}>Negro</option>
                <option value="OTHERS" ${record.color === 'OTHERS' ? 'selected' : ''}>Otros</option>
              </select>
            </div>
            <div class="edit-form-field full-width">
              <label for="edit-notes-mother">Notas de la Madre</label>
              <input id="edit-notes-mother" type="text" value="${record.notesMother || ''}" placeholder="Cualquier nota sobre la madre" autocomplete="off">
            </div>
            <div class="edit-form-field full-width">
              <label for="edit-notes">Notas Generales</label>
              <input id="edit-notes" type="text" value="${record.notes || ''}" placeholder="Cualquier nota adicional" autocomplete="off">
            </div>
          </div>
          <div class="edit-form-actions">
            <button type="button" id="cancel-edit" class="btn">Cancelar</button>
            <button type="submit" class="btn primary">Guardar Cambios</button>
          </div>
        </form>
      </dialog>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = document.getElementById('edit-animal-modal');
    const form = document.getElementById('edit-animal-form');

    // Setup modal event listeners
    this.setupEditModalListeners(modal, form);
    
    // Show modal
    modal.showModal();
    
    // Focus first field
    setTimeout(() => {
      document.getElementById('edit-animal-number')?.focus();
    }, 100);
  }

  /**
   * Setup edit modal event listeners
   * @param {HTMLElement} modal - Modal element
   * @param {HTMLElement} form - Form element
   */
  setupEditModalListeners(modal, form) {
    // Close buttons
    document.getElementById('close-edit-modal')?.addEventListener('click', () => this.closeEditModal());
    document.getElementById('cancel-edit')?.addEventListener('click', () => this.closeEditModal());

    // Handle gender change to show/hide scrotal circumference field
    document.getElementById('edit-gender')?.addEventListener('change', () => {
      const gender = document.getElementById('edit-gender').value;
      const scrotalField = document.getElementById('edit-scrotal-circumference-field');
      const scrotalInput = document.getElementById('edit-scrotal-circumference');
      
      if (gender === 'MALE') {
        scrotalField.style.display = 'block';
      } else {
        scrotalField.style.display = 'none';
        scrotalInput.value = ''; // Clear value when hidden
      }
    });

    // Close on backdrop click
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeEditModal();
      }
    });

    // Form submission
    form?.addEventListener('submit', (e) => this.handleEditSubmit(e));
  }

  /**
   * Handle edit form submission
   * @param {Event} e - Form submit event
   */
  async handleEditSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const recordId = parseInt(document.getElementById('edit-record-id').value);
    const animalNumber = normalizeString(document.getElementById('edit-animal-number').value);
    
    if (!animalNumber) {
      this.showEditError('El ID del animal es requerido');
      return;
    }

    try {
      const updatedData = {
        animalNumber,
        animalType: parseInt(document.getElementById('edit-animal-type').value),
        motherId: normalizeString(document.getElementById('edit-mother-id').value),
        fatherId: normalizeString(document.getElementById('edit-father-id').value),
        bornDate: (document.getElementById('edit-born-date').value || '').trim() || null,
        weight: document.getElementById('edit-weight').value ? parseFloat(document.getElementById('edit-weight').value) : null,
        gender: normalizeString(document.getElementById('edit-gender').value),
        scrotalCircumference: document.getElementById('edit-scrotal-circumference').value ? parseFloat(document.getElementById('edit-scrotal-circumference').value) : null,
        status: normalizeString(document.getElementById('edit-status').value),
        color: normalizeString(document.getElementById('edit-color').value),
        notes: normalizeString(document.getElementById('edit-notes').value),
        notesMother: normalizeString(document.getElementById('edit-notes-mother').value)
      };

      // Validate weight if provided
      if (updatedData.weight !== null && (isNaN(updatedData.weight) || !isFinite(updatedData.weight))) {
        updatedData.weight = null;
      }

      // Validate scrotal circumference if provided
      if (updatedData.scrotalCircumference !== null && (isNaN(updatedData.scrotalCircumference) || !isFinite(updatedData.scrotalCircumference))) {
        updatedData.scrotalCircumference = null;
      }

      await this.updateRecord(recordId, updatedData);
      this.closeEditModal();
      this.showSuccess('Animal actualizado exitosamente');
      
      // Refresh search results
      this.performSearch();
      
      // Refresh the main list to show updated sync status
      if (window.renderList) {
        await window.renderList();
      }
      
      // Refresh metrics if available
      if (window.refreshMetrics) {
        window.refreshMetrics();
      }
      
    } catch (error) {
      this.showEditError('Error al actualizar el animal: ' + error.message);
    }
  }

  /**
   * Update record in database
   * @param {number} recordId - Record ID
   * @param {Object} data - Updated data
   */
  async updateRecord(recordId, data) {
    // Import the database functions
    const { openDb } = await import('../../db.js');
    
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      
      // Get the existing record first
      const getReq = store.get(recordId);
      getReq.onsuccess = async () => {
        const existingRecord = getReq.result;
        console.log('Retrieved record for editing:', existingRecord);
        if (!existingRecord) {
          reject(new Error('Registro no encontrado'));
          return;
        }

        // For synced records, we'll update directly using animalNumber and createdAt
        // No need to get backendId - we'll use the record identifier
        console.log('Updating synced record:', {
          animalNumber: existingRecord.animalNumber,
          createdAt: existingRecord.createdAt,
          synced: existingRecord.synced
        });

        // Update the record with new data while preserving metadata
        const updatedRecord = {
          ...existingRecord,
          ...data,
          updatedAt: new Date().toISOString(),
          synced: existingRecord.synced // Keep the original sync status
        };
        
        console.log('Updated record:', { 
          id: updatedRecord.id, 
          animalNumber: updatedRecord.animalNumber,
          synced: updatedRecord.synced 
        });
        
        // Check if record has been synced with backend
        if (!existingRecord.synced) {
          console.warn('Record has not been synced with backend yet. Cannot edit.');
          reject(new Error('Record must be synced with backend before editing. Please refresh the page and try again.'));
          return;
        }

        // Store reference to this for callbacks
        const self = this;
        
        // Update local database
        const putReq = store.put(updatedRecord);
        putReq.onsuccess = async () => {
          // For synced records, update directly on the server
          if (navigator.onLine && existingRecord.synced) {
            try {
              // Update the record directly on the server using animalNumber and createdAt
              // Ensure weight is a number or null
              let weight = null;
              if (data.weight !== null && data.weight !== undefined && data.weight !== '') {
                const numWeight = parseFloat(data.weight);
                if (!isNaN(numWeight)) {
                  weight = numWeight;
                }
              }
              
              const requestData = {
                animalNumber: existingRecord.animalNumber,
                createdAt: existingRecord.createdAt,
                motherId: data.motherId || null,
                fatherId: data.fatherId || null,
                bornDate: data.bornDate || null,
                weight: weight,
                gender: data.gender || null,
                scrotalCircumference: data.scrotalCircumference || null,
                status: data.status || null,
                color: data.color || null,
                notes: data.notes || null,
                notesMother: data.notesMother || null,
              };
              
              console.log('Sending update request with data:', requestData);
              
              // Use Firebase authentication consistently
              const firebaseToken = await getAuthToken();
              
              const headers = {
                'Content-Type': 'application/json'
              };
              
              if (firebaseToken) {
                // Use Firebase token for authentication
                headers['Authorization'] = `Bearer ${firebaseToken}`;
              } else {
                // If no Firebase token, try to get a fresh one
                console.warn('No Firebase token available, attempting to refresh...');
                // This will trigger a re-authentication if needed
                throw new Error('Authentication required. Please sign in again.');
              }
              
              const response = await fetch(`${API_BASE_URL}/register/update`, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(requestData)
              });
              
              if (response.ok) {
                console.log('Record updated successfully on server');
                // Mark as synced - create a new transaction for this
                const syncedRecord = { ...updatedRecord, synced: true };
                const syncTx = db.transaction('records', 'readwrite');
                const syncStore = syncTx.objectStore('records');
                const syncPutReq = syncStore.put(syncedRecord);
                syncPutReq.onsuccess = () => {
                  // Refresh the UI to show the updated data
                  self.performSearch();
                  resolve(syncedRecord);
                };
                syncPutReq.onerror = () => resolve(updatedRecord);
              } else {
                console.warn('Failed to update record on server:', response.status);
                // Log the error response
                try {
                  const errorText = await response.text();
                  console.error('Error response:', errorText);
                } catch (e) {
                  console.error('Could not read error response');
                }
                // Refresh the UI even if server update failed
                self.performSearch();
                resolve(updatedRecord); // Return unsynced record
              }
            } catch (error) {
              console.warn('Failed to sync update to backend:', error);
              // Refresh the UI even if sync failed
              self.performSearch();
              resolve(updatedRecord); // Return unsynced record
            }
          } else {
            // For unsynced records, use the global sync mechanism
            if (navigator.onLine && window.triggerSync) {
              try {
                await window.triggerSync(true);
                // Refresh the UI after sync
                self.performSearch();
                resolve(updatedRecord);
              } catch (error) {
                console.warn('Failed to sync update to backend:', error);
                // Refresh the UI even if sync failed
                self.performSearch();
                resolve(updatedRecord);
              }
            } else {
              // Refresh the UI for offline records
              self.performSearch();
              resolve(updatedRecord);
            }
          }
        };
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  /**
   * Sync update to backend
   * @param {number} recordId - Record ID
   * @param {Object} data - Updated data
   */
  async syncUpdateToBackend(recordId, data) {
    const firebaseToken = await getAuthToken();
    
    if (!firebaseToken) {
      throw new Error('Authentication required. Please sign in again.');
    }

    // Get the backend ID from the record
    const { openDb } = await import('../../db.js');
    const db = await openDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction('records', 'readonly');
      const store = tx.objectStore('records');
      const getReq = store.get(recordId);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    });

    if (!record || !record.backendId) {
      throw new Error('Record not found or not synced with backend');
    }

    const response = await fetch(`${API_BASE_URL}/register/${record.backendId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firebaseToken}`
      },
      body: JSON.stringify({
        animalNumber: data.animalNumber,
        motherId: data.motherId ?? null,
        fatherId: data.fatherId ?? null,
        bornDate: data.bornDate ?? null,
        weight: data.weight ?? null,
        gender: data.gender ?? null,
        status: data.status ?? null,
        color: data.color ?? null,
        notes: data.notes ?? null,
        notesMother: data.notesMother ?? null,
      })
    });

    if (!response.ok) {
      throw new Error(`Backend update failed: ${response.status}`);
    }
  }

  /**
   * Close edit modal
   */
  closeEditModal() {
    const modal = document.getElementById('edit-animal-modal');
    if (modal) {
      modal.close();
      modal.remove();
    }
  }

  /**
   * Show edit error message
   * @param {string} message - Error message
   */
  showEditError(message) {
    const modal = document.getElementById('edit-animal-modal');
    if (!modal) return;

    // Remove existing error messages
    const existing = modal.querySelector('.edit-error-message');
    if (existing) {
      existing.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'edit-error-message';
    errorDiv.textContent = message;
    errorDiv.style.color = '#ef4444';
    errorDiv.style.marginTop = '12px';
    errorDiv.style.padding = '8px';
    errorDiv.style.backgroundColor = '#fef2f2';
    errorDiv.style.border = '1px solid #fecaca';
    errorDiv.style.borderRadius = '6px';
    errorDiv.style.fontSize = '14px';

    const form = modal.querySelector('#edit-animal-form');
    form?.appendChild(errorDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }

  /**
   * Show success message
   * @param {string} message - Success message
   */
  showSuccess(message) {
    // Create a toast notification
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = message;
      toast.style.backgroundColor = '#10b981';
      toast.style.color = 'white';
      toast.hidden = false;
      
      setTimeout(() => {
        toast.hidden = true;
      }, 3000);
    }
  }
}

/**
 * Initialize the search functionality
 */
export function initAnimalSearch() {
  const search = new AnimalSearch();
  search.init();
  return search;
}
