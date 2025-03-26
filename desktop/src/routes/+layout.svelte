<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { nodeActions } from '../stores/nodeStore.js';
  import pocketbase, { pbConnectionStatus } from '../lib/pocketbase.js';

  let connectionStatus;
  
  // Subscribe to connection status
  pbConnectionStatus.subscribe(status => {
    connectionStatus = status;
  });

  onMount(async () => {
    // Initialize PocketBase connection
    try {
      await nodeActions.connectToPocketBase();
      console.log('PocketBase initialized');
    } catch (error) {
      console.error('Failed to initialize PocketBase:', error);
    }
  });
</script>

<div class="app">
  <main>
    <slot />
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    box-sizing: border-box;
  }
</style>
