<script>
  import { onMount } from 'svelte';
  
  let gpus = [];
  let loading = true;
  let error = null;
  let selectedGpu = null;
  let showDetails = false;
  
  // Filter state
  let filters = {
    status: 'all',
    utilization: 'all',
    search: ''
  };
  
  onMount(async () => {
    try {
      // In a real app, this would fetch data from the API
      // For now, we'll use mock data
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
      
      gpus = [
        {
          id: 'gpu-1',
          name: 'NVIDIA RTX 4090',
          node: 'Primary GPU Server',
          nodeId: 'node-1',
          status: 'active',
          memory: {
            total: '24GB',
            used: '20.5GB',
            free: '3.5GB',
            percentage: 85
          },
          utilization: 92,
          temperature: 72,
          power: {
            draw: '320W',
            limit: '450W',
            percentage: 71
          },
          processes: [
            { name: 'stable-diffusion', memory: '15.2GB', utilization: 80 },
            { name: 'python3', memory: '5.3GB', utilization: 12 }
          ],
          stats: {
            hourly: [85, 92, 88, 76, 82, 90, 92, 94, 90, 88, 86, 92],
            daily: [75, 82, 88, 92, 86, 78, 80]
          }
        },
        {
          id: 'gpu-2',
          name: 'NVIDIA RTX 4090',
          node: 'Primary GPU Server',
          nodeId: 'node-1',
          status: 'active',
          memory: {
            total: '24GB',
            used: '14.8GB',
            free: '9.2GB',
            percentage: 62
          },
          utilization: 78,
          temperature: 68,
          power: {
            draw: '290W',
            limit: '450W',
            percentage: 64
          },
          processes: [
            { name: 'llama3-inference', memory: '14.8GB', utilization: 78 }
          ],
          stats: {
            hourly: [65, 72, 78, 80, 75, 70, 72, 78, 80, 78, 75, 78],
            daily: [60, 68, 75, 78, 72, 65, 70]
          }
        },
        {
          id: 'gpu-3',
          name: 'NVIDIA RTX 3090',
          node: 'Secondary GPU Server',
          nodeId: 'node-2',
          status: 'active',
          memory: {
            total: '24GB',
            used: '18GB',
            free: '6GB',
            percentage: 75
          },
          utilization: 88,
          temperature: 75,
          power: {
            draw: '340W',
            limit: '350W',
            percentage: 97
          },
          processes: [
            { name: 'mistral-inference', memory: '18GB', utilization: 88 }
          ],
          stats: {
            hourly: [82, 85, 88, 90, 88, 86, 84, 88, 90, 88, 86, 88],
            daily: [75, 80, 85, 88, 86, 82, 85]
          }
        },
        {
          id: 'gpu-4',
          name: 'NVIDIA A100',
          node: 'AI Research Cluster',
          nodeId: 'node-3',
          status: 'active',
          memory: {
            total: '80GB',
            used: '46.4GB',
            free: '33.6GB',
            percentage: 58
          },
          utilization: 65,
          temperature: 62,
          power: {
            draw: '280W',
            limit: '400W',
            percentage: 70
          },
          processes: [
            { name: 'pytorch-training', memory: '46.4GB', utilization: 65 }
          ],
          stats: {
            hourly: [60, 62, 65, 68, 70, 68, 65, 62, 60, 62, 65, 65],
            daily: [55, 60, 65, 68, 65, 62, 65]
          }
        },
        {
          id: 'gpu-5',
          name: 'NVIDIA RTX 3080',
          node: 'Edge Inference Server',
          nodeId: 'node-4',
          status: 'offline',
          memory: {
            total: '10GB',
            used: '0GB',
            free: '10GB',
            percentage: 0
          },
          utilization: 0,
          temperature: 0,
          power: {
            draw: '0W',
            limit: '320W',
            percentage: 0
          },
          processes: [],
          stats: {
            hourly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            daily: [45, 60, 55, 0, 0, 0, 0]
          }
        }
      ];
      
      loading = false;
    } catch (err) {
      error = err.message || 'Failed to load GPU data';
      loading = false;
    }
  });
  
  function openGpuDetails(gpu) {
    selectedGpu = gpu;
    showDetails = true;
  }
  
  function closeGpuDetails() {
    showDetails = false;
  }
  
  function getStatusClass(status) {
    return `status-${status === 'active' ? 'online' : 'offline'}`;
  }
  
  function getUtilizationClass(utilization) {
    if (utilization >= 80) return 'high';
    if (utilization >= 50) return 'medium';
    return 'low';
  }
  
  function getTemperatureClass(temp) {
    if (temp >= 80) return 'high';
    if (temp >= 70) return 'medium';
    return 'low';
  }
  
  // Filter GPUs based on current filters
  $: filteredGpus = gpus.filter(gpu => {
    // Filter by status
    if (filters.status !== 'all' && gpu.status !== filters.status) return false;
    
    // Filter by utilization
    if (filters.utilization === 'high' && gpu.utilization < 80) return false;
    if (filters.utilization === 'medium' && (gpu.utilization < 50 || gpu.utilization >= 80)) return false;
    if (filters.utilization === 'low' && gpu.utilization >= 50) return false;
    
    // Filter by search term
    if (filters.search && !gpu.name.toLowerCase().includes(filters.search.toLowerCase()) && 
        !gpu.node.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    
    return true;
  });
</script>

<svelte:head>
  <title>GPU Management - Infernet Protocol</title>
  <meta name="description" content="Manage your GPU resources with Infernet Protocol" />
</svelte:head>

<section>
  <div class="header-actions">
    <h1>GPU Management</h1>
    <div>
      <button class="btn btn-primary">Refresh</button>
      <button class="btn btn-secondary">Export Data</button>
    </div>
  </div>
  
  <div class="filters">
    <div class="filter-group">
      <label for="status-filter">Status</label>
      <select id="status-filter" bind:value={filters.status}>
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="offline">Offline</option>
      </select>
    </div>
    
    <div class="filter-group">
      <label for="utilization-filter">Utilization</label>
      <select id="utilization-filter" bind:value={filters.utilization}>
        <option value="all">All</option>
        <option value="high">High (80%+)</option>
        <option value="medium">Medium (50-79%)</option>
        <option value="low">Low (0-49%)</option>
      </select>
    </div>
    
    <div class="filter-group search">
      <label for="search-filter">Search</label>
      <input type="text" id="search-filter" placeholder="Search by name or node..." bind:value={filters.search}>
    </div>
  </div>
  
  {#if loading}
    <div class="loading">
      <p>Loading GPU data...</p>
    </div>
  {:else if error}
    <div class="alert alert-error">
      <p>{error}</p>
      <button class="btn btn-secondary mt-2">Retry</button>
    </div>
  {:else if filteredGpus.length === 0}
    <div class="alert alert-info">
      <p>No GPUs match your current filters.</p>
      <button class="btn btn-secondary mt-2" on:click={() => filters = { status: 'all', utilization: 'all', search: '' }}>Clear Filters</button>
    </div>
  {:else}
    <div class="gpu-grid">
      {#each filteredGpus as gpu}
        <div class="card gpu-card">
          <div class="gpu-header">
            <h2>{gpu.name}</h2>
            <span class="status {getStatusClass(gpu.status)}">
              {gpu.status === 'active' ? 'Online' : 'Offline'}
            </span>
          </div>
          
          <div class="gpu-node">
            <span class="label">Node:</span>
            <a href="/nodes/{gpu.nodeId}">{gpu.node}</a>
          </div>
          
          <div class="gpu-stats">
            <div class="stat-item">
              <div class="stat-label">Utilization</div>
              <div class="stat-value utilization-{getUtilizationClass(gpu.utilization)}">{gpu.utilization}%</div>
              <div class="progress-bar">
                <div class="progress-bar-fill utilization-{getUtilizationClass(gpu.utilization)}" style="width: {gpu.utilization}%"></div>
              </div>
            </div>
            
            <div class="stat-item">
              <div class="stat-label">Memory</div>
              <div class="stat-value">{gpu.memory.used} / {gpu.memory.total}</div>
              <div class="progress-bar">
                <div class="progress-bar-fill" style="width: {gpu.memory.percentage}%"></div>
              </div>
            </div>
            
            <div class="stat-item">
              <div class="stat-label">Temperature</div>
              <div class="stat-value temperature-{getTemperatureClass(gpu.temperature)}">{gpu.temperature}°C</div>
            </div>
            
            <div class="stat-item">
              <div class="stat-label">Power</div>
              <div class="stat-value">{gpu.power.draw} / {gpu.power.limit}</div>
              <div class="progress-bar">
                <div class="progress-bar-fill" style="width: {gpu.power.percentage}%"></div>
              </div>
            </div>
          </div>
          
          <div class="gpu-processes">
            <h3>Active Processes: {gpu.processes.length}</h3>
            {#if gpu.processes.length > 0}
              <ul>
                {#each gpu.processes as process}
                  <li>
                    <span class="process-name">{process.name}</span>
                    <span class="process-stats">{process.memory} | {process.utilization}%</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="no-processes">No active processes</p>
            {/if}
          </div>
          
          <div class="gpu-actions">
            <button class="btn btn-primary" on:click={() => openGpuDetails(gpu)}>Details</button>
            {#if gpu.status === 'active'}
              <button class="btn btn-secondary">Reset</button>
            {:else}
              <button class="btn btn-secondary">Wake Up</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
  
  {#if showDetails && selectedGpu}
    <div class="modal-overlay" on:click={closeGpuDetails}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <h2>{selectedGpu.name}</h2>
          <button class="close-btn" on:click={closeGpuDetails}>&times;</button>
        </div>
        
        <div class="modal-content">
          <div class="detail-section">
            <h3>Overview</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">Status</span>
                <span class="status {getStatusClass(selectedGpu.status)}">
                  {selectedGpu.status === 'active' ? 'Online' : 'Offline'}
                </span>
              </div>
              
              <div class="detail-item">
                <span class="detail-label">Node</span>
                <a href="/nodes/{selectedGpu.nodeId}">{selectedGpu.node}</a>
              </div>
              
              <div class="detail-item">
                <span class="detail-label">Utilization</span>
                <span class="utilization-{getUtilizationClass(selectedGpu.utilization)}">{selectedGpu.utilization}%</span>
              </div>
              
              <div class="detail-item">
                <span class="detail-label">Temperature</span>
                <span class="temperature-{getTemperatureClass(selectedGpu.temperature)}">{selectedGpu.temperature}°C</span>
              </div>
            </div>
          </div>
          
          <div class="detail-section">
            <h3>Memory</h3>
            <div class="memory-details">
              <div class="progress-bar large">
                <div class="progress-bar-fill" style="width: {selectedGpu.memory.percentage}%"></div>
              </div>
              <div class="memory-stats">
                <div>
                  <span class="detail-label">Total</span>
                  <span>{selectedGpu.memory.total}</span>
                </div>
                <div>
                  <span class="detail-label">Used</span>
                  <span>{selectedGpu.memory.used}</span>
                </div>
                <div>
                  <span class="detail-label">Free</span>
                  <span>{selectedGpu.memory.free}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="detail-section">
            <h3>Power</h3>
            <div class="power-details">
              <div class="progress-bar large">
                <div class="progress-bar-fill" style="width: {selectedGpu.power.percentage}%"></div>
              </div>
              <div class="power-stats">
                <div>
                  <span class="detail-label">Current Draw</span>
                  <span>{selectedGpu.power.draw}</span>
                </div>
                <div>
                  <span class="detail-label">Power Limit</span>
                  <span>{selectedGpu.power.limit}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="detail-section">
            <h3>Active Processes</h3>
            {#if selectedGpu.processes.length > 0}
              <table>
                <thead>
                  <tr>
                    <th>Process</th>
                    <th>Memory</th>
                    <th>Utilization</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each selectedGpu.processes as process}
                    <tr>
                      <td>{process.name}</td>
                      <td>{process.memory}</td>
                      <td>{process.utilization}%</td>
                      <td>
                        <button class="btn btn-secondary small">Terminate</button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {:else}
              <p class="no-processes">No active processes</p>
            {/if}
          </div>
          
          <div class="detail-section">
            <h3>Utilization History</h3>
            <div class="chart-container">
              <!-- In a real app, this would be a chart component -->
              <div class="mock-chart">
                <div class="chart-legend">
                  <span>Last 12 Hours</span>
                </div>
                <div class="chart-bars">
                  {#each selectedGpu.stats.hourly as value, i}
                    <div class="chart-bar" style="height: {value}%" title="{value}%"></div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
          
          <div class="modal-actions">
            <button class="btn btn-primary">Run Diagnostics</button>
            {#if selectedGpu.status === 'active'}
              <button class="btn btn-secondary">Reset GPU</button>
            {:else}
              <button class="btn btn-secondary">Wake Up GPU</button>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .header-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  
  .header-actions button {
    margin-left: 0.5rem;
  }
  
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 1.5rem;
    background-color: #f5f5f5;
    padding: 1rem;
    border-radius: 8px;
  }
  
  .filter-group {
    flex: 1;
    min-width: 200px;
  }
  
  .filter-group.search {
    flex: 2;
  }
  
  .loading {
    text-align: center;
    padding: 2rem;
  }
  
  .gpu-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }
  
  .gpu-card {
    display: flex;
    flex-direction: column;
  }
  
  .gpu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .gpu-header h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  
  .gpu-node {
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  
  .gpu-node a {
    color: #FF3E00;
    text-decoration: none;
  }
  
  .gpu-node a:hover {
    text-decoration: underline;
  }
  
  .gpu-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  
  .stat-item {
    margin-bottom: 0.5rem;
  }
  
  .stat-label {
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 0.25rem;
  }
  
  .stat-value {
    font-weight: 500;
    margin-bottom: 0.25rem;
  }
  
  .utilization-high {
    color: #c62828;
  }
  
  .utilization-medium {
    color: #f57f17;
  }
  
  .utilization-low {
    color: #2e7d32;
  }
  
  .temperature-high {
    color: #c62828;
  }
  
  .temperature-medium {
    color: #f57f17;
  }
  
  .temperature-low {
    color: #2e7d32;
  }
  
  .progress-bar-fill.utilization-high {
    background-color: #c62828;
  }
  
  .progress-bar-fill.utilization-medium {
    background-color: #f57f17;
  }
  
  .progress-bar-fill.utilization-low {
    background-color: #2e7d32;
  }
  
  .gpu-processes {
    margin-bottom: 1rem;
  }
  
  .gpu-processes h3 {
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }
  
  .gpu-processes ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .gpu-processes li {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    background-color: #f9f9f9;
    border-radius: 4px;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }
  
  .no-processes {
    font-size: 0.9rem;
    color: #666;
    font-style: italic;
  }
  
  .gpu-actions {
    margin-top: auto;
    display: flex;
    gap: 0.5rem;
  }
  
  /* Modal styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  
  .modal {
    background-color: white;
    border-radius: 8px;
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #eee;
  }
  
  .modal-header h2 {
    margin: 0;
  }
  
  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #666;
  }
  
  .modal-content {
    padding: 1.5rem;
  }
  
  .detail-section {
    margin-bottom: 2rem;
  }
  
  .detail-section h3 {
    margin-bottom: 1rem;
    font-size: 1.1rem;
  }
  
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
  
  .detail-item {
    display: flex;
    flex-direction: column;
  }
  
  .detail-label {
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 0.25rem;
  }
  
  .memory-details, .power-details {
    margin-top: 1rem;
  }
  
  .progress-bar.large {
    height: 12px;
    margin-bottom: 1rem;
  }
  
  .memory-stats, .power-stats {
    display: flex;
    justify-content: space-between;
  }
  
  .modal-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1.5rem;
  }
  
  /* Chart styles */
  .chart-container {
    margin-top: 1rem;
  }
  
  .mock-chart {
    height: 200px;
    border: 1px solid #eee;
    border-radius: 4px;
    padding: 1rem;
  }
  
  .chart-legend {
    text-align: center;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #666;
  }
  
  .chart-bars {
    display: flex;
    align-items: flex-end;
    height: 150px;
    gap: 8px;
  }
  
  .chart-bar {
    flex: 1;
    background-color: #FF3E00;
    border-radius: 2px 2px 0 0;
    min-height: 1px;
  }
  
  .btn.small {
    padding: 0.25rem 0.5rem;
    font-size: 0.8rem;
  }
  
  @media (max-width: 768px) {
    .gpu-stats {
      grid-template-columns: 1fr;
    }
    
    .detail-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
  
  @media (max-width: 480px) {
    .gpu-grid {
      grid-template-columns: 1fr;
    }
    
    .detail-grid {
      grid-template-columns: 1fr;
    }
    
    .memory-stats, .power-stats {
      flex-direction: column;
      gap: 0.5rem;
    }
  }
</style>
