import { getRecords } from '../../db.js';

/**
 * Objectives Management Module
 * Handles objectives display and configuration
 * Uses the same metrics calculation as the main metrics module
 */
export class ObjectivesManager {
  constructor() {
    this.container = null;
    this.objectives = this.loadObjectives();
  }

  /**
   * Load user-defined objectives from localStorage
   */
  loadObjectives() {
    const defaultObjectives = {
      targetRegistrations: 100,
      targetWeight: 300,
      targetBirths: 50,
      targetMothers: 20
    };
    
    try {
      const stored = localStorage.getItem('farm:objectives');
      return stored ? { ...defaultObjectives, ...JSON.parse(stored) } : defaultObjectives;
    } catch {
      return defaultObjectives;
    }
  }

  /**
   * Save objectives to localStorage
   */
  saveObjectives() {
    localStorage.setItem('farm:objectives', JSON.stringify(this.objectives));
  }

  /**
   * Update objectives
   */
  updateObjectives(newObjectives) {
    this.objectives = { ...this.objectives, ...newObjectives };
    this.saveObjectives();
  }

  /**
   * Load user configuration from localStorage
   */
  loadUserConfig() {
    const defaultConfig = {
      animalIdPrefix: 'AC988',
      motherIdPrefix: 'AC988',
      fatherIdPrefix: ''
    };
    
    try {
      const stored = localStorage.getItem('farm:userConfig');
      return stored ? { ...defaultConfig, ...JSON.parse(stored) } : defaultConfig;
    } catch {
      return defaultConfig;
    }
  }

  /**
   * Save user configuration to localStorage
   */
  saveUserConfig() {
    localStorage.setItem('farm:userConfig', JSON.stringify(this.userConfig));
  }

  /**
   * Update user configuration
   */
  updateUserConfig(newConfig) {
    this.userConfig = { ...this.userConfig, ...newConfig };
    this.saveUserConfig();
    
    // Update global configuration for immediate use
    if (window.updateGlobalConfig) {
      window.updateGlobalConfig(this.userConfig);
    }
  }

  /**
   * Calculate objective-based metrics (same logic as metrics module)
   */
  async calculateObjectiveMetrics() {
    const records = await getRecords();
    const currentRegistrations = records.length;
    const currentWeight = this.calculateWeightMetrics(records).average;
    // Every registration counts as a birth since this is a born registration app
    const currentBirths = currentRegistrations;
    const currentMothers = this.calculateMotherMetrics(records).totalMothers;

    return {
      registrations: {
        current: currentRegistrations,
        target: this.objectives.targetRegistrations,
        progress: Math.min(100, Math.round((currentRegistrations / this.objectives.targetRegistrations) * 100))
      },
      weight: {
        current: currentWeight,
        target: this.objectives.targetWeight,
        progress: Math.min(100, Math.round((currentWeight / this.objectives.targetWeight) * 100))
      },
      births: {
        current: currentBirths,
        target: this.objectives.targetBirths,
        progress: Math.min(100, Math.round((currentBirths / this.objectives.targetBirths) * 100))
      },
      mothers: {
        current: currentMothers,
        target: this.objectives.targetMothers,
        progress: Math.min(100, Math.round((currentMothers / this.objectives.targetMothers) * 100))
      }
    };
  }

  /**
   * Calculate weight metrics for all records
   */
  calculateWeightMetrics(records) {
    const weights = records
      .map(r => r.weight)
      .filter(w => w !== null && w !== undefined && !isNaN(w))
      .map(w => parseFloat(w));

    if (weights.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        median: 0
      };
    }

    const sorted = [...weights].sort((a, b) => a - b);
    const average = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    const median = sorted.length % 2 === 0 
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    return {
      count: weights.length,
      average: Math.round(average * 10) / 10,
      min: Math.min(...weights),
      max: Math.max(...weights),
      median: Math.round(median * 10) / 10
    };
  }

  /**
   * Calculate mother metrics for all records
   */
  calculateMotherMetrics(records) {
    const motherCounts = records.reduce((acc, record) => {
      if (record.motherId) {
        acc[record.motherId] = (acc[record.motherId] || 0) + 1;
      }
      return acc;
    }, {});

    const totalMothers = Object.keys(motherCounts).length;
    const totalOffspring = Object.values(motherCounts).reduce((sum, count) => sum + count, 0);
    const averageOffspring = totalMothers > 0 ? Math.round((totalOffspring / totalMothers) * 10) / 10 : 0;

    return {
      totalMothers,
      totalOffspring,
      averageOffspring
    };
  }

  /**
   * Render the objectives page
   */
  async render(containerId) {
    try {
      console.log('Starting objectives render with containerId:', containerId);
      this.container = document.getElementById(containerId);
      if (!this.container) {
        console.error('Objectives container not found:', containerId);
        return;
      }

      console.log('Container found, calculating objectives...');
      const objectives = await this.calculateObjectiveMetrics();
      console.log('Objectives calculated:', objectives);
      
      console.log('Rendering objectives HTML...');
      this.container.innerHTML = `
        <div class="objectives-dashboard">
          ${this.renderObjectivesHeader()}
          ${this.renderObjectivesSettings()}
          ${this.renderObjectivesProgress(objectives)}
          ${this.renderUserConfiguration()}
        </div>
      `;

      console.log('Setting up event listeners...');
      this.setupEventListeners();
      console.log('Objectives render completed successfully');
    } catch (error) {
      console.error('Error rendering objectives:', error);
      console.error('Error stack:', error.stack);
      if (this.container) {
        this.container.innerHTML = '<div class="error">Error loading objectives. Please refresh the page.</div>';
      }
    }
  }

  /**
   * Render objectives header with summary
   */
  renderObjectivesHeader() {
    return `
      <div class="objectives-header">
        <div class="objectives-summary">
          <h3>Resumen de Objetivos</h3>
          <p class="objectives-description">
            Establece y monitorea tus objetivos anuales para el crecimiento de tu ganado. 
            Los objetivos te ayudan a mantener el enfoque y medir el progreso.
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Render user configuration section
   */
  renderUserConfiguration() {
    const userConfig = this.userConfig || this.loadUserConfig();
    
    return `
      <div class="objectives-config-section">
        <div class="objectives-header">
          <div class="objectives-summary">
            <h3>Configuración de Usuario</h3>
            <p class="objectives-description">
              Personaliza los prefijos para tus identificadores de animales. Estos prefijos se utilizan automáticamente 
              al registrar nuevos animales, facilitando la identificación y organización de tu ganado. Puedes cambiar 
              estos valores en cualquier momento y se aplicarán a todos los nuevos registros.
            </p>
          </div>
        </div>
        
        <form id="user-config-form" class="objectives-settings-form">
          <div class="settings-grid">
            <div class="setting-group">
              <label for="config-animal-prefix">Prefijo ID Animal</label>
              <input 
                id="config-animal-prefix" 
                type="text" 
                value="${userConfig.animalIdPrefix || 'AC988'}" 
                placeholder="e.g., AC988"
                autocomplete="off"
              >
              <div class="setting-description">Prefijo usado para nuevos registros de animales</div>
            </div>
            
            <div class="setting-group">
              <label for="config-mother-prefix">Prefijo ID Madre</label>
              <input 
                id="config-mother-prefix" 
                type="text" 
                value="${userConfig.motherIdPrefix || 'AC988'}" 
                placeholder="e.g., AC988"
                autocomplete="off"
              >
              <div class="setting-description">Prefijo usado para el campo Madre ID</div>
            </div>
            
            <div class="setting-group">
              <label for="config-father-prefix">Prefijo ID Padre</label>
              <input 
                id="config-father-prefix" 
                type="text" 
                value="${userConfig.fatherIdPrefix || ''}" 
                placeholder="e.g., Repaso (opcional)"
                autocomplete="off"
              >
              <div class="setting-description">Prefijo usado para el campo Padre ID (opcional)</div>
            </div>
          </div>
          
          <div class="settings-actions">
            <button type="submit" class="save-objectives-btn">
              Guardar Configuración
            </button>
            <button type="button" class="reset-objectives-btn" id="reset-config-btn">
              Restaurar Valores por Defecto
            </button>
          </div>
        </form>
      </div>
    `;
  }

  /**
   * Render objectives progress section
   */
  renderObjectivesProgress(objectives) {
    return `
      <div class="objectives-progress-section">
        <div class="section-header">
          <h3>Progreso Actual</h3>
          <p class="section-subtitle">Monitorea tu avance hacia los objetivos establecidos</p>
        </div>
        <div class="objectives-grid">
          ${this.renderObjectiveCard('Registros', objectives.registrations, 'animales')}
          ${this.renderObjectiveCard('Peso Promedio', objectives.weight, 'kg')}
          ${this.renderObjectiveCard('Nacimientos', objectives.births, 'animales')}
          ${this.renderObjectiveCard('Madres', objectives.mothers, 'madres')}
        </div>
      </div>
    `;
  }

  /**
   * Render individual objective card
   */
  renderObjectiveCard(label, data, unit = '') {
    const progressColor = data.progress >= 100 ? '#10b981' : data.progress >= 75 ? '#f59e0b' : '#ef4444';
    const progressIcon = data.progress >= 100 ? '✓' : data.progress >= 75 ? '●' : '○';
    
    return `
      <div class="objective-card">
        <div class="objective-card-header">
          <div class="objective-icon">${progressIcon}</div>
          <div class="objective-info">
            <span class="objective-label">${label}</span>
            <span class="objective-progress">${data.progress}%</span>
          </div>
        </div>
        <div class="objective-bar">
          <div class="objective-bar-fill" style="width: ${Math.min(100, data.progress)}%; background-color: ${progressColor};"></div>
        </div>
        <div class="objective-values">
          <span class="objective-current">${data.current}</span>
          <span class="objective-unit">${unit}</span>
          <span class="objective-separator">de</span>
          <span class="objective-target">${data.target}</span>
        </div>
        <div class="objective-status">
          ${data.progress >= 100 ? 'Objetivo alcanzado' : data.progress >= 75 ? 'Cerca del objetivo' : 'En progreso'}
        </div>
      </div>
    `;
  }

  /**
   * Render objectives settings
   */
  renderObjectivesSettings() {
    const objectives = this.objectives || this.loadObjectives();
    
    return `
      <div class="objectives-settings-section">
        <div class="section-header">
          <h3>Configurar Objetivos</h3>
          <p class="section-subtitle">Establece tus metas anuales para el crecimiento del ganado</p>
        </div>
        
        <form id="objectives-settings-form" class="objectives-settings-form">
          <div class="settings-grid">
            <div class="setting-group">
              <label for="target-registrations">
                Registros Objetivo
              </label>
              <input type="number" id="target-registrations" value="${objectives.targetRegistrations || 100}" min="1" placeholder="Ej: 100">
              <span class="setting-description">Total de animales a registrar este año</span>
            </div>
            
            <div class="setting-group">
              <label for="target-weight">
                Peso Objetivo (kg)
              </label>
              <input type="number" id="target-weight" value="${objectives.targetWeight || 300}" min="1" step="0.1" placeholder="Ej: 300">
              <span class="setting-description">Peso promedio objetivo por animal</span>
            </div>
            
            <div class="setting-group">
              <label for="target-births">
                Nacimientos Objetivo
              </label>
              <input type="number" id="target-births" value="${objectives.targetBirths || 50}" min="1" placeholder="Ej: 50">
              <span class="setting-description">Número de nacimientos esperados</span>
            </div>
            
            <div class="setting-group">
              <label for="target-mothers">
                Madres Objetivo
              </label>
              <input type="number" id="target-mothers" value="${objectives.targetMothers || 20}" min="1" placeholder="Ej: 20">
              <span class="setting-description">Número de madres reproductoras</span>
            </div>
          </div>
          
          <div class="settings-actions">
            <button type="submit" id="save-objectives" class="btn primary save-objectives-btn">
              Guardar Objetivos
            </button>
            <button type="button" id="reset-objectives" class="btn secondary reset-objectives-btn">
              Restaurar Valores por Defecto
            </button>
          </div>
        </form>
      </div>
    `;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Objectives form
    const objectivesForm = document.getElementById('objectives-settings-form');
    const resetBtn = document.getElementById('reset-objectives');
    
    if (objectivesForm) {
      objectivesForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const newObjectives = {
          targetRegistrations: parseInt(document.getElementById('target-registrations').value) || 100,
          targetWeight: parseFloat(document.getElementById('target-weight').value) || 300,
          targetBirths: parseInt(document.getElementById('target-births').value) || 50,
          targetMothers: parseInt(document.getElementById('target-mothers').value) || 20
        };
        
        this.updateObjectives(newObjectives);
        this.render('objectives-container');
        
        // Show success message
        this.showSuccess('Objetivos actualizados exitosamente');
        
        // Refresh metrics if available
        if (window.refreshMetrics) {
          window.refreshMetrics();
        }
      });
    }
    
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres restaurar los valores por defecto? Esto sobrescribirá tus objetivos actuales.')) {
          const defaultObjectives = {
            targetRegistrations: 100,
            targetWeight: 300,
            targetBirths: 50,
            targetMothers: 20
          };
          
          this.updateObjectives(defaultObjectives);
          this.render('objectives-container');
          
          // Show success message
          this.showSuccess('Objetivos restaurados a valores por defecto');
          
          // Refresh metrics if available
          if (window.refreshMetrics) {
            window.refreshMetrics();
          }
        }
      });
    }

    // User configuration form
    const configForm = document.getElementById('user-config-form');
    const resetConfigBtn = document.getElementById('reset-config-btn');
    
    if (configForm) {
      configForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const newConfig = {
          animalIdPrefix: document.getElementById('config-animal-prefix').value.trim().toUpperCase() || 'AC988',
          motherIdPrefix: document.getElementById('config-mother-prefix').value.trim().toUpperCase() || 'AC988',
          fatherIdPrefix: document.getElementById('config-father-prefix').value.trim().toUpperCase() || ''
        };
        
        this.updateUserConfig(newConfig);
        this.render('objectives-container');
        
        // Show success message
        this.showSuccess('Configuración actualizada exitosamente');
      });
    }
    
    if (resetConfigBtn) {
      resetConfigBtn.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres restaurar la configuración por defecto? Esto sobrescribirá tus prefijos actuales.')) {
          const defaultConfig = {
            animalIdPrefix: 'AC988',
            motherIdPrefix: 'AC988',
            fatherIdPrefix: ''
          };
          
          this.updateUserConfig(defaultConfig);
          this.render('objectives-container');
          
          // Show success message
          this.showSuccess('Configuración restaurada a valores por defecto');
        }
      });
    }
  }

  /**
   * Show success message
   */
  showSuccess(message) {
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
 * Initialize objectives functionality
 */
export function initObjectives() {
  const objectivesManager = new ObjectivesManager();
  
  return {
    manager: objectivesManager,
    render: (containerId) => objectivesManager.render(containerId || 'objectives-container')
  };
}
