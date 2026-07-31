/**
 * HealthLuminate CRM Sandbox Header Component
 * Shared header for account-detail.html and contact-detail.html
 * 
 * Usage:
 * 1. Include this script: <script src="components/sandbox-header.js"></script>
 * 2. Add container: <div id="sandbox-header"></div>
 * 3. Call: renderSandboxHeader({ type: 'account', backUrl: '...', backText: '...' })
 */

function renderSandboxHeader(options = {}) {
  const {
    type = 'account',           // 'account' or 'contact'
    backUrl = 'crm-sandbox.html',
    backText = 'Back to Accounts',
    icon = type === 'contact' ? 'fa-user-circle' : 'fa-heartbeat',
    title = 'HealthLuminate CRM'
  } = options;

  // Unified color scheme for all pages - Dark Green/Teal
  const currentColors = {
    primary: '#1e4a54',     // Dark teal
    gradient: 'linear-gradient(135deg, #1e4a54 0%, #1f7a6d 100%)'  // Dark teal to green gradient
  };

  const headerHTML = `
    <style>
      /* Shared Header Styles */
      .sandbox-header {
        background: ${currentColors.gradient};
        color: white;
        padding: 0;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        position: sticky;
        top: 0;
        z-index: 1000;
      }

      .sandbox-header-container {
        max-width: 1600px;
        margin: 0 auto;
        padding: 0 20px;
      }

      .sandbox-header-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
      }

      .sandbox-header-left {
        display: flex;
        align-items: center;
        gap: 20px;
      }

      .sandbox-back-btn {
        background: rgba(255,255,255,0.15);
        color: white;
        text-decoration: none;
        padding: 8px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
        font-size: 0.95em;
        transition: all 0.2s ease;
      }

      .sandbox-back-btn:hover {
        background: rgba(255,255,255,0.25);
        transform: translateX(-2px);
      }

      .sandbox-logo-section {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .sandbox-logo-section i {
        font-size: 1.5em;
      }

      .sandbox-logo-section h1 {
        margin: 0;
        font-size: 1.2em;
        font-weight: 600;
      }

      .sandbox-header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .sandbox-quick-nav {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(255,255,255,0.1);
        padding: 6px;
        border-radius: 8px;
      }

      .sandbox-quick-nav a {
        color: white;
        text-decoration: none;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 0.9em;
        font-weight: 500;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .sandbox-quick-nav a:hover {
        background: rgba(255,255,255,0.2);
      }

      .sandbox-quick-nav a.active {
        background: rgba(255,255,255,0.25);
      }
    </style>

    <header class="sandbox-header">
      <div class="sandbox-header-container">
        <div class="sandbox-header-top">
          <div class="sandbox-header-left">
            <a href="${backUrl}" class="sandbox-back-btn">
              <i class="fas fa-arrow-left"></i>
              ${backText}
            </a>
            <div class="sandbox-logo-section">
              <i class="fas ${icon}"></i>
              <h1>${title}</h1>
            </div>
          </div>
          <div class="sandbox-header-actions">
            <div class="sandbox-quick-nav">
              <a href="mainpage.html" title="Home">
                <i class="fas fa-home"></i>
              </a>
              <a href="mainpage.html" title="Accounts">
                <i class="fas fa-building"></i>
              </a>
              <a href="contacts-list.html" title="Contacts">
                <i class="fas fa-users"></i>
              </a>
              <a href="documents-dashboard.html" title="Documents">
                <i class="fas fa-file-contract"></i>
              </a>
              <a href="agreement-builder.html" title="Create Document" style="background: rgba(255,255,255,0.2);">
                <i class="fas fa-plus-circle"></i>
              </a>
            </div>
            <div id="sandboxHeaderActions">
              <!-- Optional: Add action buttons here -->
            </div>
          </div>
        </div>
      </div>
    </header>
  `;

  // Insert into the DOM
  const container = document.getElementById('sandbox-header');
  if (container) {
    container.innerHTML = headerHTML;
  } else {
    console.warn('⚠️ sandbox-header container not found. Add <div id="sandbox-header"></div> to your HTML.');
  }
}

// Make globally available
window.renderSandboxHeader = renderSandboxHeader;

