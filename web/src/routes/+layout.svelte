<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import '../app.css';

  let isMenuOpen = false;
  
  function toggleMenu() {
    isMenuOpen = !isMenuOpen;
  }

  // Close menu when route changes
  $: if ($page.url.pathname) {
    isMenuOpen = false;
  }

  onMount(() => {
    // Check for service worker registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('ServiceWorker registration successful');
        })
        .catch(error => {
          console.error('ServiceWorker registration failed:', error);
        });
    }
  });
</script>

<div class="app">
  <header>
    <div class="logo">
      <a href="/">
        <img src="/logo.svg" alt="Infernet Protocol" height="40" />
        <span>Infernet Protocol</span>
      </a>
    </div>
    
    <button class="menu-toggle" on:click={toggleMenu} aria-label="Toggle menu">
      <span class="hamburger"></span>
    </button>
    
    <nav class={isMenuOpen ? 'open' : ''}>
      <ul>
        <li><a href="/" class={$page.url.pathname === '/' ? 'active' : ''}>Dashboard</a></li>
        <li><a href="/nodes" class={$page.url.pathname === '/nodes' ? 'active' : ''}>Nodes</a></li>
        <li><a href="/jobs" class={$page.url.pathname === '/jobs' ? 'active' : ''}>Jobs</a></li>
        <li><a href="/gpu" class={$page.url.pathname === '/gpu' ? 'active' : ''}>GPU Management</a></li>
        <li><a href="/cpu" class={$page.url.pathname === '/cpu' ? 'active' : ''}>CPU Management</a></li>
        <li><a href="/settings" class={$page.url.pathname === '/settings' ? 'active' : ''}>Settings</a></li>
      </ul>
    </nav>
  </header>
  
  <main>
    <slot></slot>
  </main>
  
  <footer>
    <p>© {new Date().getFullYear()} Infernet Protocol | <a href="https://infernet.tech">infernet.tech</a></p>
    <p>For technical contributions or questions: <a href="mailto:protocol@infernet.tech">protocol@infernet.tech</a></p>
  </footer>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    background-color: #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  
  .logo a {
    display: flex;
    align-items: center;
    text-decoration: none;
    color: #333;
    font-weight: bold;
    font-size: 1.2rem;
  }
  
  .logo img {
    margin-right: 0.5rem;
  }
  
  nav ul {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  
  nav li {
    margin-left: 1.5rem;
  }
  
  nav a {
    text-decoration: none;
    color: #555;
    font-weight: 500;
    transition: color 0.2s;
  }
  
  nav a:hover, nav a.active {
    color: #FF3E00;
  }
  
  .menu-toggle {
    display: none;
    background: none;
    border: none;
    cursor: pointer;
  }
  
  main {
    flex: 1;
    padding: 2rem;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }
  
  footer {
    padding: 1.5rem 2rem;
    background-color: #f5f5f5;
    text-align: center;
    font-size: 0.9rem;
    color: #666;
  }
  
  footer a {
    color: #FF3E00;
    text-decoration: none;
  }
  
  @media (max-width: 768px) {
    .menu-toggle {
      display: block;
      position: relative;
      width: 30px;
      height: 30px;
    }
    
    .hamburger, .hamburger:before, .hamburger:after {
      position: absolute;
      width: 30px;
      height: 3px;
      background-color: #333;
      transition: all 0.3s;
    }
    
    .hamburger {
      top: 14px;
    }
    
    .hamburger:before {
      content: '';
      top: -8px;
    }
    
    .hamburger:after {
      content: '';
      top: 8px;
    }
    
    nav {
      position: absolute;
      top: 70px;
      right: 0;
      left: 0;
      background-color: #fff;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      transform: translateY(-150%);
      transition: transform 0.3s ease-in-out;
      z-index: 100;
    }
    
    nav.open {
      transform: translateY(0);
    }
    
    nav ul {
      flex-direction: column;
      padding: 1rem 0;
    }
    
    nav li {
      margin: 0;
      text-align: center;
    }
    
    nav a {
      display: block;
      padding: 1rem;
    }
  }
</style>
