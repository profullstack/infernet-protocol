<script>
  import { onMount } from 'svelte';
  import NodeDashboard from '$components/NodeDashboard.svelte';
  import Sidebar from '$components/Sidebar.svelte';
  import { nodeStatus } from '$stores/nodeStore';
  
  let systemInfo = null;
  let activeTab = 'dashboard';
  
  onMount(async () => {
    if (window.electronAPI) {
      systemInfo = await window.electronAPI.getSystemInfo();
    }
  });
</script>

<div class="dashboard-container">
  <Sidebar {activeTab} on:tabChange={(e) => activeTab = e.detail} />
  
  <div class="main-content">
    {#if activeTab === 'dashboard'}
      <NodeDashboard {systemInfo} />
    {:else if activeTab === 'jobs'}
      <!-- Job management component will go here -->
      <div class="placeholder">
        <h2>Job Management</h2>
        <p>Job management interface coming soon</p>
      </div>
    {:else if activeTab === 'settings'}
      <!-- Settings component will go here -->
      <div class="placeholder">
        <h2>Settings</h2>
        <p>Settings interface coming soon</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .dashboard-container {
    display: flex;
    height: 100vh;
    width: 100%;
    overflow: hidden;
  }
  
  .main-content {
    flex: 1;
    padding: 1rem;
    overflow-y: auto;
  }
  
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--medium-gray);
  }
</style>
