<script>
  import { onMount, onDestroy } from 'svelte';
  import { nodeStatus } from '../stores/nodeStore';
  
  export let systemInfo = null;
  
  let cpuUsage = 0;
  let memoryUsage = 0;
  let gpuUsage = 0;
  let activeJobs = 0;
  let completedJobs = 0;
  let earnings = 0;
  let updateInterval;
  
  onMount(() => {
    // Simulate updating metrics
    updateMetrics();
    updateInterval = setInterval(updateMetrics, 5000);
  });
  
  onDestroy(() => {
    clearInterval(updateInterval);
  });
  
  function updateMetrics() {
    // In a real app, these would come from the Electron main process
    // or from a WebSocket connection to the local server
    cpuUsage = Math.floor(Math.random() * 100);
    memoryUsage = Math.floor(Math.random() * 100);
    gpuUsage = Math.floor(Math.random() * 100);
    activeJobs = Math.floor(Math.random() * 5);
    completedJobs += Math.floor(Math.random() * 3);
    earnings += Math.random() * 0.5;
    
    // Update the store
    $nodeStatus = {
      cpuUsage,
      memoryUsage,
      gpuUsage,
      activeJobs,
      completedJobs,
      earnings
    };
  }
</script>

<div class="dashboard">
  <h1>Node Dashboard</h1>
  
  <div class="system-info card">
    <h2>System Information</h2>
    {#if systemInfo}
      <div class="info-grid">
        <div class="info-item">
          <span class="label">Platform</span>
          <span class="value">{systemInfo.platform}</span>
        </div>
        <div class="info-item">
          <span class="label">Architecture</span>
          <span class="value">{systemInfo.arch}</span>
        </div>
        <div class="info-item">
          <span class="label">CPU Cores</span>
          <span class="value">{systemInfo.cpus.length}</span>
        </div>
        <div class="info-item">
          <span class="label">Total Memory</span>
          <span class="value">{(systemInfo.totalMemory / (1024 * 1024 * 1024)).toFixed(2)} GB</span>
        </div>
      </div>
    {:else}
      <p>Loading system information...</p>
    {/if}
  </div>
  
  <div class="metrics-grid">
    <div class="metric-card card">
      <h3>CPU Usage</h3>
      <div class="metric-value">{cpuUsage}%</div>
      <div class="progress-bar">
        <div class="progress" style="width: {cpuUsage}%"></div>
      </div>
    </div>
    
    <div class="metric-card card">
      <h3>Memory Usage</h3>
      <div class="metric-value">{memoryUsage}%</div>
      <div class="progress-bar">
        <div class="progress" style="width: {memoryUsage}%"></div>
      </div>
    </div>
    
    <div class="metric-card card">
      <h3>GPU Usage</h3>
      <div class="metric-value">{gpuUsage}%</div>
      <div class="progress-bar">
        <div class="progress" style="width: {gpuUsage}%"></div>
      </div>
    </div>
  </div>
  
  <div class="job-stats-grid">
    <div class="job-stat-card card">
      <h3>Active Jobs</h3>
      <div class="stat-value">{activeJobs}</div>
    </div>
    
    <div class="job-stat-card card">
      <h3>Completed Jobs</h3>
      <div class="stat-value">{completedJobs}</div>
    </div>
    
    <div class="job-stat-card card">
      <h3>Earnings</h3>
      <div class="stat-value">${earnings.toFixed(2)}</div>
    </div>
  </div>
  
  <div class="recent-jobs card">
    <h2>Recent Jobs</h2>
    {#if completedJobs > 0}
      <table>
        <thead>
          <tr>
            <th>Job ID</th>
            <th>Model</th>
            <th>Duration</th>
            <th>Status</th>
            <th>Earnings</th>
          </tr>
        </thead>
        <tbody>
          {#each Array(Math.min(5, completedJobs)) as _, i}
            <tr>
              <td>job-{(Math.random() * 1000000).toFixed(0)}</td>
              <td>llama-{Math.floor(Math.random() * 3) + 1}b-{Math.floor(Math.random() * 3) + 1}t</td>
              <td>{Math.floor(Math.random() * 60) + 10}s</td>
              <td class="status completed">Completed</td>
              <td>${(Math.random() * 0.5).toFixed(4)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p>No jobs completed yet.</p>
    {/if}
  </div>
</div>

<style>
  .dashboard {
    padding: 1rem;
  }
  
  h1 {
    margin-bottom: 1.5rem;
  }
  
  .card {
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  
  .system-info {
    margin-bottom: 2rem;
  }
  
  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }
  
  .info-item {
    display: flex;
    flex-direction: column;
  }
  
  .label {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 0.25rem;
  }
  
  .value {
    font-weight: 500;
  }
  
  .metrics-grid, .job-stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }
  
  .metric-card, .job-stat-card {
    display: flex;
    flex-direction: column;
  }
  
  .metric-value, .stat-value {
    font-size: 2rem;
    font-weight: 700;
    margin: 0.5rem 0;
  }
  
  .progress-bar {
    height: 8px;
    background-color: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 0.5rem;
  }
  
  .progress {
    height: 100%;
    background-color: #3b82f6;
    border-radius: 4px;
    transition: width 0.3s ease;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
  }
  
  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
  }
  
  th {
    font-weight: 500;
    color: #6b7280;
  }
  
  .status {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  .status.completed {
    background-color: #d1fae5;
    color: #065f46;
  }
</style>
