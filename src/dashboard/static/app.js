/**
 * Titan Memory Dashboard Application
 * Frontend JavaScript for interactive dashboard
 */

// Global state
const state = {
  ws: null,
  connected: false,
  currentPage: 'overview',
  charts: {},
  network: null,
};

// API helper
const api = {
  baseUrl: '',

  async get(endpoint) {
    const res = await fetch(`${this.baseUrl}/api${endpoint}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async post(endpoint, data) {
    const res = await fetch(`${this.baseUrl}/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },

  async delete(endpoint) {
    const res = await fetch(`${this.baseUrl}/api${endpoint}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initWebSocket();
  initEventListeners();
  loadOverview();
});

// Navigation
function initNavigation() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      navigateTo(page);
    });
  });
}

function navigateTo(page) {
  // Update nav links
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');

  // Update pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  state.currentPage = page;

  // Load page data
  switch (page) {
    case 'overview': loadOverview(); break;
    case 'graph': loadGraph(); break;
    case 'decisions': loadDecisions(); break;
    case 'learning': loadLearning(); break;
    case 'projects': loadProjects(); break;
  }
}

// WebSocket connection
function initWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    state.connected = true;
    updateConnectionStatus('connected');
  };

  state.ws.onclose = () => {
    state.connected = false;
    updateConnectionStatus('disconnected');
    // Reconnect after 3 seconds
    setTimeout(initWebSocket, 3000);
  };

  state.ws.onerror = () => {
    updateConnectionStatus('disconnected');
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketEvent(data);
    } catch (e) {
      console.warn('Invalid WebSocket message:', event.data);
    }
  };
}

function updateConnectionStatus(status) {
  const statusEl = document.getElementById('connectionStatus');
  const dot = statusEl.querySelector('.status-dot');
  const text = statusEl.querySelector('.status-text');

  dot.className = 'status-dot ' + status;
  text.textContent = status === 'connected' ? 'Connected' : 'Disconnected';
}

function handleWebSocketEvent(data) {
  switch (data.event) {
    case 'memory:add':
      showToast('Memory added', 'success');
      if (state.currentPage === 'overview') loadOverview();
      break;
    case 'memory:delete':
      showToast('Memory deleted', 'warning');
      if (state.currentPage === 'overview') loadOverview();
      break;
    case 'project:switch':
      showToast(`Switched to project: ${data.data.projectId}`, 'success');
      document.getElementById('projectBadge').textContent = data.data.projectId;
      loadOverview();
      break;
    case 'search':
      showToast(`Search completed: ${data.data.resultCount} results`, 'success');
      break;
    case 'heartbeat':
      // Silent heartbeat
      break;
    default:
      console.log('WebSocket event:', data);
  }
}

// Event listeners
function initEventListeners() {
  // Refresh buttons
  document.getElementById('refreshStats')?.addEventListener('click', loadOverview);
  document.getElementById('refreshProjects')?.addEventListener('click', loadProjects);

  // Export button
  document.getElementById('exportBtn')?.addEventListener('click', async () => {
    try {
      const data = await api.get('/export');
      downloadJson(data, `titan-memory-export-${new Date().toISOString().split('T')[0]}.json`);
      showToast('Export downloaded', 'success');
    } catch (e) {
      showToast('Export failed', 'error');
    }
  });

  // Graph controls
  document.getElementById('graphSearchBtn')?.addEventListener('click', searchGraph);
  document.getElementById('graphSearch')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchGraph();
  });
  document.getElementById('graphZoomIn')?.addEventListener('click', () => state.network?.moveTo({ scale: state.network.getScale() * 1.2 }));
  document.getElementById('graphZoomOut')?.addEventListener('click', () => state.network?.moveTo({ scale: state.network.getScale() / 1.2 }));
  document.getElementById('graphFit')?.addEventListener('click', () => state.network?.fit());
  document.getElementById('graphStabilize')?.addEventListener('click', () => state.network?.stabilize());

  // Decision filters
  document.getElementById('decisionTypeFilter')?.addEventListener('change', loadDecisions);
  document.getElementById('decisionStatusFilter')?.addEventListener('change', loadDecisions);

  // Learning actions
  document.getElementById('runRehearsals')?.addEventListener('click', async () => {
    try {
      const result = await api.post('/rehearsals/run');
      showToast(`Rehearsals completed: ${result.length} patterns`, 'success');
      loadLearning();
    } catch (e) {
      showToast('Rehearsal failed', 'error');
    }
  });

  document.getElementById('checkForgetting')?.addEventListener('click', async () => {
    try {
      const risk = await api.get('/forgetting-risk');
      displayForgettingRisk(risk);
    } catch (e) {
      showToast('Check failed', 'error');
    }
  });

  // Search
  document.getElementById('searchBtn')?.addEventListener('click', performSearch);
  document.getElementById('searchQuery')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });

  // Add memory modal
  document.getElementById('addMemoryBtn')?.addEventListener('click', () => {
    document.getElementById('addMemoryModal').classList.add('active');
  });

  document.getElementById('cancelAddMemory')?.addEventListener('click', () => {
    document.getElementById('addMemoryModal').classList.remove('active');
  });

  document.getElementById('confirmAddMemory')?.addEventListener('click', async () => {
    const content = document.getElementById('memoryContent').value;
    const layer = document.getElementById('memoryLayer').value;
    const tags = document.getElementById('memoryTags').value.split(',').map(t => t.trim()).filter(Boolean);

    if (!content) {
      showToast('Content is required', 'error');
      return;
    }

    try {
      await api.post('/memories', {
        content,
        layer: layer ? parseInt(layer) : undefined,
        tags: tags.length ? tags : undefined,
      });
      document.getElementById('addMemoryModal').classList.remove('active');
      document.getElementById('memoryContent').value = '';
      document.getElementById('memoryLayer').value = '';
      document.getElementById('memoryTags').value = '';
      showToast('Memory added', 'success');
    } catch (e) {
      showToast('Failed to add memory', 'error');
    }
  });

  // Close modal on backdrop click
  document.getElementById('addMemoryModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'addMemoryModal') {
      document.getElementById('addMemoryModal').classList.remove('active');
    }
  });
}

// Overview page
async function loadOverview() {
  try {
    const [stats, graphStats, phase3Stats, today] = await Promise.all([
      api.get('/stats'),
      api.get('/stats/graph'),
      api.get('/stats/phase3'),
      api.get('/today'),
    ]);

    // Update stat cards
    document.getElementById('totalMemories').textContent = stats.totalMemories;
    document.getElementById('entityCount').textContent = graphStats.entityCount;
    document.getElementById('relationCount').textContent = graphStats.relationshipCount;
    document.getElementById('decisionCount').textContent = phase3Stats.decisions?.totalDecisions || 0;
    document.getElementById('projectBadge').textContent = stats.project;

    // Update layer chart
    updateLayerChart(stats);

    // Update lifecycle chart
    updateLifecycleChart(phase3Stats.learning);

    // Update today's activity
    displayTodayActivity(today);

    // Update health status
    displayHealthStatus(phase3Stats);

  } catch (e) {
    console.error('Failed to load overview:', e);
    showToast('Failed to load overview', 'error');
  }
}

function updateLayerChart(stats) {
  const ctx = document.getElementById('layerChart')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.layer) {
    state.charts.layer.destroy();
  }

  state.charts.layer = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Factual', 'Long-Term', 'Semantic', 'Episodic'],
      datasets: [{
        data: [
          stats.byLayer[2] || 0,
          stats.byLayer[3] || 0,
          stats.byLayer[4] || 0,
          stats.byLayer[5] || 0,
        ],
        backgroundColor: ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8' },
        },
      },
    },
  });
}

function updateLifecycleChart(learningStats) {
  const ctx = document.getElementById('lifecycleChart')?.getContext('2d');
  if (!ctx || !learningStats) return;

  if (state.charts.lifecycle) {
    state.charts.lifecycle.destroy();
  }

  const byStage = learningStats.byStage || {};

  state.charts.lifecycle = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Immature', 'Developing', 'Mature', 'Stable', 'Archived'],
      datasets: [{
        label: 'Patterns',
        data: [
          byStage.immature || 0,
          byStage.developing || 0,
          byStage.mature || 0,
          byStage.stable || 0,
          byStage.archived || 0,
        ],
        backgroundColor: '#6366f1',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8' },
          grid: { color: '#334155' },
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid: { display: false },
        },
      },
    },
  });
}

function displayTodayActivity(entries) {
  const container = document.getElementById('todayActivity');
  if (!container) return;

  if (!entries || entries.length === 0) {
    container.innerHTML = '<p class="placeholder">No activity today</p>';
    return;
  }

  container.innerHTML = entries.slice(0, 5).map(entry => `
    <div class="activity-item">
      <span class="activity-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
      <span class="activity-content">${truncate(entry.content, 50)}</span>
    </div>
  `).join('');
}

function displayHealthStatus(phase3Stats) {
  const container = document.getElementById('healthStatus');
  if (!container) return;

  const validation = phase3Stats.validation || {};
  const healthScore = validation.healthScore || 1;
  const issueCount = validation.openIssues || 0;

  const healthClass = healthScore > 0.8 ? 'success' : healthScore > 0.5 ? 'warning' : 'danger';
  const healthPercent = Math.round(healthScore * 100);

  container.innerHTML = `
    <div class="health-meter">
      <div class="health-bar ${healthClass}" style="width: ${healthPercent}%"></div>
    </div>
    <p class="health-score">Health Score: <strong>${healthPercent}%</strong></p>
    <p class="health-issues">${issueCount} open issues</p>
  `;
}

// Graph page
async function loadGraph() {
  try {
    const stats = await api.get('/stats/graph');
    document.getElementById('graphEntityCount').textContent = stats.entityCount;
    document.getElementById('graphRelationCount').textContent = stats.relationshipCount;
    document.getElementById('graphAvgConnections').textContent = stats.avgConnections?.toFixed(2) || '0';

    // Initialize empty network
    initNetwork([]);
  } catch (e) {
    console.error('Failed to load graph:', e);
  }
}

async function searchGraph() {
  const query = document.getElementById('graphSearch').value.trim();
  if (!query) return;

  try {
    const result = await api.post('/graph/query', {
      entities: [query],
      maxDepth: 2,
    });
    initNetwork(result);
  } catch (e) {
    showToast('Graph search failed', 'error');
  }
}

function initNetwork(graphData) {
  const container = document.getElementById('graphCanvas');
  if (!container) return;

  const nodes = new vis.DataSet((graphData.nodes || []).map(n => ({
    id: n.id || n.name,
    label: n.name || n.id,
    color: getEntityColor(n.type),
    shape: 'dot',
    size: 15,
  })));

  const edges = new vis.DataSet((graphData.edges || graphData.relationships || []).map((e, i) => ({
    id: i,
    from: e.from || e.source,
    to: e.to || e.target,
    label: e.type || e.relationship,
    arrows: 'to',
    color: { color: '#64748b', opacity: 0.8 },
  })));

  const options = {
    nodes: {
      font: { color: '#f1f5f9' },
    },
    edges: {
      font: { color: '#94a3b8', size: 10 },
      smooth: { type: 'continuous' },
    },
    physics: {
      stabilization: { iterations: 100 },
      barnesHut: {
        gravitationalConstant: -3000,
        springConstant: 0.04,
        damping: 0.09,
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
    },
  };

  state.network = new vis.Network(container, { nodes, edges }, options);
}

function getEntityColor(type) {
  const colors = {
    person: '#6366f1',
    organization: '#8b5cf6',
    project: '#10b981',
    technology: '#06b6d4',
    file: '#f59e0b',
    function: '#ef4444',
    concept: '#ec4899',
    decision: '#84cc16',
    error: '#f43f5e',
    solution: '#22c55e',
  };
  return colors[type] || '#64748b';
}

// Decisions page
async function loadDecisions() {
  try {
    const type = document.getElementById('decisionTypeFilter')?.value;
    const status = document.getElementById('decisionStatusFilter')?.value;

    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (status) params.append('status', status);
    params.append('limit', '50');

    const result = await api.get(`/decisions?${params}`);
    displayDecisions(result.decisions || []);
  } catch (e) {
    console.error('Failed to load decisions:', e);
  }
}

function displayDecisions(decisions) {
  const container = document.getElementById('decisionTimeline');
  if (!container) return;

  if (decisions.length === 0) {
    container.innerHTML = '<p class="placeholder">No decisions recorded</p>';
    return;
  }

  container.innerHTML = decisions.map(d => `
    <div class="decision-item">
      <div class="decision-marker ${d.outcome?.status || 'pending'}"></div>
      <div class="decision-content">
        <div class="decision-summary">${d.summary}</div>
        <div class="decision-meta">
          <span class="decision-type">${d.type}</span>
          <span>${new Date(d.createdAt).toLocaleDateString()}</span>
          <span>Confidence: ${Math.round((d.confidence || 0) * 100)}%</span>
        </div>
      </div>
    </div>
  `).join('');
}

// Learning page
async function loadLearning() {
  try {
    const [stats, rehearsals] = await Promise.all([
      api.get('/stats/learning'),
      api.get('/rehearsals'),
    ]);

    document.getElementById('patternCount').textContent = stats.totalPatterns || 0;
    document.getElementById('avgPlasticity').textContent = (stats.avgPlasticity || 0).toFixed(2);
    document.getElementById('avgStability').textContent = (stats.avgStability || 0).toFixed(2);
    document.getElementById('pendingRehearsals').textContent = rehearsals?.length || 0;

    updateMaturityChart(stats);
    updateLearningActivityChart(stats);
  } catch (e) {
    console.error('Failed to load learning stats:', e);
  }
}

function updateMaturityChart(stats) {
  const ctx = document.getElementById('maturityChart')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.maturity) {
    state.charts.maturity.destroy();
  }

  const byStage = stats.byStage || {};

  state.charts.maturity = new Chart(ctx, {
    type: 'polarArea',
    data: {
      labels: ['Immature', 'Developing', 'Mature', 'Stable', 'Archived'],
      datasets: [{
        data: [
          byStage.immature || 0,
          byStage.developing || 0,
          byStage.mature || 0,
          byStage.stable || 0,
          byStage.archived || 0,
        ],
        backgroundColor: [
          'rgba(239, 68, 68, 0.7)',
          'rgba(245, 158, 11, 0.7)',
          'rgba(16, 185, 129, 0.7)',
          'rgba(99, 102, 241, 0.7)',
          'rgba(100, 116, 139, 0.7)',
        ],
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8' },
        },
      },
    },
  });
}

function updateLearningActivityChart(stats) {
  const ctx = document.getElementById('learningActivityChart')?.getContext('2d');
  if (!ctx) return;

  if (state.charts.learningActivity) {
    state.charts.learningActivity.destroy();
  }

  // Simulated activity data (would come from real metrics in production)
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const data = Array(7).fill(0).map(() => Math.floor(Math.random() * 10));

  state.charts.learningActivity = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Patterns Updated',
        data,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8' },
          grid: { color: '#334155' },
        },
        x: {
          ticks: { color: '#94a3b8' },
          grid: { display: false },
        },
      },
    },
  });
}

function displayForgettingRisk(risk) {
  const container = document.getElementById('forgettingRisk');
  if (!container) return;

  const riskClass = risk.alert ? 'danger' : risk.riskLevel > 0.3 ? 'warning' : 'success';
  const riskPercent = Math.round(risk.riskLevel * 100);

  container.innerHTML = `
    <div class="risk-meter">
      <div class="risk-bar ${riskClass}" style="width: ${riskPercent}%"></div>
    </div>
    <p>Risk Level: <strong>${riskPercent}%</strong></p>
    ${risk.alert ? `<p class="alert">Alert: ${risk.affectedPatterns?.length || 0} patterns at risk</p>` : ''}
    ${risk.affectedPatterns?.length > 0 ? `
      <ul class="affected-patterns">
        ${risk.affectedPatterns.slice(0, 5).map(p => `<li>${p.id.slice(0, 8)}: ${p.divergence?.toFixed(2) || '?'}</li>`).join('')}
      </ul>
    ` : ''}
  `;
}

// Search page
async function performSearch() {
  const query = document.getElementById('searchQuery').value.trim();
  if (!query) {
    showToast('Enter a search query', 'warning');
    return;
  }

  const layers = Array.from(document.querySelectorAll('.layer-filter:checked')).map(el => parseInt(el.value));
  const limit = parseInt(document.getElementById('searchLimit').value) || 10;

  try {
    const result = await api.post('/search', {
      query,
      limit,
      layers: layers.length ? layers : undefined,
    });
    displaySearchResults(result.fusedMemories || []);
  } catch (e) {
    showToast('Search failed', 'error');
  }
}

function displaySearchResults(memories) {
  const container = document.getElementById('searchResults');
  if (!container) return;

  if (memories.length === 0) {
    container.innerHTML = '<p class="placeholder">No results found</p>';
    return;
  }

  const layerNames = { 2: 'factual', 3: 'longterm', 4: 'semantic', 5: 'episodic' };

  container.innerHTML = memories.map(m => `
    <div class="search-result">
      <div class="search-result-header">
        <span class="search-result-id">${m.id.slice(0, 12)}...</span>
        <span class="search-result-layer layer-${layerNames[m.layer] || 'unknown'}">${layerNames[m.layer] || 'Unknown'}</span>
      </div>
      <div class="search-result-content">${truncate(m.content, 300)}</div>
    </div>
  `).join('');
}

// Projects page
async function loadProjects() {
  try {
    const data = await api.get('/projects');
    document.getElementById('projectBadge').textContent = data.active;

    const activeCard = document.getElementById('activeProjectCard');
    if (activeCard) {
      activeCard.querySelector('.project-name').textContent = data.active;
    }

    const list = document.getElementById('projectsList');
    if (list) {
      list.innerHTML = data.projects.map(p => `
        <div class="project-card ${p === data.active ? 'active' : ''}" data-project="${p}">
          <span class="project-name">${p}</span>
          ${p === data.active ? '<span class="project-badge">Current</span>' : '<button class="btn btn-secondary btn-sm">Switch</button>'}
        </div>
      `).join('');

      // Add click handlers
      list.querySelectorAll('.project-card:not(.active)').forEach(card => {
        card.addEventListener('click', async () => {
          const projectId = card.dataset.project;
          try {
            await api.post('/projects/switch', { projectId });
            loadProjects();
          } catch (e) {
            showToast('Failed to switch project', 'error');
          }
        });
      });
    }
  } catch (e) {
    console.error('Failed to load projects:', e);
  }
}

// Utility functions
function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
