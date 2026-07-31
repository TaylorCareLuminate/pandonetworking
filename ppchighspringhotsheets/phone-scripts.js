// Phone Scripts Functionality for Hotsheet Prospecting
// This file adds phone script support to the hotsheet prospecting page

// Phone scripts state
let phoneScriptsState = {
  isOpen: false,
  currentContact: null,
  currentOrg: null,
  selectedScriptIndex: 0,
  lastUsedScriptIndex: 0
};

// Get last used script from localStorage
function getLastUsedScript() {
  const lastUsed = localStorage.getItem('lastUsedPhoneScript');
  return lastUsed ? parseInt(lastUsed) : 0;
}

// Set last used script in localStorage
function setLastUsedScript(index) {
  localStorage.setItem('lastUsedPhoneScript', index.toString());
  phoneScriptsState.lastUsedScriptIndex = index;
}

// Open phone scripts panel
function openPhoneScripts(contactData, orgData, phoneNumber) {
  console.log('📞 Opening phone scripts panel for:', contactData, orgData, phoneNumber);
  
  phoneScriptsState.currentContact = contactData;
  phoneScriptsState.currentOrg = orgData;
  phoneScriptsState.isOpen = true;
  
  // Get last used script or default to first
  phoneScriptsState.selectedScriptIndex = getLastUsedScript();
  
  // Update contact info in header
  updatePhoneScriptsHeader(contactData, orgData, phoneNumber);
  
  // Render script tabs and content
  renderPhoneScriptTabs();
  renderPhoneScriptContent();
  
  // Show the panel
  const panel = document.getElementById('phoneScriptsPanel');
  const overlay = document.getElementById('scriptOverlay');
  
  if (panel && overlay) {
    panel.classList.add('active');
    overlay.classList.add('active');
  }
  
  // Track the call in analytics
  trackPhoneCall(contactData, orgData, phoneNumber);
}

// Close phone scripts panel
function closePhoneScripts() {
  console.log('📞 Closing phone scripts panel');
  
  phoneScriptsState.isOpen = false;
  
  const panel = document.getElementById('phoneScriptsPanel');
  const overlay = document.getElementById('scriptOverlay');
  
  if (panel && overlay) {
    panel.classList.remove('active');
    overlay.classList.remove('active');
  }
}

// Update phone scripts header
function updatePhoneScriptsHeader(contactData, orgData, phoneNumber) {
  const contactName = getContactName ? getContactName(contactData) : (contactData?.name || 'Unknown Contact');
  const orgName = orgData?.org || 'Unknown Organization';
  
  const contactNameElement = document.getElementById('scriptsContactName');
  const contactPhoneElement = document.getElementById('scriptsContactPhone');
  
  if (contactNameElement) {
    contactNameElement.textContent = contactName;
  }
  
  if (contactPhoneElement) {
    contactPhoneElement.textContent = phoneNumber;
  }
}

// Render phone script tabs
function renderPhoneScriptTabs() {
  const tabsContainer = document.getElementById('scriptTabs');
  if (!tabsContainer) return;
  
  const scripts = window.messageTemplates?.phone || [];
  
  if (scripts.length === 0) {
    tabsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; color: #6b7280; padding: 20px;">
        No phone scripts configured
      </div>
    `;
    return;
  }
  
  tabsContainer.innerHTML = '';
  
  // Create tabs for available scripts (up to 6)
  for (let i = 0; i < 6; i++) {
    const script = scripts[i];
    const tab = document.createElement('button');
    tab.className = `script-tab ${i === phoneScriptsState.selectedScriptIndex ? 'active' : ''} ${!script || !script.content?.trim() ? 'empty' : ''}`;
    
    if (script && script.content?.trim()) {
      const scriptName = script.name?.trim() || `Script ${i + 1}`;
      tab.textContent = scriptName;
      tab.onclick = () => selectPhoneScript(i);
    } else {
      tab.textContent = `Script ${i + 1}`;
      tab.title = 'No script configured';
    }
    
    tabsContainer.appendChild(tab);
  }
}

// Select a phone script
function selectPhoneScript(index) {
  console.log('📞 Selecting phone script:', index);
  
  phoneScriptsState.selectedScriptIndex = index;
  setLastUsedScript(index);
  
  // Update tab appearance
  const tabs = document.querySelectorAll('.script-tab');
  tabs.forEach((tab, i) => {
    if (i === index) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  // Render the selected script content
  renderPhoneScriptContent();
}

// Render phone script content
function renderPhoneScriptContent() {
  const contentContainer = document.getElementById('scriptContent');
  if (!contentContainer) return;
  
  const scripts = window.messageTemplates?.phone || [];
  const script = scripts[phoneScriptsState.selectedScriptIndex];
  
  if (!script || !script.content?.trim()) {
    contentContainer.innerHTML = `
      <div class="no-scripts-message">
        <i class="fas fa-phone-slash"></i>
        <h3>No Script Available</h3>
        <p>This script slot is empty.</p>
        <p><a href="message_content.html" class="configure-scripts-link">Configure your phone scripts</a> to get started.</p>
      </div>
    `;
    return;
  }
  
  // Process the script content with contact and org data
  let processedContent = script.content;
  
  // Use replaceTemplateTags if available, otherwise do basic replacement
  if (window.replaceTemplateTags) {
    processedContent = window.replaceTemplateTags(
      script.content,
      phoneScriptsState.currentOrg,
      phoneScriptsState.currentContact
    );
  } else {
    // Basic template replacement
    const contactName = phoneScriptsState.currentContact?.name || 'there';
    const firstName = contactName.split(' ')[0];
    const orgName = phoneScriptsState.currentOrg?.org || 'your organization';
    
    processedContent = processedContent
      .replace(/\[First Name\]/g, firstName)
      .replace(/\[Organization Name\]/g, orgName)
      .replace(/\[Organization Name Short\]/g, orgName);
  }
  
  const scriptName = script.name?.trim() || `Phone Script ${phoneScriptsState.selectedScriptIndex + 1}`;
  
  contentContainer.innerHTML = `
    <div class="script-name">${scriptName}</div>
    <div class="script-text" id="currentScriptText">${processedContent}</div>
    <div class="script-actions">
      <button class="script-action-btn" onclick="copyScriptToClipboard()">
        <i class="fas fa-copy"></i>
        Copy Script
      </button>
      <button class="script-action-btn secondary" onclick="markCallCompleted()">
        <i class="fas fa-check"></i>
        Mark Call Completed
      </button>
    </div>
  `;
}

// Copy script to clipboard
async function copyScriptToClipboard() {
  const scriptTextElement = document.getElementById('currentScriptText');
  if (!scriptTextElement) return;
  
  try {
    // Get text content, preserving line breaks
    const scriptText = scriptTextElement.innerText || scriptTextElement.textContent;
    await navigator.clipboard.writeText(scriptText);
    
    if (window.showMessage) {
      window.showMessage('Phone script copied to clipboard!', 'success');
    } else {
      alert('Phone script copied to clipboard!');
    }
  } catch (error) {
    console.error('❌ Error copying script to clipboard:', error);
    if (window.showMessage) {
      window.showMessage('Failed to copy script to clipboard', 'error');
    } else {
      alert('Failed to copy script to clipboard');
    }
  }
}

// Mark call as completed
async function markCallCompleted() {
  if (!phoneScriptsState.currentContact || !phoneScriptsState.currentOrg) {
    if (window.showMessage) {
      window.showMessage('No contact information available', 'error');
    }
    return;
  }
  
  try {
    // Record the call activity if function is available
    if (window.recordActivity) {
      await window.recordActivity(
        phoneScriptsState.currentContact.contact_id,
        phoneScriptsState.currentOrg.org_id,
        'phone_call',
        `Phone call completed using script: ${window.messageTemplates?.phone[phoneScriptsState.selectedScriptIndex]?.name || 'Phone Script'}`
      );
    }
    
    if (window.showMessage) {
      window.showMessage('Call marked as completed!', 'success');
    } else {
      alert('Call marked as completed!');
    }
    
    closePhoneScripts();
    
    // Refresh the organization view if it's open
    if (window.currentOrgId === phoneScriptsState.currentOrg.org_id && window.showOrganization) {
      window.showOrganization(phoneScriptsState.currentOrg);
    }
    
  } catch (error) {
    console.error('❌ Error marking call as completed:', error);
    if (window.showMessage) {
      window.showMessage('Failed to mark call as completed', 'error');
    }
  }
}

// Track phone call analytics
function trackPhoneCall(contactData, orgData, phoneNumber) {
  console.log('📊 Tracking phone call:', {
    contact: contactData?.name || 'Unknown',
    organization: orgData?.org,
    phone: phoneNumber,
    timestamp: new Date().toISOString()
  });
  
  // You can add additional analytics tracking here
}

// Make functions globally available
window.openPhoneScripts = openPhoneScripts;
window.closePhoneScripts = closePhoneScripts;
window.selectPhoneScript = selectPhoneScript;
window.copyScriptToClipboard = copyScriptToClipboard;
window.markCallCompleted = markCallCompleted;

// Initialize phone scripts panel when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  // Add event listeners for phone scripts panel
  const closeButton = document.getElementById('closeScriptsPanel');
  const overlay = document.getElementById('scriptOverlay');
  
  if (closeButton) {
    closeButton.addEventListener('click', closePhoneScripts);
  }
  
  if (overlay) {
    overlay.addEventListener('click', closePhoneScripts);
  }
  
  // Handle ESC key to close panel
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && phoneScriptsState.isOpen) {
      closePhoneScripts();
    }
  });
});

console.log('📞 Phone Scripts functionality loaded'); 