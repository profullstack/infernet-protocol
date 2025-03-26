<script>
  import { createEventDispatcher } from 'svelte';
  
  export let activeTab = 'dashboard';
  
  const dispatch = createEventDispatcher();
  
  const tabs = [
    { id: 'dashboard', name: 'Dashboard', icon: '📊' },
    { id: 'jobs', name: 'Jobs', icon: '📋' },
    { id: 'providers', name: 'Providers', icon: '🖥️' },
    { id: 'clients', name: 'Clients', icon: '👥' },
    { id: 'aggregators', name: 'Aggregators', icon: '🔄' },
    { id: 'settings', name: 'Settings', icon: '⚙️' }
  ];
  
  function setActiveTab(tabId) {
    activeTab = tabId;
    dispatch('tabChange', tabId);
  }
</script>

<aside class="sidebar">
  <div class="logo">
    <h2>Infernet Protocol</h2>
  </div>
  
  <nav>
    <ul>
      {#each tabs as tab}
        <li class:active={activeTab === tab.id}>
          <button on:click={() => setActiveTab(tab.id)}>
            <span class="icon">{tab.icon}</span>
            <span class="name">{tab.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  </nav>
  
  <div class="sidebar-footer">
    <div class="status-indicator">
      <span class="status-dot online"></span>
      <span>Connected</span>
    </div>
    <div class="version">v0.1.0</div>
  </div>
</aside>

<style>
  .sidebar {
    width: 250px;
    background-color: #1e293b;
    color: white;
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  
  .logo {
    padding: 1.5rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    text-align: center;
  }
  
  .logo h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  
  nav {
    flex: 1;
    padding: 1rem 0;
  }
  
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  li {
    margin-bottom: 0.25rem;
  }
  
  li button {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
  }
  
  li button:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: white;
  }
  
  li.active button {
    background-color: rgba(255, 255, 255, 0.2);
    color: white;
    font-weight: 500;
  }
  
  .icon {
    margin-right: 0.75rem;
    font-size: 1.25rem;
    width: 24px;
    text-align: center;
  }
  
  .sidebar-footer {
    padding: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.875rem;
  }
  
  .status-indicator {
    display: flex;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 0.5rem;
  }
  
  .status-dot.online {
    background-color: #10b981;
  }
  
  .version {
    color: rgba(255, 255, 255, 0.5);
  }
</style>
