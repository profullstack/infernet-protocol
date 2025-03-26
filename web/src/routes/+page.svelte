<script>
  import { onMount } from 'svelte';
  
  let stats = {
    activeNodes: 0,
    totalJobs: 0,
    gpuUtilization: 0,
    cpuUtilization: 0
  };
  
  let gpuStats = [];
  let cpuStats = [];
  let recentJobs = [];
  
  onMount(async () => {
    // In a real app, this would fetch data from the API
    // For now, we'll use mock data
    stats = {
      activeNodes: 12,
      totalJobs: 248,
      gpuUtilization: 78,
      cpuUtilization: 65
    };
    
    gpuStats = [
      { id: 'gpu1', name: 'NVIDIA RTX 4090', utilization: 92, memory: 85, temperature: 72 },
      { id: 'gpu2', name: 'NVIDIA RTX 4080', utilization: 78, memory: 62, temperature: 68 },
      { id: 'gpu3', name: 'NVIDIA RTX 3090', utilization: 88, memory: 75, temperature: 75 },
      { id: 'gpu4', name: 'NVIDIA A100', utilization: 65, memory: 58, temperature: 62 }
    ];
    
    cpuStats = [
      { id: 'cpu1', name: 'AMD Threadripper 5990X', cores: 64, utilization: 72, temperature: 65 },
      { id: 'cpu2', name: 'Intel Xeon Platinum 8380', cores: 40, utilization: 58, temperature: 62 }
    ];
    
    recentJobs = [
      { id: 'job1', model: 'Stable Diffusion XL', status: 'Completed', runtime: '2m 34s', node: 'Node-01' },
      { id: 'job2', model: 'Llama 3 70B', status: 'Running', runtime: '15m 12s', node: 'Node-03' },
      { id: 'job3', model: 'Mistral 7B', status: 'Queued', runtime: '-', node: 'Pending' },
      { id: 'job4', model: 'CLIP', status: 'Completed', runtime: '1m 05s', node: 'Node-02' }
    ];
  });
</script>

<svelte:head>
  <title>Infernet Protocol - GPU/CPU Farm Management</title>
  <meta name="description" content="Manage your GPU and CPU farm with Infernet Protocol" />
</svelte:head>

<section class="dashboard">
  <h1>Dashboard</h1>
  
  <div class="stats-overview grid grid-cols-4">
    <div class="card">
      <h3>{stats.activeNodes}</h3>
      <p>Active Nodes</p>
    </div>
    <div class="card">
      <h3>{stats.totalJobs}</h3>
      <p>Total Jobs</p>
    </div>
    <div class="card">
      <h3>{stats.gpuUtilization}%</h3>
      <p>GPU Utilization</p>
      <div class="progress-bar">
        <div class="progress-bar-fill" style="width: {stats.gpuUtilization}%"></div>
      </div>
    </div>
    <div class="card">
      <h3>{stats.cpuUtilization}%</h3>
      <p>CPU Utilization</p>
      <div class="progress-bar">
        <div class="progress-bar-fill" style="width: {stats.cpuUtilization}%"></div>
      </div>
    </div>
  </div>
  
  <div class="grid grid-cols-2">
    <div class="card">
      <div class="card-header">
        <h2>GPU Status</h2>
        <a href="/gpu" class="btn btn-secondary">View All</a>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>GPU</th>
            <th>Utilization</th>
            <th>Memory</th>
            <th>Temp</th>
          </tr>
        </thead>
        <tbody>
          {#each gpuStats as gpu}
            <tr>
              <td>{gpu.name}</td>
              <td>
                <div class="progress-bar">
                  <div class="progress-bar-fill" style="width: {gpu.utilization}%"></div>
                </div>
                <span class="progress-text">{gpu.utilization}%</span>
              </td>
              <td>
                <div class="progress-bar">
                  <div class="progress-bar-fill" style="width: {gpu.memory}%"></div>
                </div>
                <span class="progress-text">{gpu.memory}%</span>
              </td>
              <td>{gpu.temperature}°C</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    
    <div class="card">
      <div class="card-header">
        <h2>CPU Status</h2>
        <a href="/cpu" class="btn btn-secondary">View All</a>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>CPU</th>
            <th>Cores</th>
            <th>Utilization</th>
            <th>Temp</th>
          </tr>
        </thead>
        <tbody>
          {#each cpuStats as cpu}
            <tr>
              <td>{cpu.name}</td>
              <td>{cpu.cores}</td>
              <td>
                <div class="progress-bar">
                  <div class="progress-bar-fill" style="width: {cpu.utilization}%"></div>
                </div>
                <span class="progress-text">{cpu.utilization}%</span>
              </td>
              <td>{cpu.temperature}°C</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
  
  <div class="card">
    <div class="card-header">
      <h2>Recent Jobs</h2>
      <a href="/jobs" class="btn btn-secondary">View All Jobs</a>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Model</th>
          <th>Status</th>
          <th>Runtime</th>
          <th>Node</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each recentJobs as job}
          <tr>
            <td>{job.id}</td>
            <td>{job.model}</td>
            <td>
              <span class="status status-{job.status === 'Completed' ? 'online' : job.status === 'Running' ? 'idle' : 'offline'}">
                {job.status}
              </span>
            </td>
            <td>{job.runtime}</td>
            <td>{job.node}</td>
            <td>
              <a href="/jobs/{job.id}" class="btn btn-secondary">Details</a>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</section>

<style>
  .dashboard h1 {
    margin-bottom: 1.5rem;
  }
  
  .stats-overview {
    margin-bottom: 2rem;
  }
  
  .stats-overview .card {
    text-align: center;
    padding: 1.5rem;
  }
  
  .stats-overview h3 {
    font-size: 2rem;
    color: #FF3E00;
    margin-bottom: 0.5rem;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
  }
  
  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #eee;
  }
  
  th {
    font-weight: 600;
    color: #555;
  }
  
  .progress-text {
    font-size: 0.8rem;
    color: #666;
    margin-top: 0.25rem;
    display: inline-block;
  }
</style>
