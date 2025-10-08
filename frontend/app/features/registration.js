import { addRecord } from '../../db.js';
import { getAuthToken } from '../auth.js';

/**
 * Registration popup component
 * Handles animal registration in a modal dialog
 */
export class RegistrationPopup {
  constructor() {
    this.dialog = null;
    this.form = null;
    this.isOpen = false;
    this.callbacks = {
      onSuccess: null,
      onError: null
    };
  }

  /**
   * Initialize the registration popup
   */
  init() {
    this.createDialog();
    this.setupEventListeners();
  }

  /**
   * Create the registration dialog HTML
   */
  createDialog() {
    // Remove existing dialog if any
    const existing = document.getElementById('registration-dialog');
    if (existing) {
      existing.remove();
    }

    const dialogHTML = `
      <dialog id="registration-dialog" class="registration-dialog">
        <div class="dialog-header">
          <h3>Registrar Nuevo Animal</h3>
          <button id="close-registration" class="btn close-btn" aria-label="Cerrar">×</button>
        </div>
        <form id="registration-form" class="registration-form">
          <div class="form-grid">
            <div class="form-field">
              <label for="reg-animal">ID del Animal *</label>
              <input id="reg-animal" type="text" placeholder="e.g., A123-45" required autocomplete="off">
            </div>
            <div class="form-field">
              <label for="reg-mother">ID de la Madre</label>
              <input id="reg-mother" type="text" placeholder="e.g., 67890" autocomplete="off">
            </div>
            <div class="form-field">
              <label for="reg-born">Fecha de Nacimiento</label>
              <input id="reg-born" type="text" placeholder="dd/mm/aaaa" autocomplete="off">
            </div>
            <div class="form-field">
              <label for="reg-weight">Peso (kg)</label>
              <input id="reg-weight" type="number" step="0.01" min="0" placeholder="e.g., 250.5" autocomplete="off">
            </div>
            <div class="form-field">
              <label for="reg-gender">Sexo</label>
              <select id="reg-gender">
                <option value="">— Seleccionar —</option>
                <option value="MALE">Macho</option>
                <option value="FEMALE">Hembra</option>
                <option value="UNKNOWN">Desconocido</option>
              </select>
            </div>
            <div class="form-field">
              <label for="reg-status">Estado</label>
              <select id="reg-status">
                <option value="">— Seleccionar —</option>
                <option value="ALIVE">Vivo</option>
                <option value="DEAD">Muerto</option>
                <option value="UNKNOWN">Desconocido</option>
              </select>
            </div>
            <div class="form-field">
              <label for="reg-color">Color</label>
              <select id="reg-color">
                <option value="">— Seleccionar —</option>
                <option value="COLORADO">Colorado</option>
                <option value="MARRON">Marrón</option>
                <option value="NEGRO">Negro</option>
                <option value="OTHERS">Otros</option>
              </select>
            </div>
            <div class="form-field full-width">
              <label for="reg-notes-mother">Notas de la Madre</label>
              <input id="reg-notes-mother" type="text" placeholder="Cualquier nota sobre la madre" autocomplete="off">
            </div>
            <div class="form-field full-width">
              <label for="reg-notes">Notas Generales</label>
              <input id="reg-notes" type="text" placeholder="Cualquier nota adicional" autocomplete="off">
            </div>
          </div>
          <div class="form-actions">
            <button type="button" id="cancel-registration" class="btn">Cancelar</button>
            <button type="submit" class="btn primary">Registrar Animal</button>
          </div>
        </form>
      </dialog>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);
    this.dialog = document.getElementById('registration-dialog');
    this.form = document.getElementById('registration-form');
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Close buttons
    document.getElementById('close-registration')?.addEventListener('click', () => this.close());
    document.getElementById('cancel-registration')?.addEventListener('click', () => this.close());

    // Close on backdrop click
    this.dialog?.addEventListener('click', (e) => {
      if (e.target === this.dialog) {
        this.close();
      }
    });

    // Form submission
    this.form?.addEventListener('submit', (e) => this.handleSubmit(e));

    // Auto-focus first field when opened
    this.dialog?.addEventListener('close', () => {
      this.isOpen = false;
    });
  }

  /**
   * Open the registration popup
   */
  open() {
    if (!this.dialog) {
      this.createDialog();
      this.setupEventListeners();
    }

    this.clearForm();
    this.dialog?.showModal();
    this.isOpen = true;
    
    // Focus first field
    setTimeout(() => {
      document.getElementById('reg-animal')?.focus();
    }, 100);
  }

  /**
   * Close the registration popup
   */
  close() {
    this.dialog?.close();
    this.isOpen = false;
  }

  /**
   * Clear the form
   */
  clearForm() {
    if (this.form) {
      this.form.reset();
    }
  }

  /**
   * Handle form submission
   */
  async handleSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(this.form);
    const animalNumber = formData.get('reg-animal')?.trim().toUpperCase();
    
    if (!animalNumber) {
      this.showError('El ID del animal es requerido');
      return;
    }

    try {
      await this.registerAnimal({
        animalNumber,
        motherId: formData.get('reg-mother')?.trim().toUpperCase() || null,
        bornDate: this.formatDate(formData.get('reg-born')?.trim()),
        weight: formData.get('reg-weight') ? parseFloat(formData.get('reg-weight')) : null,
        gender: formData.get('reg-gender')?.toUpperCase() || null,
        status: formData.get('reg-status')?.toUpperCase() || null,
        color: formData.get('reg-color')?.toUpperCase() || null,
        notes: formData.get('reg-notes')?.trim().toUpperCase() || null,
        notesMother: formData.get('reg-notes-mother')?.trim().toUpperCase() || null
      });

      this.close();
      this.showSuccess('Animal registrado exitosamente');
      
      if (this.callbacks.onSuccess) {
        this.callbacks.onSuccess();
      }
    } catch (error) {
      this.showError('Error al registrar el animal: ' + error.message);
      if (this.callbacks.onError) {
        this.callbacks.onError(error);
      }
    }
  }

  /**
   * Register animal in database
   */
  async registerAnimal(data) {
    const userKey = getAuthToken();
    if (!userKey) {
      throw new Error('No hay sesión activa');
    }

    const record = {
      animalNumber: data.animalNumber,
      userKey,
      motherId: data.motherId,
      bornDate: data.bornDate,
      weight: (data.weight !== null && !isNaN(data.weight) && isFinite(data.weight)) ? data.weight : null,
      gender: data.gender,
      status: data.status,
      color: data.color,
      notes: data.notes,
      notesMother: data.notesMother
    };

    await addRecord(record);
  }

  /**
   * Format date from dd/mm/yyyy to yyyy-mm-dd
   */
  formatDate(dateStr) {
    if (!dateStr) return null;
    
    const match = dateStr.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/);
    if (match) {
      const dd = match[1].padStart(2, '0');
      const mm = match[2].padStart(2, '0');
      const yyyy = match[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }

  /**
   * Show error message
   */
  showError(message) {
    // Remove existing error messages
    const existing = this.dialog?.querySelector('.error-message');
    if (existing) {
      existing.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.color = '#ef4444';
    errorDiv.style.marginTop = '12px';
    errorDiv.style.padding = '8px';
    errorDiv.style.backgroundColor = '#fef2f2';
    errorDiv.style.border = '1px solid #fecaca';
    errorDiv.style.borderRadius = '6px';
    errorDiv.style.fontSize = '14px';

    this.form?.appendChild(errorDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    // This could be enhanced with a toast notification
    console.log('Success:', message);
  }

  /**
   * Set callbacks
   */
  onSuccess(callback) {
    this.callbacks.onSuccess = callback;
  }

  onError(callback) {
    this.callbacks.onError = callback;
  }
}

/**
 * Initialize registration popup
 */
export function initRegistrationPopup() {
  const popup = new RegistrationPopup();
  popup.init();
  return popup;
}
