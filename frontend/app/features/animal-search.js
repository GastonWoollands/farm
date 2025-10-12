import { getRecords } from '../../db.js';

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
  }

  /**
   * Initialize the search interface
   */
  init() {
    this.createSearchInterface();
    this.setupEventListeners();
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
              placeholder="Buscar por ID, madre, notas..."
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
            <input type="radio" name="animal-type" value="" checked>
            <span>Todos</span>
          </label>
          <label class="filter-label">
            <input type="radio" name="animal-type" value="1">
            <span>Vacas</span>
          </label>
          <label class="filter-label">
            <input type="radio" name="animal-type" value="2">
            <span>Cerdos</span>
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
    const selectedType = document.querySelector('input[name="animal-type"]:checked')?.value;
    
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
    let filteredRecords = allRecords;

    // Filter by animal type if specified
    if (animalType) {
      filteredRecords = filteredRecords.filter(r => r.animalType === parseInt(animalType));
    }

    // If no query, return all filtered records
    if (!query) {
      return filteredRecords;
    }

    const searchTerm = query.toLowerCase().trim();
    
    return filteredRecords.filter(record => {
      // Search in multiple fields
      const searchableFields = [
        record.animalNumber,
        record.motherId,
        record.notes,
        record.notesMother,
        record.gender,
        record.status,
        record.color
      ].filter(field => field !== null && field !== undefined);

      return searchableFields.some(field => 
        field.toString().toLowerCase().includes(searchTerm)
      );
    });
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
      html = `
        <div class="search-results-info has-results">
          ${query ? `Se encontraron ${results.length} animal${results.length === 1 ? '' : 'es'} para "${query}"` : `Total: ${results.length} animales`}
        </div>
        <div class="search-results-list">
          ${results.map(record => this.renderAnimalCard(record)).join('')}
        </div>
      `;
    }

    container.innerHTML = html;
  }

  /**
   * Render individual animal card
   * @param {Object} record - Animal record
   * @returns {string}
   */
  renderAnimalCard(record) {
    const animalType = record.animalType === 1 ? 'Vaca' : 'Cerdo';
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
            ${record.bornDate ? `<div class="detail-item"><span class="detail-label">Nacimiento:</span> ${this.formatDate(record.bornDate)}</div>` : ''}
            ${record.weight ? `<div class="detail-item"><span class="detail-label">Peso:</span> ${record.weight} kg</div>` : ''}
            ${record.gender ? `<div class="detail-item"><span class="detail-label">Sexo:</span> ${this.formatGender(record.gender)}</div>` : ''}
            ${record.status ? `<div class="detail-item"><span class="detail-label">Estado:</span> ${this.formatStatus(record.status)}</div>` : ''}
            ${record.color ? `<div class="detail-item"><span class="detail-label">Color:</span> ${this.formatColor(record.color)}</div>` : ''}
          </div>
          
          ${record.notes ? `<div class="animal-notes"><span class="notes-label">Notas:</span> ${this.formatDisplayText(record.notes)}</div>` : ''}
          ${record.notesMother ? `<div class="animal-notes"><span class="notes-label">Notas Madre:</span> ${this.formatDisplayText(record.notesMother)}</div>` : ''}
        </div>
        
        <div class="animal-card-footer">
          <div class="sync-status ${syncClass}">${syncStatus}</div>
          <div class="record-date">Registrado: ${this.formatDate(record.createdAt)}</div>
          <button class="edit-btn" data-record-id="${record.id}" title="Editar animal">
            <svg class="edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
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
      'MARRON': 'Marrón',
      'NEGRO': 'Negro',
      'ROSA': 'Rosa',
      'BLANCO': 'Blanco',
      'OTHERS': 'Otros'
    };
    return colorMap[color] || color;
  }

  /**
   * Open edit modal for a specific record
   * @param {number} recordId - Record ID to edit
   */
  async openEditModal(recordId) {
    try {
      const records = await this.searchAnimals('', ''); // Get all records
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
              <input type="text" value="${record.animalType === 1 ? 'Vaca' : 'Cerdo'}" readonly style="background-color: #f5f5f5; color: #666;">
            </div>
            <div class="edit-form-field">
              <label for="edit-mother-id">ID de la Madre</label>
              <input id="edit-mother-id" type="text" value="${record.motherId || ''}" autocomplete="off">
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
                <option value="MARRON" ${record.color === 'MARRON' ? 'selected' : ''}>Marrón</option>
                <option value="NEGRO" ${record.color === 'NEGRO' ? 'selected' : ''}>Negro</option>
                <option value="ROSA" ${record.color === 'ROSA' ? 'selected' : ''}>Rosa</option>
                <option value="BLANCO" ${record.color === 'BLANCO' ? 'selected' : ''}>Blanco</option>
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
    const animalNumber = document.getElementById('edit-animal-number').value.trim().toUpperCase();
    
    if (!animalNumber) {
      this.showEditError('El ID del animal es requerido');
      return;
    }

    try {
      const updatedData = {
        animalNumber,
        animalType: parseInt(document.getElementById('edit-animal-type').value),
        motherId: document.getElementById('edit-mother-id').value.trim().toUpperCase() || null,
        bornDate: document.getElementById('edit-born-date').value || null,
        weight: document.getElementById('edit-weight').value ? parseFloat(document.getElementById('edit-weight').value) : null,
        gender: document.getElementById('edit-gender').value.toUpperCase() || null,
        status: document.getElementById('edit-status').value.toUpperCase() || null,
        color: document.getElementById('edit-color').value.toUpperCase() || null,
        notes: document.getElementById('edit-notes').value.trim().toUpperCase() || null,
        notesMother: document.getElementById('edit-notes-mother').value.trim().toUpperCase() || null
      };

      await this.updateRecord(recordId, updatedData);
      this.closeEditModal();
      this.showSuccess('Animal actualizado exitosamente');
      
      // Refresh search results
      this.performSearch();
      
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
      getReq.onsuccess = () => {
        const existingRecord = getReq.result;
        if (!existingRecord) {
          reject(new Error('Registro no encontrado'));
          return;
        }

        // Update the record with new data while preserving metadata
        const updatedRecord = {
          ...existingRecord,
          ...data,
          updatedAt: new Date().toISOString()
        };

        const putReq = store.put(updatedRecord);
        putReq.onsuccess = () => resolve(updatedRecord);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
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
