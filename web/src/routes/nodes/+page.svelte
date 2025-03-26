<script>
  import { onMount } from 'svelte';
  
  let nodes = [];
  let loading = true;
  let error = null;
  
  onMount(async () => {
    try {
      // In a real app, this would fetch data from the API
      // For now, we'll use mock data
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay
      
      nodes = [
        {
          id: 'node-1',
          name: 'Primary GPU Server',
          status: 'online',
          ip: '192.168.1.101',
          lastSeen: '2025-03-26T04:30:00',
          gpus: [
            { name: 'NVIDIA RTX 4090', memory: '24GB', utilization: 92 },
            { name: 'NVIDIA RTX 4090', memory: '24GB', utilization: 78 }
          ],
          cpus: [
            { name: 'AMD Threadripper 5990X', cores: 64, utilization: 72 }
          ],
          jobsCompleted: 156,
          uptime: '12d 5h 32m'
        },
        {
          id: 'node-2',
          name: 'Secondary GPU Server',
          status: 'online',
          ip: '192.168.1.102',
          lastSeen: '2025-03-26T04:35:00',
          gpus: [
            { name: 'NVIDIA RTX 4080', memory: '16GB', utilization: 65 },
            { name: 'NVIDIA RTX 3090', memory: '24GB', utilization: 88 }
          ],
          cpus: [
            { name: 'Intel Xeon Platinum 8380', cores: 40, utilization: 58 }
          ],
          jobsCompleted: 92,
          uptime: '8d 14h 45m'
        },
        {
          id: 'node-3',
          name: 'AI Research Cluster',
          status: 'online',
          ip: '192.168.1.103',
          lastSeen: '2025-03-26T04:32:00',
          gpus: [
            { name: 'NVIDIA A100', memory: '80GB', utilization: 65 },
            { name: 'NVIDIA A100', memory: '80GB', utilization: 72 },
            { name: 'NVIDIA A100', memory: '80GB', utilization: 58 },
            { name: 'NVIDIA A100', memory: '80GB', utilization: 61 }
          ],
          cpus: [
            { name: 'AMD EPYC 9654', cores: 96, utilization: 45 }
          ],
          jobsCompleted: 214,
          uptime: '15d 8h 12m'
        },
        {
          id: 'node-4',
          name: 'Edge Inference Server',
          status: 'offline',
          ip: '192.168.1.104',
          lastSeen: '2025-03-25T18:45:00',
          gpus: [
            { name: 'NVIDIA RTX 3080', memory: '10GB', utilization: 0 }
          ],
          cpus: [
            { name: 'Intel Core i9-12900K', cores: 16, utilization: 0 }
          ],
          jobsCompleted: 78,
          uptime: '0d 0h 0m'
        }
      ];
      
      loading = false;
    } catch (err) {
      error = err.message || 'Failed to load nodes';
      loading = false;
    }
  });
  
  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString();
  }
  
  function getStatusClass(status) {
    return `status-${status}`;
  }
</script>

<svelte:head>
  <title>Nodes - Infernet Protocol</title>
  <meta name="description" content="Manage your Infernet Protocol nodes" />
</svelte:head>

<section>
  <div class="header-actions">
    <h1>Nodes</h1>
    <div>
      <button class="btn btn-primary">Add Node</button>
      <button class="btn btn-secondary">Refresh</button>
    </div>
  </div>
  
  {#if loading}
    <div class="loading">
      <p>Loading nodes...</p>
    </div>
  {:else if error}
    <div class="alert alert-error">
      <p>{error}</p>
      <button class="btn btn-secondary mt-2">Retry</button>
    </div>
  {:else}
    <div class="nodes-grid">
      {#each nodes as node}
        <div class="card node-card">
          <div class="node-header">
            <h2>{node.name}</h2>
            <span class="status {getStatusClass(node.status)}">
              {node.status}
            </span>
          </div>
          
          <div class="node-details">
            <div class="detail-item">
              <span class="label">IP Address:</span>
              <span class="value">{node.ip}</span>
            </div>
            <div class="detail-item">
              <span class="label">Last Seen:</span>
              <span class="value">{formatDate(node.lastSeen)}</span>
            </div>
            <div class="detail-item">
              <span class="label">Uptime:</span>
              <span class="value">{node.uptime}</span>
            </div>
            <div class="detail-item">
              <span class="label">Jobs Completed:</span>
              <span class="value">{node.jobsCompleted}</span>
            </div>
          </div>
          
          <div class="hardware-section">
            <h3>GPUs ({node.gpus.length})</h3>
            <div class="hardware-grid">
              {#each node.gpus as gpu}
                <div class="hardware-item">
                  <div class="hw-name">{gpu.name}</div>
                  <div class="hw-detail">{gpu.memory}</div>
                  <div class="hw-utilization">
                    <div class="progress-bar">
                      <div class="progress-bar-fill" style="width: {gpu.utilization}%"></div>
                    </div>
                    <span>{gpu.utilization}%</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
          
          <div class="hardware-section">
            <h3>CPUs ({node.cpus.length})</h3>
            <div class="hardware-grid">
              {#each node.cpus as cpu}
                <div class="hardware-item">
                  <div class="hw-name">{cpu.name}</div>
                  <div class="hw-detail">{cpu.cores} cores</div>
                  <div class="hw-utilization">
                    <div class="progress-bar">
                      <div class="progress-bar-fill" style="width: {cpu.utilization}%"></div>
                    </div>
                    <span>{cpu.utilization}%</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
          
          <div class="node-actions">
            <a href="/nodes/{node.id}" class="btn btn-primary">Manage</a>
            <button class="btn btn-secondary">Restart</button>
            {#if node.status === 'offline'}
              <button class="btn btn-secondary">Wake Up</button>
            {/if}
          </div>
        </div>
      {/each}
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
  
  .loading {
    text-align: center;
    padding: 2rem;
  }
  
  .nodes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    gap: 1.5rem;
  }
  
  .node-card {
    display: flex;
    flex-direction: column;
  }
  
  .node-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .node-header h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  
  .node-details {
    margin-bottom: 1.5rem;
  }
  
  .detail-item {
    display: flex;
    margin-bottom: 0.5rem;
  }
  
  .label {
    font-weight: 500;
    width: 130px;
    color: #666;
  }
  
  .hardware-section {
    margin-bottom: 1.5rem;
  }
  
  .hardware-section h3 {
    font-size: 1rem;
    margin-bottom: 0.75rem;
  }
  
  .hardware-grid {
    display: grid;
    gap: 0.75rem;
  }
  
  .hardware-item {
    background-color: #f9f9f9;
    padding: 0.75rem;
    border-radius: 4px;
  }
  
  .hw-name {
    font-weight: 500;
    margin-bottom: 0.25rem;
  }
  
  .hw-detail {
    font-size: 0.875rem;
    color: #666;
    margin-bottom: 0.5rem;
  }
  
  .hw-utilization {
    display: flex;
    align-items: center;
  }
  
  .hw-utilization .progress-bar {
    flex: 1;
    margin-right: 0.5rem;
  }
  
  .node-actions {
    margin-top: auto;
    display: flex;
    gap: 0.5rem;
  }
  
  @media (max-width: 480px) {
    .nodes-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
