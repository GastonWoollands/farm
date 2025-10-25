import { getRecords } from '../../db.js';

/**
 * Metrics calculation and rendering module
 * Provides comprehensive analytics for farm animal registrations
 */
export class MetricsCalculator {
  constructor() {
    this.records = [];
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
   * Calculate all metrics from records
   */
  async calculateMetrics() {
    this.records = await getRecords();
    const cows = this.records.filter(r => r.animalType === 1);
    // const pigs = this.records.filter(r => r.animalType === 2);
    
    return {
      overview: this.calculateOverview(),
      cows: this.calculateAnimalTypeMetrics(cows, 'Animales'),
      // pigs: this.calculateAnimalTypeMetrics(pigs, 'Cerdos'),
      objectives: this.calculateObjectiveMetrics()
    };
  }

  /**
   * Calculate general overview metrics
   */
  calculateOverview() {
    const total = this.records.length;
    const synced = this.records.filter(r => r.synced).length;
    const pending = total - synced;
    const cows = this.records.filter(r => r.animalType === 1).length;
    // const pigs = this.records.filter(r => r.animalType === 2).length;
    
    return {
      total,
      synced,
      pending,
      syncRate: total > 0 ? Math.round((synced / total) * 100) : 0,
      cows,
      // pigs
    };
  }

  /**
   * Calculate metrics for a specific animal type (cows)
   */
  calculateAnimalTypeMetrics(records, typeName) {
    if (records.length === 0) {
      return {
        typeName,
        count: 0,
        gender: [],
        status: [],
        weight: { count: 0, average: 0, min: 0, max: 0, median: 0, ranges: [] },
        mothers: { totalMothers: 0, totalOffspring: 0, averageOffspring: 0, topMothers: [], mothersWithMultipleOffspring: 0 },
        gain: { totalRecords: 0, averageGain: 0, minGain: 0, maxGain: 0, medianGain: 0, byInseminationRound: [], topPerformers: [], bottomPerformers: [] }
      };
    }

    return {
      typeName,
      count: records.length,
      gender: this.calculateGenderMetricsForRecords(records),
      status: this.calculateStatusMetricsForRecords(records),
      weight: this.calculateWeightMetricsForRecords(records),
      mothers: this.calculateMotherMetricsForRecords(records),
      gain: this.calculateGainMetricsForRecords(records)
    };
  }

  /**
   * Calculate gender distribution metrics for specific records
   */
  calculateGenderMetricsForRecords(records) {
    const genderCounts = records.reduce((acc, record) => {
      const gender = record.gender || 'UNKNOWN';
      acc[gender] = (acc[gender] || 0) + 1;
      return acc;
    }, {});

    const total = records.length;
    return Object.entries(genderCounts).map(([gender, count]) => ({
      gender: this.formatGender(gender),
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }));
  }

  /**
   * Calculate gender distribution metrics
   */
  calculateGenderMetrics() {
    return this.calculateGenderMetricsForRecords(this.records);
  }

  /**
   * Calculate status distribution metrics for specific records
   */
  calculateStatusMetricsForRecords(records) {
    const statusCounts = records.reduce((acc, record) => {
      const status = record.status || 'UNKNOWN';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const total = records.length;
    return Object.entries(statusCounts).map(([status, count]) => ({
      status: this.formatStatus(status),
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }));
  }

  /**
   * Calculate status distribution metrics
   */
  calculateStatusMetrics() {
    return this.calculateStatusMetricsForRecords(this.records);
  }

  /**
   * Calculate weight metrics for specific records
   */
  calculateWeightMetricsForRecords(records) {
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
        median: 0,
        ranges: []
      };
    }

    const sorted = [...weights].sort((a, b) => a - b);
    const average = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    const median = sorted.length % 2 === 0 
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    // Weight ranges - for cows only
    const ranges = [
      { label: '0-100 kg', min: 0, max: 100, count: 0 },
      { label: '100-200 kg', min: 100, max: 200, count: 0 },
      { label: '200-300 kg', min: 200, max: 300, count: 0 },
      { label: '300-400 kg', min: 300, max: 400, count: 0 },
      { label: '400+ kg', min: 400, max: Infinity, count: 0 }
    ];

    weights.forEach(weight => {
      const range = ranges.find(r => weight >= r.min && weight < r.max);
      if (range) range.count++;
    });

    return {
      count: weights.length,
      average: Math.round(average * 10) / 10,
      min: Math.min(...weights),
      max: Math.max(...weights),
      median: Math.round(median * 10) / 10,
      ranges: ranges.filter(r => r.count > 0)
    };
  }

  /**
   * Calculate weight metrics
   */
  calculateWeightMetrics() {
    return this.calculateWeightMetricsForRecords(this.records);
  }

  /**
   * Calculate mother ID metrics for specific records
   */
  calculateMotherMetricsForRecords(records) {
    const motherCounts = records.reduce((acc, record) => {
      if (record.motherId) {
        acc[record.motherId] = (acc[record.motherId] || 0) + 1;
      }
      return acc;
    }, {});

    const mothers = Object.entries(motherCounts)
      .map(([motherId, offspringCount]) => ({
        motherId,
        offspringCount
      }))
      .sort((a, b) => b.offspringCount - a.offspringCount);

    const totalMothers = Object.keys(motherCounts).length;
    const totalOffspring = Object.values(motherCounts).reduce((sum, count) => sum + count, 0);
    const averageOffspring = totalMothers > 0 ? Math.round((totalOffspring / totalMothers) * 10) / 10 : 0;

    return {
      totalMothers,
      totalOffspring,
      averageOffspring,
      topMothers: mothers.slice(0, 10),
      mothersWithMultipleOffspring: mothers.filter(m => m.offspringCount > 1).length
    };
  }

  /**
   * Calculate gain percentage metrics for specific records
   * Gain = (newborn weight / mother weight) * 100
   */
  calculateGainMetricsForRecords(records) {
    // Filter records that have both newborn weight and mother weight
    const validRecords = records.filter(record => 
      record.weight && 
      record.motherWeight && 
      record.motherId &&
      record.weight > 0 && 
      record.motherWeight > 0
    );

    if (validRecords.length === 0) {
      return {
        totalRecords: 0,
        averageGain: 0,
        minGain: 0,
        maxGain: 0,
        medianGain: 0,
        byInseminationRound: {},
        topPerformers: [],
        bottomPerformers: []
      };
    }

    // Calculate gain percentages
    const gainData = validRecords.map(record => {
      const gainPercentage = (record.weight / record.motherWeight) * 100;
      return {
        animalNumber: record.animalNumber,
        motherId: record.motherId,
        newbornWeight: record.weight,
        motherWeight: record.motherWeight,
        gainPercentage: Math.round(gainPercentage * 10) / 10, // Round to 1 decimal
        inseminationRoundId: record.inseminationRoundId || 'Sin Ronda'
      };
    });

    // Calculate overall statistics
    const gains = gainData.map(d => d.gainPercentage);
    const sortedGains = [...gains].sort((a, b) => a - b);
    const averageGain = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
    const medianGain = sortedGains.length % 2 === 0 
      ? (sortedGains[sortedGains.length / 2 - 1] + sortedGains[sortedGains.length / 2]) / 2
      : sortedGains[Math.floor(sortedGains.length / 2)];

    // Group by insemination round
    const byInseminationRound = gainData.reduce((acc, record) => {
      const roundId = record.inseminationRoundId;
      if (!acc[roundId]) {
        acc[roundId] = {
          roundId,
          records: [],
          averageGain: 0,
          count: 0
        };
      }
      acc[roundId].records.push(record);
      acc[roundId].count++;
      return acc;
    }, {});

    // Calculate average gain per round
    Object.values(byInseminationRound).forEach(round => {
      const roundGains = round.records.map(r => r.gainPercentage);
      round.averageGain = Math.round((roundGains.reduce((sum, gain) => sum + gain, 0) / roundGains.length) * 10) / 10;
    });

    // Get top and bottom performers (by mother)
    const motherPerformance = gainData.reduce((acc, record) => {
      if (!acc[record.motherId]) {
        acc[record.motherId] = {
          motherId: record.motherId,
          records: [],
          averageGain: 0,
          count: 0
        };
      }
      acc[record.motherId].records.push(record);
      acc[record.motherId].count++;
      return acc;
    }, {});

    // Calculate average gain per mother
    Object.values(motherPerformance).forEach(mother => {
      const motherGains = mother.records.map(r => r.gainPercentage);
      mother.averageGain = Math.round((motherGains.reduce((sum, gain) => sum + gain, 0) / motherGains.length) * 10) / 10;
    });

    const motherPerformanceArray = Object.values(motherPerformance)
      .filter(m => m.count >= 1) // Only mothers with at least 1 record
      .sort((a, b) => b.averageGain - a.averageGain);

    return {
      totalRecords: validRecords.length,
      averageGain: Math.round(averageGain * 10) / 10,
      minGain: Math.min(...gains),
      maxGain: Math.max(...gains),
      medianGain: Math.round(medianGain * 10) / 10,
      byInseminationRound: Object.values(byInseminationRound).sort((a, b) => b.averageGain - a.averageGain),
      topPerformers: motherPerformanceArray.slice(0, 10),
      bottomPerformers: motherPerformanceArray.slice(-10).reverse()
    };
  }

  /**
   * Calculate mother ID metrics
   */
  calculateMotherMetrics() {
    return this.calculateMotherMetricsForRecords(this.records);
  }

  /**
   * Calculate objective-based metrics
   */
  calculateObjectiveMetrics() {
    const currentRegistrations = this.records.length;
    const currentWeight = this.calculateWeightMetrics().average;
    // Every registration counts as a birth since this is a born registration app
    const currentBirths = currentRegistrations;
    const currentMothers = this.calculateMotherMetrics().totalMothers;

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
   * Calculate timeline metrics (registrations over time)
   */
  calculateTimelineMetrics() {
    const monthlyData = this.records.reduce((acc, record) => {
      const date = new Date(record.createdAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      acc[monthKey] = (acc[monthKey] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(monthlyData)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12); // Last 12 months
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
}

/**
 * Metrics UI renderer
 */
export class MetricsRenderer {
  constructor(calculator) {
    this.calculator = calculator;
    this.container = null;
  }

  /**
   * Render the complete metrics dashboard
   */
  async render(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    const metrics = await this.calculator.calculateMetrics();
    
    this.container.innerHTML = `
      <div class="metrics-dashboard">
        ${this.renderOverview(metrics.overview)}
        ${this.renderObjectives(metrics.objectives)}
        ${this.renderAnimalTypeTabs(metrics.cows)}
      </div>
    `;

    this.setupEventListeners();
  }

  /**
   * Render overview section
   */
  renderOverview(overview) {
    return `
      <div class="metrics-section">
        <h3>Resumen General</h3>
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-value">${overview.total}</div>
            <div class="metric-label">Total Registros</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${overview.cows}</div>
            <div class="metric-label">Animales</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${overview.syncRate}%</div>
            <div class="metric-label">Tasa de Sincronización</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render objectives section
   */
  renderObjectives(objectives) {
    return `
      <div class="metrics-section">
        <h3>Objetivos del Año</h3>
        <div class="objectives-grid">
          ${this.renderObjectiveCard('Registros', objectives.registrations)}
          ${this.renderObjectiveCard('Peso Promedio', objectives.weight, 'kg')}
          ${this.renderObjectiveCard('Nacimientos', objectives.births)}
          ${this.renderObjectiveCard('Madres', objectives.mothers)}
        </div>
      </div>
    `;
  }

  /**
   * Render individual objective card
   */
  renderObjectiveCard(label, data, unit = '') {
    const progressColor = data.progress >= 100 ? '#10b981' : data.progress >= 75 ? '#f59e0b' : '#ef4444';
    
    return `
      <div class="objective-card">
        <div class="objective-header">
          <span class="objective-label">${label}</span>
          <span class="objective-progress">${data.progress}%</span>
        </div>
        <div class="objective-bar">
          <div class="objective-bar-fill" style="width: ${Math.min(100, data.progress)}%; background-color: ${progressColor};"></div>
        </div>
        <div class="objective-values">
          <span class="objective-current">${data.current}${unit}</span>
          <span class="objective-target">/ ${data.target}${unit}</span>
        </div>
      </div>
    `;
  }

  /**
   * Render animal type tabs (cows only)
   */
  renderAnimalTypeTabs(cows) {
    return `
      <div class="metrics-section">
        <h3>Métricas por Tipo de Animal</h3>
        <div class="animal-type-tabs">
          <button class="animal-tab active" data-type="cows">Animales (${cows.count})</button>
        </div>
        <div class="animal-type-content">
          <div id="cows-metrics" class="animal-metrics active">
            ${this.renderAnimalTypeMetrics(cows)}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render metrics for a specific animal type
   */
  renderAnimalTypeMetrics(animalData) {
    if (animalData.count === 0) {
      return `
        <div class="no-data">
          <p>No hay registros de ${animalData.typeName.toLowerCase()}</p>
        </div>
      `;
    }

    return `
      <div class="animal-metrics-content">
        <div class="metrics-section">
          <h4>Resumen de ${animalData.typeName}</h4>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-value">${animalData.count}</div>
              <div class="metric-label">Total ${animalData.typeName}</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${animalData.weight.count}</div>
              <div class="metric-label">Con Peso</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${animalData.mothers.totalMothers}</div>
              <div class="metric-label">Madres</div>
            </div>
            <div class="metric-card">
              <div class="metric-value">${animalData.mothers.totalOffspring}</div>
              <div class="metric-label">Crías</div>
            </div>
          </div>
        </div>
        ${this.renderGenderStatus(animalData.gender, animalData.status)}
        ${this.renderWeightMetrics(animalData.weight)}
        ${this.renderMotherMetrics(animalData.mothers)}
        ${this.renderGainMetrics(animalData.gain)}
      </div>
    `;
  }



  /**
   * Render gender and status distribution
   */
  renderGenderStatus(gender, status) {
    return `
      <div class="metrics-section">
        <h3>Distribución por Sexo y Estado</h3>
        <div class="distribution-grid">
          <div class="distribution-card">
            <h4>Sexo</h4>
            <div class="distribution-list">
              ${gender.map(g => `
                <div class="distribution-item">
                  <span class="distribution-label">${g.gender}</span>
                  <div class="distribution-bar">
                    <div class="distribution-bar-fill" style="width: ${g.percentage}%;"></div>
                  </div>
                  <span class="distribution-value">${g.count} (${g.percentage}%)</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="distribution-card">
            <h4>Estado</h4>
            <div class="distribution-list">
              ${status.map(s => `
                <div class="distribution-item">
                  <span class="distribution-label">${s.status}</span>
                  <div class="distribution-bar">
                    <div class="distribution-bar-fill" style="width: ${s.percentage}%;"></div>
                  </div>
                  <span class="distribution-value">${s.count} (${s.percentage}%)</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render weight metrics
   */
  renderWeightMetrics(weight) {
    if (weight.count === 0) {
      return `
        <div class="metrics-section">
          <h3>Métricas de Peso</h3>
          <p class="no-data">No hay datos de peso disponibles</p>
        </div>
      `;
    }

    return `
      <div class="metrics-section">
        <h3>Métricas de Peso</h3>
        <div class="weight-stats">
          <div class="weight-stat">
            <span class="weight-value">${weight.average} kg</span>
            <span class="weight-label">Promedio</span>
          </div>
          <div class="weight-stat">
            <span class="weight-value">${weight.median} kg</span>
            <span class="weight-label">Mediana</span>
          </div>
          <div class="weight-stat">
            <span class="weight-value">${weight.min} kg</span>
            <span class="weight-label">Mínimo</span>
          </div>
          <div class="weight-stat">
            <span class="weight-value">${weight.max} kg</span>
            <span class="weight-label">Máximo</span>
          </div>
        </div>
        <div class="weight-ranges">
          <h4>Distribución por Rangos</h4>
          <div class="ranges-list">
            ${weight.ranges.map(range => `
              <div class="range-item">
                <span class="range-label">${range.label}</span>
                <div class="range-bar">
                  <div class="range-bar-fill" style="width: ${(range.count / weight.count) * 100}%;"></div>
                </div>
                <span class="range-count">${range.count}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render mother metrics
   */
  renderMotherMetrics(mothers) {
    return `
      <div class="metrics-section">
        <h3>Métricas de Madres</h3>
        <div class="mother-stats">
          <div class="mother-stat">
            <span class="mother-value">${mothers.totalMothers}</span>
            <span class="mother-label">Total Madres</span>
          </div>
          <div class="mother-stat">
            <span class="mother-value">${mothers.averageOffspring}</span>
            <span class="mother-label">Promedio de Crías</span>
          </div>
          <div class="mother-stat">
            <span class="mother-value">${mothers.mothersWithMultipleOffspring}</span>
            <span class="mother-label">Con Múltiples Crías</span>
          </div>
        </div>
        ${mothers.topMothers.length > 0 ? `
          <div class="top-mothers">
            <h4>Madres Más Productivas</h4>
            <div class="top-mothers-list">
              ${mothers.topMothers.slice(0, 5).map(mother => `
                <div class="top-mother-item">
                  <span class="mother-id">${mother.motherId}</span>
                  <span class="offspring-count">${mother.offspringCount} crías</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render gain percentage metrics
   */
  renderGainMetrics(gainData) {
    if (gainData.totalRecords === 0) {
      return `
        <div class="metrics-section">
          <h3>Métricas de Ganancia</h3>
          <div class="no-data">
            <p>No hay datos suficientes para calcular ganancias (se requiere peso del animal y peso de la madre)</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="metrics-section">
        <h3>Métricas de Ganancia</h3>
        <div class="gain-stats">
          <div class="gain-stat">
            <span class="gain-value">${gainData.averageGain}%</span>
            <span class="gain-label">Ganancia Promedio</span>
          </div>
          <div class="gain-stat">
            <span class="gain-value">${gainData.minGain}%</span>
            <span class="gain-label">Ganancia Mínima</span>
          </div>
          <div class="gain-stat">
            <span class="gain-value">${gainData.maxGain}%</span>
            <span class="gain-label">Ganancia Máxima</span>
          </div>
          <div class="gain-stat">
            <span class="gain-value">${gainData.medianGain}%</span>
            <span class="gain-label">Ganancia Mediana</span>
          </div>
        </div>
        
        ${gainData.byInseminationRound.length > 0 ? `
          <div class="insemination-rounds">
            <h4>Rendimiento por Ronda de Inseminación</h4>
            <div class="rounds-list">
              ${gainData.byInseminationRound.map(round => `
                <div class="round-item">
                  <div class="round-header">
                    <span class="round-id">Ronda ${round.roundId}</span>
                    <span class="round-count">${round.count} animales</span>
                  </div>
                  <div class="round-gain">
                    <span class="round-gain-value">${round.averageGain}%</span>
                    <span class="round-gain-label">Ganancia Promedio</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
        
        ${gainData.topPerformers.length > 0 ? `
          <div class="performance-mothers">
            <div class="top-performers">
              <h4>Mejores Madres (Mayor Ganancia)</h4>
              <div class="performers-list">
                ${gainData.topPerformers.slice(0, 5).map(mother => `
                  <div class="performer-item">
                    <span class="performer-id">${mother.motherId}</span>
                    <span class="performer-gain">${mother.averageGain}%</span>
                    <span class="performer-count">(${mother.count} cría${mother.count > 1 ? 's' : ''})</span>
                  </div>
                `).join('')}
              </div>
            </div>
            
            ${gainData.bottomPerformers.length > 0 ? `
              <div class="bottom-performers">
                <h4>Madres con Menor Rendimiento</h4>
                <div class="performers-list">
                  ${gainData.bottomPerformers.slice(0, 5).map(mother => `
                    <div class="performer-item">
                      <span class="performer-id">${mother.motherId}</span>
                      <span class="performer-gain">${mother.averageGain}%</span>
                      <span class="performer-count">(${mother.count} cría${mother.count > 1 ? 's' : ''})</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render timeline metrics
   */
  renderTimeline(timeline) {
    if (timeline.length === 0) {
      return '';
    }

    const maxCount = Math.max(...timeline.map(t => t.count));
    
    return `
      <div class="metrics-section">
        <h3>Registros por Mes</h3>
        <div class="timeline-chart">
          ${timeline.map(month => `
            <div class="timeline-bar">
              <div class="timeline-bar-fill" style="height: ${(month.count / maxCount) * 100}%;"></div>
              <span class="timeline-label">${month.month}</span>
              <span class="timeline-count">${month.count}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render objectives settings
   */
  renderObjectivesSettings() {
    const objectives = this.calculator.objectives;
    
    return `
      <div class="metrics-section">
        <h3>Configurar Objetivos</h3>
        <div class="objectives-settings">
          <div class="setting-group">
            <label for="target-registrations">Registros Objetivo:</label>
            <input type="number" id="target-registrations" value="${objectives.targetRegistrations}" min="1">
          </div>
          <div class="setting-group">
            <label for="target-weight">Peso Objetivo (kg):</label>
            <input type="number" id="target-weight" value="${objectives.targetWeight}" min="1" step="0.1">
          </div>
          <div class="setting-group">
            <label for="target-births">Nacimientos Objetivo:</label>
            <input type="number" id="target-births" value="${objectives.targetBirths}" min="1">
          </div>
          <div class="setting-group">
            <label for="target-mothers">Madres Objetivo:</label>
            <input type="number" id="target-mothers" value="${objectives.targetMothers}" min="1">
          </div>
          <button id="save-objectives" class="btn primary">Guardar Objetivos</button>
        </div>
      </div>
    `;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Animal type tabs
    const animalTabs = this.container.querySelectorAll('.animal-tab');
    animalTabs.forEach(tab => {
      tab.addEventListener('click', () => this.switchAnimalType(tab.dataset.type));
    });
  }

  /**
   * Switch between animal type tabs
   */
  switchAnimalType(type) {
    // Update tab buttons
    const tabs = this.container.querySelectorAll('.animal-tab');
    tabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.type === type);
    });

    // Update content
    const contents = this.container.querySelectorAll('.animal-metrics');
    contents.forEach(content => {
      content.classList.toggle('active', content.id === `${type}-metrics`);
    });
  }
}

/**
 * Initialize metrics functionality
 */
export function initMetrics() {
  const calculator = new MetricsCalculator();
  const renderer = new MetricsRenderer(calculator);
  
  return {
    calculator,
    renderer,
    render: () => renderer.render('metrics-container')
  };
}
