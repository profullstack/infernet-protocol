<script>
  import { onMount } from 'svelte';
  
  let cpus = [];
  let loading = true;
  let error = null;
  let selectedCpu = null;
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
      
      cpus = [
        {
          id: 'cpu-1',
          name: 'AMD Threadripper 5990X',
          node: 'Primary GPU Server',
          nodeId: 'node-1',
          status: 'active',
          cores: 64,
          threads: 128,
          frequency: {
            base: '2.7 GHz',
            boost: '4.5 GHz',
            current: '4.2 GHz'
          },
          utilization: 72,
          temperature: 65,
          power: {
            draw: '220W',
            limit: '280W',
            percentage: 78
          },
          processes: [
            { name: 'stable-diffusion', cores: 48, utilization: 75 },
            { name: 'system', cores: 4, utilization: 15 },
            { name: 'pocketbase', cores: 2, utilization: 5 }
          ],
          stats: {
            hourly: [65, 72, 68, 70, 75, 72, 70, 68, 72, 75, 72, 72],
            daily: [60, 65, 70, 72, 68, 65, 70]
          }
        },
        {
          id: 'cpu-2',
          name: 'Intel Xeon Platinum 8380',
          node: 'Secondary GPU Server',
          nodeId: 'node-2',
          status: 'active',
          cores: 40,
          threads: 80,
          frequency: {
            base: '2.3 GHz',
            boost: '3.4 GHz',
            current: '3.0 GHz'
          },
          utilization: 58,
          temperature: 62,
          power: {
            draw: '180W',
            limit: '270W',
            percentage: 67
          },
          processes: [
            { name: 'llama3-inference', cores: 32, utilization: 60 },
            { name: 'system', cores: 4, utilization: 12 }
          ],
          stats: {
            hourly: [55, 58, 60, 62, 58, 55, 52, 58, 60, 58, 55, 58],
            daily: [50, 55, 58, 60, 58, 55, 52]
          }
        },
        {
          id: 'cpu-3',
          name: 'AMD EPYC 9654',
          node: 'AI Research Cluster',
          nodeId: 'node-3',
          status: 'active',
          cores: 96,
          threads: 192,
          frequency: {
            base: '2.4 GHz',
            boost: '3.7 GHz',
            current: '3.2 GHz'
          },
          utilization: 45,
          temperature: 58,
          power: {
            draw: '240W',
            limit: '360W',
            percentage: 67
          },
          processes: [
            { name: 'pytorch-training', cores: 64, utilization: 45 },
            { name: 'system', cores: 8, utilization: 10 },
            { name: 'database', cores: 16, utilization: 25 }
          ],
          stats: {
            hourly: [42, 45, 48, 50, 48, 45, 42, 40, 42, 45, 48, 45],
            daily: [40, 42, 45, 48, 45, 42, 40]
          }
        },
        {
          id: 'cpu-4',
          name: 'Intel Core i9-12900K',
          node: 'Edge Inference Server',
          nodeId: 'node-4',
          status: 'offline',
          cores: 16,
          threads: 24,
          frequency: {
            base: '3.2 GHz',
            boost: '5.2 GHz',
            current: '0 GHz'
          },
          utilization: 0,
          temperature: 0,
          power: {
            draw: '0W',
            limit: '241W',
            percentage: 0
          },
          processes: [],
          stats: {
            hourly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            daily: [45, 50, 48, 0, 0, 0, 0]
          }
        }
      ];
      
      loading = false;
    } catch (err) {
      error = err.message || 'Failed to load CPU data';
      loading = false;
    }
  });
  
  function openCpuDetails(cpu) {
    selectedCpu = cpu;
    showDetails = true;
  }
  
  function closeCpuDetails() {
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
    if (temp >= 75) return 'high';
    if (temp >= 65) return 'medium';
    return 'low';
  }
  
  // Filter CPUs based on current filters
  $: filteredCpus = cpus.filter(cpu => {
    // Filter by status
    if (filters.status !== 'all' && cpu.status !== filters.status) return false;
    
    // Filter by utilization
    if (filters.utilization === 'high' && cpu.utilization < 80) return false;
    if (filters.utilization === 'medium' && (cpu.utilization < 50 || cpu.utilization >= 80)) return false;
    if (filters.utilization === 'low' && cpu.utilization >= 50) return false;
    
    // Filter by search term
    if (filters.search && !cpu.name.toLowerCase().includes(filters.search.toLowerCase()) && 
        !cpu.node.toLowerCase().includes(filters.search.toLowerCase())) {
      return false;
    }
    
    return true;
  });
</script>

<svelte:head>
  <title>CPU Management - Infernet Protocol</title>
  <meta name="description" content="Manage your CPU resources with Infernet Protocol" />
</svelte:head>

<section>
  <div class="header-actions">
    <h1>CPU Management</h1>
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
      <p>Loading CPU data...</p>
    </div>
  {:else if error}
    <div class="alert alert-error">
      <p>{error}</p>
      <button class="btn btn-secondary mt-2">Retry</button>
    </div>
  {:else if filteredCpus.length === 0}
    <div class="alert alert-info">
      <p>No CPUs match your current filters.</p>
      <button class="btn btn-secondary mt-2" on:click={() => filters = { status: 'all', utilization: 'all', search: '' }}>Clear Filters</button>
    </div>
  {:else}
    <div class="cpu-grid">
      {#each filteredCpus as cpu}
        <div class="card cpu-card">
          <div class="cpu-header">
            <h2>{cpu.name}</h2>
            <span class="status {getStatusClass(cpu.status)}">
              {cpu.status === 'active' ? 'Online' : 'Offline'}
            </span>
          </div>
          
          <div class="cpu-node">
            <span class="label">Node:</span>
            <a href="/nodes/{cpu.nodeId}">{cpu.node}</a>
          </div>
          
          <div class="cpu-specs">
            <div class="spec-item">
              <span class="spec-label">Cores/Threads</span>
              <span class="spec-value">{cpu.cores} / {cpu.threads}</span>
            </div>
            
            <div class="spec-item">
              <span class="spec-label">Frequency</span>
              <span class="spec-value">{cpu.frequency.current} (Base: {cpu.frequency.base})</span>
            </div>
          </div>
          
          <div class="cpu-stats">
            <div class="stat-item">
              <div class="stat-label">Utilization</div>
              <div class="stat-value utilization-{getUtilizationClass(cpu.utilization)}">{cpu.utilization}%</div>
              <div class="progress-bar">
                <div class="progress-bar-fill utilization-{getUtilizationClass(cpu.utilization)}" style="width: {cpu.utilization}%"></div>
              </div>
            </div>
            
            <div class="stat-item">
              <div class="stat-label">Temperature</div>
              <div class="stat-value temperature-{getTemperatureClass(cpu.temperature)}">{cpu.temperature}u00b0C</div>
            </div>
            
            <div class="stat-item">
              <div class="stat-label">Power</div>
              <div class="stat-value">{cpu.power.draw} / {cpu.power.limit}</div>
              <div class="progress-bar">
                <div class="progress-bar-fill" style="width: {cpu.power.percentage}%"></div>
              </div>
            </div>
          </div>
          
          <div class="cpu-processes">
            <h3>Active Processes: {cpu.processes.length}</h3>
            {#if cpu.processes.length > 0}
              <ul>
                {#each cpu.processes as process}
                  <li>
                    <span class="process-name">{process.name}</span>
                    <span class="process-stats">{process.cores} cores | {process.utilization}%</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="no-processes">No active processes</p>
            {/if}
          </div>
          
          <div class="cpu-actions">
            <button class="btn btn-primary" on:click={() => openCpuDetails(cpu)}>Details</button>
            {#if cpu.status === 'active'}
              <button class="btn btn-secondary">Reset</button>
            {:else}
              <button class="btn btn-secondary">Wake Up</button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
  
  {#if showDetails && selectedCpu}
    <div class="modal-overlay" on:click={closeCpuDetails}>
      <div class="modal" on:click|stopPropagation>
        <div class="modal-header">
          <h2>{selectedCpu.name}</h2>
          <button class="close-btn" on:click={closeCpuDetails}>&times;</button>
        </div>
        
        <div class="modal-content">
          <div class="detail-section">
            <h3>Overview</h3>
            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">Status</span>
                <span class="status {getStatusClass(selectedCpu.status)}">
                  {selectedCpu.status === 'active' ? 'Online' : 'Offline'}
                </span>
              </div>
              
              <div class="detail-item">
                <span class="detail-label">Node</span>
                <a href="/nodes/{selectedCpu.nodeId}">{selectedCpu.node}</a>
              </div>
              
              <div class="detail-item">
                <span class="detail-label">Cores</span>
                <span>{selectedCpu.cores}</span>
              </div>
              
              <div class="detail-item">
                <span class="detail-label">Threads</span>
                <span>{selectedCpu.threads}</span>
              </div>
            </div>
          </div>
          
          <div class="detail-section">
            <h3>Frequency</h3>
            <div class="frequency-details">
              <div class="detail-grid">
                <div class="detail-item">
                  <span class="detail-label">Base</span>
                  <span>{selectedCpu.frequency.base}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Boost</span>
                  <span>{selectedCpu.frequency.boost}</span>
                </div>
                <div class="detail-item">
                  <span class="detail-label">Current</span>
                  <span>{selectedCpu.frequency.current}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="detail-section">
            <h3>Power</h3>
            <div class="power-details">
              <div class="progress-bar large">
                <div class="progress-bar-fill" style="width: {selectedCpu.power.percentage}%"></div>
              </div>
              <div class="power-stats">
                <div>
                  <span class="detail-label">Current Draw</span>
                  <span>{selectedCpu.power.draw}</span>
                </div>
                <div>
                  <span class="detail-label">Power Limit</span>
                  <span>{selectedCpu.power.limit}</span>
                </div>
              </div>
            </div>
          </div>
          
          <div class="detail-section">
            <h3>Active Processes</h3>
            {#if selectedCpu.processes.length > 0}
              <table>
                <thead>
                  <tr>
                    <th>Process</th>
                    <th>Cores</th>
                    <th>Utilization</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {#each selectedCpu.processes as process}
                    <tr>
                      <td>{process.name}</td>
                      <td>{process.cores}</td>
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
                  {#each selectedCpu.stats.hourly as value, i}
                    <div class="chart-bar" style="height: {value}%" title="{value}%"></div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
          
          <div class="modal-actions">
            <button class="btn btn-primary">Run Diagnostics</button>
            {#if selectedCpu.status === 'active'}
              <button class="btn btn-secondary">Reset CPU</button>
            {:else}
              <button class="btn btn-secondary">Wake Up CPU</button>
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
  
  .cpu-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 1.5rem;
  }
  
  .cpu-card {
    display: flex;
    flex-direction: column;
  }
  
  .cpu-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .cpu-header h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  
  .cpu-node {
    margin-bottom: 1rem;
    font-size: 0.9rem;
  }
  
  .cpu-node a {
    color: #FF3E00;
    text-decoration: none;
  }
  
  .cpu-node a:hover {
    text-decoration: underline;
  }
  
  .cpu-specs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
    background-color: #f9f9f9;
    padding: 0.75rem;
    border-radius: 4px;
  }
  
  .spec-item {
    display: flex;
    flex-direction: column;
  }
  
  .spec-label {
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 0.25rem;
  }
  
  .spec-value {
    font-weight: 500;
  }
  
  .cpu-stats {
    display: grid;
    grid-template-columns: 1fr;
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
  
  .cpu-processes {
    margin-bottom: 1rem;
  }
  
  .cpu-processes h3 {
    font-size: 0.9rem;
    margin-bottom: 0.5rem;
  }
  
  .cpu-processes ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .cpu-processes li {
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
  
  .cpu-actions {
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
  
  .frequency-details, .power-details {
    margin-top: 1rem;
  }
  
  .progress-bar.large {
    height: 12px;
    margin-bottom: 1rem;
  }
  
  .power-stats {
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
    .cpu-specs {
      grid-template-columns: 1fr;
    }
    
    .detail-grid {
      grid-template-columns: 1fr 1fr;
    }
  }
  
  @media (max-width: 480px) {
    .cpu-grid {
      grid-template-columns: 1fr;
    }
    
    .detail-grid {
      grid-template-columns: 1fr;
    }
    
    .power-stats {
      flex-direction: column;
      gap: 0.5rem;
    }
  }
</style>
