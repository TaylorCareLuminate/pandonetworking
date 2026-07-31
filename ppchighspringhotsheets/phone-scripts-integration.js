// Phone Scripts Integration for Hotsheets Prospecting
// This script adds phone scripts functionality to the existing hotsheet prospecting page

// Add CSS styles for phone scripts
const phoneScriptsCSS = `
<style>
.script-overlay {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  background-color: rgba(0, 0, 0, 0.8) !important;
  z-index: 999999 !important;
  display: none !important;
  justify-content: flex-end !important;
  align-items: stretch !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.script-overlay.show {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
}

.phone-scripts-panel {
  width: 400px !important;
  height: 100% !important;
  background: white !important;
  box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15) !important;
  display: flex !important;
  flex-direction: column !important;
  position: relative !important;
  visibility: visible !important;
  opacity: 1 !important;
  margin: 0 !important;
  padding: 0 !important;
}

.phone-scripts-header {
  background: var(--primary, #2563eb);
  color: white;
  padding: 20px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.phone-scripts-title {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.phone-scripts-contact {
  font-size: 0.9rem;
  opacity: 0.9;
  margin: 0;
}

.phone-scripts-tabs {
  display: flex;
  border-bottom: 1px solid #e5e7eb;
  background: #f9fafb;
  flex-shrink: 0;
}

.phone-scripts-tab {
  flex: 1;
  padding: 12px 16px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.phone-scripts-tab.active {
  color: var(--primary, #2563eb);
  border-bottom-color: var(--primary, #2563eb);
  background: white;
}

.phone-scripts-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: #f8fafc;
}

.phone-script-item {
  border: none !important;
  border-radius: 0 !important;
  margin-bottom: 0 !important;
  overflow: visible !important;
  transition: none !important;
  background: transparent !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
}

.phone-script-item:hover {
  border-color: none !important;
  box-shadow: none !important;
}

.phone-script-header {
  background: #f9fafb;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.phone-script-name {
  font-weight: 600;
  color: var(--primary, #2563eb);
  margin: 0;
}

.phone-script-actions {
  display: flex;
  gap: 8px;
}

.phone-script-btn {
  background: var(--secondary, #059669);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.phone-script-btn:hover {
  background: #047857;
}

.phone-script-content {
  padding: 20px;
  white-space: pre-wrap;
  line-height: 1.8;
  color: #374151;
  font-size: 1rem;
  max-height: none !important;
  height: auto !important;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  flex: 1;
  min-height: 300px;
}

.phone-scripts-footer {
  padding: 16px 20px;
  border-top: 1px solid #e5e7eb;
  background: #f9fafb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.phone-scripts-close {
  background: #6b7280;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.phone-scripts-close:hover {
  background: #4b5563;
}

.phone-scripts-empty {
  text-align: center;
  color: #9ca3af;
  padding: 40px 20px;
  font-style: italic;
}

.phone-scripts-empty i {
  font-size: 3rem;
  margin-bottom: 16px;
  display: block;
  opacity: 0.5;
}

.call-completed-btn {
  background: var(--primary, #2563eb);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.call-completed-btn:hover {
  background: #1d4ed8;
}
</style>
`;

// Add HTML for phone scripts panel
const phoneScriptsHTML = `
<div class="script-overlay" id="scriptOverlay">
  <div class="phone-scripts-panel" id="phoneScriptsPanel">
    <div class="phone-scripts-header">
      <div>
        <div class="phone-scripts-title">
          <i class="fas fa-phone"></i>
          Phone Scripts
        </div>
        <div class="phone-scripts-contact" id="phoneScriptsContact">
          <!-- Contact info will be populated here -->
        </div>
      </div>
      <button class="phone-scripts-close" onclick="closePhoneScripts()">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <div class="phone-scripts-tabs">
      <div class="phone-scripts-tab active" onclick="selectPhoneScript(0)">
        Script 1
      </div>
      <div class="phone-scripts-tab" onclick="selectPhoneScript(1)">
        Script 2
      </div>
      <div class="phone-scripts-tab" onclick="selectPhoneScript(2)">
        Script 3
      </div>
      <div class="phone-scripts-tab" onclick="selectPhoneScript(3)">
        Script 4
      </div>
      <div class="phone-scripts-tab" onclick="selectPhoneScript(4)">
        Script 5
      </div>
      <div class="phone-scripts-tab" onclick="selectPhoneScript(5)">
        Script 6
      </div>
    </div>

    <div class="phone-scripts-content" id="phoneScriptsContent">
      <!-- Script content will be populated here -->
    </div>
  </div>
</div>
`;

// Phone Scripts Variables
let currentPhoneScripts = [];
let selectedScriptIndex = 0;
let currentContactData = null;
let currentOrgData = null;
let currentPhoneNumber = null;

// Get last used script from localStorage
function getLastUsedScript() {
  try {
    return parseInt(localStorage.getItem('lastUsedPhoneScript')) || 0;
  } catch (e) {
    return 0;
  }
}

// Set last used script in localStorage
function setLastUsedScript(index) {
  try {
    localStorage.setItem('lastUsedPhoneScript', index.toString());
  } catch (e) {
    console.warn('Could not save last used script');
  }
}

// Main function to open phone scripts panel
function openPhoneScripts(contactData, orgData, phoneNumber) {
  console.log('📞 Opening phone scripts for:', contactData, orgData, phoneNumber);
  
  // Debug: Check current state
  console.log('📞 Debug at open: currentPhoneScripts:', currentPhoneScripts);
  console.log('📞 Debug at open: currentPhoneScripts length:', currentPhoneScripts?.length);
  console.log('📞 Debug at open: window.messageTemplates:', window.messageTemplates);
  console.log('📞 Debug at open: window.messageTemplates.phone:', window.messageTemplates?.phone);
  
  // Store current data
  currentContactData = contactData;
  currentOrgData = orgData;
  currentPhoneNumber = phoneNumber;
  
  // IMMEDIATELY try to load phone scripts from Firebase since we know the UID
  loadPhoneScriptsFromFirebase();
  
  console.log('📞 Final currentPhoneScripts length after force load:', currentPhoneScripts?.length || 0);
  
  // Update the header
  updatePhoneScriptsHeader(contactData, orgData, phoneNumber);
  
  // Show the overlay and panel
  const overlay = document.getElementById('scriptOverlay');
  const panel = document.getElementById('phoneScriptsPanel');
  
  console.log('📞 Debug: panel element found:', !!panel);
  console.log('📞 Debug: overlay element found:', !!overlay);
  
  if (overlay && panel) {
    console.log('📞 Debug: Showing panel and overlay...');
    overlay.classList.add('show');
    overlay.style.display = 'flex';
    overlay.style.visibility = 'visible';
    overlay.style.opacity = '1';
    panel.classList.add('active');
    
    console.log('📞 Debug: Header updated');
    
    // Select first script by default
    selectedScriptIndex = 0;
    console.log('📞 Debug: Selected script index:', selectedScriptIndex);
    
    console.log('📞 Debug: Rendering tabs...');
    renderPhoneScriptTabs();
    console.log('📞 Debug: Rendering content...');
    renderPhoneScriptContent();
    
    console.log('📞 Debug: Panel should now be visible');
  } else {
    console.error('❌ Phone scripts panel elements not found');
  }
}

// Load phone scripts directly from Firebase
async function loadPhoneScriptsFromFirebase() {
  console.log('🔥 Loading phone scripts directly from Firebase...');
  
  try {
    // We know the UID from the console logs
    const knownUID = 'QfqP5QbZcxT6yG9XY2kuxEirHdV2';
    console.log('🔥 Using known UID:', knownUID);
    
    // Import Firebase functions
    const { ref, get, getDatabase } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js');
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js');
    
    // Get database reference - try multiple approaches
    let database = null;
    
    // Approach 1: Try to get existing database from window
    if (window.db) {
      database = window.db;
      console.log('🔥 Using existing window.db');
    } else if (window.database) {
      database = window.database;
      console.log('🔥 Using existing window.database');
    } else {
      // Approach 2: Try to get Firebase app from window and get database from it
      if (window.firebaseApp) {
        database = getDatabase(window.firebaseApp);
        console.log('🔥 Got database from window.firebaseApp');
      } else {
        // Approach 3: Initialize our own Firebase connection
        console.log('🔥 Initializing new Firebase connection...');
        
        const firebaseConfig = {
          apiKey: "AIzaSyCfCi1V7iT_mHBpGDe30LdS3k0WfBKRzek",
          authDomain: "careluminate-c609b.firebaseapp.com",
          databaseURL: "https://careluminate-c609b-default-rtdb.firebaseio.com",
          projectId: "careluminate-c609b",
          storageBucket: "careluminate-c609b.appspot.com",
          messagingSenderId: "1075488021027",
          appId: "1:1075488021027:web:4efab2dfa6ecaee22ddc3c"
        };
        
        const app = initializeApp(firebaseConfig, 'phone-scripts-app-' + Date.now());
        database = getDatabase(app);
        console.log('🔥 Created new Firebase app and database');
      }
    }
    
    if (!database) {
      console.error('❌ Could not get database connection');
      return;
    }
    
    const userPath = `ppcmessagecontent25/${knownUID}`;
    console.log('🔥 Loading from Firebase path:', userPath);
    
    const userRef = ref(database, userPath);
    const snapshot = await get(userRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      console.log('🔥 ✅ Found data from Firebase:', data);
      console.log('🔥 ✅ Data keys:', Object.keys(data));
      console.log('🔥 ✅ Phone data:', data.phone);
      
      if (data.phone && Array.isArray(data.phone)) {
        const phoneScripts = data.phone.filter(script => script && script.content && script.content.trim());
        if (phoneScripts.length > 0) {
          currentPhoneScripts = phoneScripts;
          console.log('🔥 ✅ Phone scripts loaded successfully:', phoneScripts.length);
          console.log('🔥 ✅ First script:', phoneScripts[0]);
          
          // Re-render the content immediately
          setTimeout(() => {
            console.log('🔥 Re-rendering phone script content with loaded scripts...');
            renderPhoneScriptTabs();
            renderPhoneScriptContent();
          }, 100);
          
          return;
        }
      }
      
      console.log('🔥 ⚠️ No valid phone scripts found in data');
    } else {
      console.log('🔥 ❌ No data found at Firebase path');
    }
  } catch (error) {
    console.error('🔥 ❌ Error loading from Firebase:', error);
  }
}

// Close phone scripts panel
function closePhoneScripts() {
  const overlay = document.getElementById('scriptOverlay');
  const panel = document.getElementById('phoneScriptsPanel');
  
  if (overlay) {
    overlay.classList.remove('show');
    overlay.style.display = 'none';
  }
  
  if (panel) {
    panel.classList.remove('active');
  }
  
  // Remove escape key listener
  document.removeEventListener('keydown', handlePhoneScriptsEscape);
}

// Handle escape key
function handlePhoneScriptsEscape(e) {
  if (e.key === 'Escape') {
    closePhoneScripts();
  }
}

// Update header with contact information
function updatePhoneScriptsHeader(contactData, orgData, phoneNumber) {
  const contactElement = document.getElementById('phoneScriptsContact');
  
  let contactName = 'Unknown Contact';
  if (contactData) {
    // Use the same contact name extraction logic as the main app
    if (window.getContactName) {
      contactName = window.getContactName(contactData);
    } else {
      // Fallback logic that matches the main app's getContactName function
      if (contactData.executive && contactData.executive.trim()) {
        contactName = contactData.executive;
      } else if (contactData.name && contactData.name.trim()) {
        contactName = contactData.name;
      } else if (contactData.full_name && contactData.full_name.trim()) {
        contactName = contactData.full_name;
      } else if (contactData.contact_name && contactData.contact_name.trim()) {
        contactName = contactData.contact_name;
      } else if (contactData.first_name && contactData.last_name) {
        contactName = `${contactData.first_name} ${contactData.last_name}`.trim();
      } else if (contactData.first_name && contactData.first_name.trim()) {
        contactName = contactData.first_name;
      } else if (contactData.email) {
        // Extract name from email as last resort
        const emailName = contactData.email.split('@')[0];
        contactName = emailName.replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
    }
  }
  
  const orgName = orgData?.org || 'Unknown Organization';
  
  contactElement.innerHTML = `
    Calling: <strong>${contactName}</strong> at <strong>${orgName}</strong><br>
    Phone: <strong>${phoneNumber}</strong>
  `;
}

// Render script tabs
function renderPhoneScriptTabs() {
  const tabsContainer = document.querySelector('.phone-scripts-tabs');
  
  if (!currentPhoneScripts || currentPhoneScripts.length === 0) {
    tabsContainer.innerHTML = '';
    return;
  }
  
  let tabsHtml = '';
  for (let i = 0; i < 6; i++) {
    const script = currentPhoneScripts[i];
    const hasContent = script && script.content && script.content.trim();
    const isSelected = i === selectedScriptIndex;
    
    tabsHtml += `
      <div class="phone-scripts-tab ${isSelected ? 'active' : ''}" onclick="${hasContent ? `selectPhoneScript(${i})` : ''}">
        ${i + 1}
      </div>
    `;
  }
  
  tabsContainer.innerHTML = tabsHtml;
}

// Select a script tab
function selectPhoneScript(index) {
  if (index < 0 || index >= 6) return;
  
  const script = currentPhoneScripts[index];
  if (!script || !script.content || !script.content.trim()) return;
  
  selectedScriptIndex = index;
  setLastUsedScript(index);
  
  renderPhoneScriptTabs();
  renderPhoneScriptContent();
}

// Render script content
function renderPhoneScriptContent() {
  const contentContainer = document.getElementById('phoneScriptsContent');
  
  console.log('📞 renderPhoneScriptContent called');
  console.log('📞 currentPhoneScripts:', currentPhoneScripts);
  console.log('📞 currentPhoneScripts length:', currentPhoneScripts?.length);
  console.log('📞 selectedScriptIndex:', selectedScriptIndex);
  
  if (!currentPhoneScripts || currentPhoneScripts.length === 0) {
    console.log('📞 No phone scripts available, showing empty state');
    contentContainer.innerHTML = `
      <div class="phone-scripts-empty">
        <i class="fas fa-phone-slash"></i>
        <h3>No Phone Scripts Configured</h3>
        <p>Set up your phone scripts in the message builder to use this feature.</p>
        <a href="message_content.html" class="call-completed-btn">
          <i class="fas fa-cog"></i> Configure Phone Scripts
        </a>
      </div>
    `;
    return;
  }
  
  const script = currentPhoneScripts[selectedScriptIndex];
  console.log('📞 Selected script:', script);
  console.log('📞 Script content type:', typeof script?.content);
  console.log('📞 Script content preview:', script?.content?.substring(0, 100));
  
  if (!script || !script.content || !script.content.trim()) {
    console.log('📞 Script is empty, showing empty state');
    contentContainer.innerHTML = `
      <div class="phone-scripts-empty">
        <i class="fas fa-file-alt"></i>
        <h3>Script ${selectedScriptIndex + 1} is Empty</h3>
        <p>This script slot doesn't have any content yet.</p>
        <a href="message_content.html" class="call-completed-btn">
          <i class="fas fa-edit"></i> Add Script Content
        </a>
      </div>
    `;
    return;
  }
  
  // Process the script content with template replacement
  let processedContent = script.content;
  
  // Handle rich text content - if it's HTML, keep it as-is, otherwise treat as plain text
  let isHtmlContent = false;
  if (typeof processedContent === 'string') {
    // Check if content contains HTML tags
    isHtmlContent = /<[a-z][\s\S]*>/i.test(processedContent);
    console.log('📞 Content appears to be HTML:', isHtmlContent);
  }
  
  // Replace [First Name]
  if (currentContactData) {
    let firstName = 'there';
    if (window.getContactName) {
      const fullName = window.getContactName(currentContactData);
      firstName = fullName && fullName !== 'Unknown Contact' ? fullName.split(' ')[0] : 'there';
    } else if (currentContactData.executive) {
      firstName = currentContactData.executive.split(' ')[0];
    } else if (currentContactData.name) {
      firstName = currentContactData.name.split(' ')[0];
    } else if (currentContactData.first_name) {
      firstName = currentContactData.first_name;
    }
    processedContent = processedContent.replace(/\[First Name\]/g, firstName);
    console.log('📞 Replaced [First Name] with:', firstName);
  } else {
    processedContent = processedContent.replace(/\[First Name\]/g, 'there');
  }
  
  // Replace [Organization Name]
  if (currentOrgData) {
    processedContent = processedContent.replace(/\[Organization Name\]/g, currentOrgData.org || 'your organization');
    processedContent = processedContent.replace(/\[Organization Name Short\]/g, currentOrgData.org_short_x || currentOrgData.org || 'your organization');
    console.log('📞 Replaced [Organization Name] with:', currentOrgData.org);
    
    // Handle personalization
    let personalization = '';
    if (currentContactData && currentContactData.personalization && currentContactData.personalization.trim()) {
      personalization = currentContactData.personalization.trim();
    } else if (currentOrgData.organization_news_recent) {
      personalization = `I saw the recent news about ${currentOrgData.org}`;
    }
    processedContent = processedContent.replace(/\[Personalization Sentence\]/g, personalization);
    
    // Handle Epic jobs
    let epicJobs = '';
    if (currentContactData && currentContactData.open_epic_jobs && currentContactData.open_epic_jobs.trim()) {
      epicJobs = currentContactData.open_epic_jobs;
    } else if (currentOrgData.epic_jobs && parseInt(currentOrgData.epic_jobs) > 0) {
      const jobCount = parseInt(currentOrgData.epic_jobs);
      const jobText = jobCount === 1 ? 'job' : 'jobs';
      epicJobs = `I see you have ${jobCount} open Epic ${jobText} listed`;
    }
    processedContent = processedContent.replace(/\[Open Epic Jobs\]/g, epicJobs);
  }
  
  console.log('📞 Final processed content length:', processedContent?.length);
  console.log('📞 Final processed content preview:', processedContent?.substring(0, 200));
  
  // Display the content appropriately
  let displayContent;
  if (isHtmlContent) {
    // If it's HTML content, display as-is
    displayContent = processedContent;
  } else {
    // If it's plain text, convert line breaks to <br> tags
    displayContent = processedContent.replace(/\n/g, '<br>');
  }
  
  contentContainer.innerHTML = `
    <div class="phone-script-item">
      <div class="phone-script-header">
        <h3 class="phone-script-name">${script.name || `Phone Script ${selectedScriptIndex + 1}`}</h3>
        <div class="phone-script-actions">
          <button class="phone-script-btn" onclick="copyScriptToClipboard()">
            <i class="fas fa-copy"></i> Copy Script
          </button>
          <button class="call-completed-btn" onclick="markCallCompleted()">
            <i class="fas fa-check"></i> Mark Completed
          </button>
        </div>
      </div>
      <div class="phone-script-content">
        ${displayContent}
      </div>
    </div>
  `;
  
  console.log('📞 Content rendered successfully');
}

// Copy script to clipboard
async function copyScriptToClipboard() {
  const script = currentPhoneScripts[selectedScriptIndex];
  if (!script || !script.content) return;
  
  // Get the processed content from the displayed script
  const scriptTextElement = document.querySelector('.phone-script-content');
  if (!scriptTextElement) return;
  
  // Get text content (strips HTML)
  const textContent = scriptTextElement.innerText || scriptTextElement.textContent;
  
  try {
    await navigator.clipboard.writeText(textContent);
    if (window.showMessage) {
      window.showMessage('Script copied to clipboard!', 'success');
    }
    
    // Visual feedback
    const copyBtn = document.querySelector('.phone-script-btn');
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
    copyBtn.style.background = '#059669';
    
    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      copyBtn.style.background = '';
    }, 2000);
    
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    if (window.showMessage) {
      window.showMessage('Could not copy to clipboard. Please copy manually.', 'error');
    }
  }
}

// Mark call as completed
async function markCallCompleted() {
  if (!currentContactData || !currentOrgData) return;
  
  try {
    // Track the phone call using existing function
    let contactName = 'Unknown Contact';
    if (window.getContactName) {
      contactName = window.getContactName(currentContactData);
    } else if (currentContactData.name) {
      contactName = currentContactData.name;
    } else if (currentContactData.first_name && currentContactData.last_name) {
      contactName = `${currentContactData.first_name} ${currentContactData.last_name}`;
    }
    
    if (window.trackPhoneCall) {
      await window.trackPhoneCall(currentOrgData.id, currentContactData.email, contactName, currentPhoneNumber);
    }
    
    if (window.showMessage) {
      window.showMessage('Call marked as completed!', 'success');
    }
    
    // Visual feedback
    const completeBtn = document.querySelector('.call-completed-btn');
    const originalText = completeBtn.innerHTML;
    completeBtn.innerHTML = '<i class="fas fa-check-double"></i> Completed!';
    completeBtn.style.background = '#059669';
    
    setTimeout(() => {
      completeBtn.innerHTML = originalText;
      completeBtn.style.background = '';
    }, 2000);
    
    // Close the panel after a delay
    setTimeout(() => {
      closePhoneScripts();
    }, 1500);
    
  } catch (error) {
    console.error('Error marking call completed:', error);
    if (window.showMessage) {
      window.showMessage('Error tracking call completion.', 'error');
    }
  }
}

// Force load phone scripts from all possible sources
function forceLoadPhoneScriptsFromAllSources() {
  console.log('🔄 Force loading phone scripts from all sources...');
  
  // Source 1: window.messageTemplates.phone
  if (window.messageTemplates && window.messageTemplates.phone && Array.isArray(window.messageTemplates.phone)) {
    const phoneScripts = window.messageTemplates.phone.filter(script => script && script.content && script.content.trim());
    if (phoneScripts.length > 0) {
      currentPhoneScripts = phoneScripts;
      console.log('📞 ✅ Loaded phone scripts from window.messageTemplates.phone:', currentPhoneScripts.length);
      console.log('📞 ✅ First script preview:', currentPhoneScripts[0]?.name, currentPhoneScripts[0]?.content?.substring(0, 100));
      return;
    }
  }
  
  // Source 2: Check if there's a global user with message templates
  const user = window.currentUser || window.hotsheetCurrentUser;
  if (user && user.uid) {
    console.log('📞 Checking global templates for user:', user.uid);
    
    // Try to access Firebase data directly
    if (window.db) {
      setTimeout(async () => {
        try {
          const { ref, get } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js');
          
          const userPath = `ppcmessagecontent25/${user.uid}`;
          console.log('📞 Loading from Firebase path:', userPath);
          
          const userRef = ref(window.db, userPath);
          const snapshot = await get(userRef);
          
          if (snapshot.exists()) {
            const data = snapshot.val();
            console.log('📞 ✅ Found fresh data from Firebase:', data);
            
            if (data.phone && Array.isArray(data.phone)) {
              const phoneScripts = data.phone.filter(script => script && script.content && script.content.trim());
              if (phoneScripts.length > 0) {
                currentPhoneScripts = phoneScripts;
                console.log('📞 ✅ Fresh phone scripts loaded from Firebase:', phoneScripts.length);
                
                // Re-render the content with the fresh scripts
                renderPhoneScriptContent();
                return;
              }
            }
          }
        } catch (error) {
          console.error('📞 ❌ Error loading fresh scripts from Firebase:', error);
        }
      }, 100);
    }
  }
  
  // Source 3: Check window.phoneScripts
  if (window.phoneScripts && Array.isArray(window.phoneScripts)) {
    const phoneScripts = window.phoneScripts.filter(script => script && script.content && script.content.trim());
    if (phoneScripts.length > 0) {
      currentPhoneScripts = phoneScripts;
      console.log('📞 ✅ Loaded phone scripts from window.phoneScripts:', currentPhoneScripts.length);
      return;
    }
  }
  
  // Source 4: Manual debug - run the debug function to see what's available
  if (window.debugPhoneScripts) {
    console.log('📞 Running debug to check available data...');
    window.debugPhoneScripts();
  }
  
  console.log('📞 ⚠️ No phone scripts found in any source');
}

// Initialize phone scripts integration
function initPhoneScriptsIntegration() {
  console.log('🔧 Initializing phone scripts integration...');
  
  // Add CSS to head
  document.head.insertAdjacentHTML('beforeend', phoneScriptsCSS);
  
  // Add HTML to body
  document.body.insertAdjacentHTML('beforeend', phoneScriptsHTML);
  
  // Close panel when clicking overlay
  document.addEventListener('click', (e) => {
    if (e.target.id === 'scriptOverlay') {
      closePhoneScripts();
    }
  });
  
  // Debug: Check what's currently available
  console.log('📞 Debug: window.messageTemplates at init:', window.messageTemplates);
  console.log('📞 Debug: window.currentUser at init:', window.currentUser);
  console.log('📞 Debug: window.db at init:', window.db);
  
  // Update messageTemplates to include phone if it exists
  if (window.messageTemplates && !window.messageTemplates.phone) {
    window.messageTemplates.phone = [];
  }
  
  // Hook into existing loadMessageTemplates function to load phone scripts
  if (window.loadMessageTemplates) {
    const originalLoadMessageTemplates = window.loadMessageTemplates;
    window.loadMessageTemplates = async function() {
      await originalLoadMessageTemplates();
      
      // Load phone scripts from the same data source that was just loaded
      // The original function should have loaded all messageTemplates including phone
      if (window.messageTemplates) {
        if (!window.messageTemplates.phone) {
          window.messageTemplates.phone = [];
        }
        console.log('📞 Phone scripts after load:', window.messageTemplates.phone.length);
        console.log('📞 All messageTemplates keys:', Object.keys(window.messageTemplates));
        
        // If phone scripts were loaded, update the current scripts
        if (window.messageTemplates.phone && window.messageTemplates.phone.length > 0) {
          currentPhoneScripts = window.messageTemplates.phone;
          console.log('📞 Updated currentPhoneScripts from messageTemplates:', currentPhoneScripts.length);
        }
      }
    };
  }
  
  // Also try to load phone scripts from existing messageTemplates if they're already loaded
  if (window.messageTemplates && window.messageTemplates.phone) {
    currentPhoneScripts = window.messageTemplates.phone;
    console.log('📞 Loaded existing phone scripts from messageTemplates:', currentPhoneScripts.length);
  }
  
  // Hook into the existing trackPhoneCall function
  const originalTrackPhoneCall = window.trackPhoneCall;
  window.trackPhoneCall = function(orgId, contactEmail, contactName, phoneNumber) {
    console.log('📞 Phone call intercepted:', {orgId, contactEmail, contactName, phoneNumber});
    
    // Find the current organization data
    const currentOrg = window.currentOrgData;
    // Look for contact in the correct global variable
    const currentContact = window.currentOrgContacts?.find(c => c.email === contactEmail) || 
                          currentOrg?.contacts?.find(c => c.email === contactEmail);
    
    console.log('📞 Found data for phone scripts:', {
      currentOrg: !!currentOrg, 
      currentContact: !!currentContact, 
      phoneNumber,
      orgName: currentOrg?.org,
      contactsArray: window.currentOrgContacts?.length || 0
    });
    
    // Open phone scripts if we have the data and function
    if (currentContact && currentOrg && phoneNumber && window.openPhoneScripts) {
      console.log('📞 Opening phone scripts panel...');
      window.openPhoneScripts(currentContact, currentOrg, phoneNumber);
    } else {
      console.log('⚠️ Cannot open phone scripts:', {
        hasContact: !!currentContact,
        hasOrg: !!currentOrg,
        hasPhone: !!phoneNumber,
        hasFunction: !!window.openPhoneScripts,
        contactEmail: contactEmail,
        availableEmails: window.currentOrgContacts?.map(c => c.email) || []
      });
    }
    
    // Call the original function
    if (originalTrackPhoneCall) {
      return originalTrackPhoneCall(orgId, contactEmail, contactName, phoneNumber);
    }
  };
  
  console.log('✅ Phone scripts trackPhoneCall hook installed');
  
  // Also try to load phone scripts directly from Firebase if available
  if (window.currentUser && window.db) {
    setTimeout(async () => {
      try {
        const { ref, get } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js');
        
        // Try multiple paths for phone scripts
        const possiblePaths = [
          `ppcmessagecontent25/${window.currentUser.uid}`,
          `ppcmessagecontent25/${window.currentUser.email.replace(/\./g, ',')}`,
          `ppcmessagecontent25/QfqP5QbZcxT6yG9XY2kuxEirHdV2` // Known UID for taylordavis@careluminate.com
        ];
        
        for (const userPath of possiblePaths) {
          try {
            const userRef = ref(window.db, userPath);
            const snapshot = await get(userRef);
            
            if (snapshot.exists()) {
              const data = snapshot.val();
              console.log('📞 Found phone script data at path:', userPath, data);
              
              // Look for phone scripts in the data
              if (data.phone && Array.isArray(data.phone)) {
                const phoneScripts = data.phone.filter(msg => msg && msg.content && msg.content.trim());
                if (phoneScripts.length > 0) {
                  currentPhoneScripts = phoneScripts;
                  window.messageTemplates = window.messageTemplates || {};
                  window.messageTemplates.phone = phoneScripts;
                  console.log('📞 Phone scripts loaded from Firebase array:', phoneScripts.length);
                }
              } else if (data.phone && typeof data.phone === 'object') {
                const phoneScripts = Object.values(data.phone).filter(msg => msg && msg.content && msg.content.trim());
                if (phoneScripts.length > 0) {
                  currentPhoneScripts = phoneScripts;
                  window.messageTemplates = window.messageTemplates || {};
                  window.messageTemplates.phone = phoneScripts;
                  console.log('📞 Phone scripts loaded from Firebase object:', phoneScripts.length);
                }
              }
              
              // Also check if data has any other structure with phone scripts
              console.log('📞 Available data keys:', Object.keys(data));
              
              if (currentPhoneScripts.length > 0) {
                break; // Exit once we find phone scripts
              }
            }
          } catch (error) {
            console.log('❌ Error loading phone scripts from path:', userPath, error);
          }
        }
        
        if (currentPhoneScripts.length === 0) {
          console.log('⚠️ No phone scripts found in Firebase. Available data may not include phone scripts.');
        }
      } catch (error) {
        console.log('❌ Error loading phone scripts:', error);
      }
    }, 2000);
  }
  
  // Periodic check to sync phone scripts from messageTemplates
  setInterval(() => {
    if (window.messageTemplates && window.messageTemplates.phone && 
        window.messageTemplates.phone.length > 0 && 
        currentPhoneScripts.length === 0) {
      currentPhoneScripts = window.messageTemplates.phone;
      console.log('📞 Synced phone scripts from messageTemplates:', currentPhoneScripts.length);
    }
  }, 3000);
  
  console.log('✅ Phone scripts integration complete');
}

// Make functions globally available
window.openPhoneScripts = openPhoneScripts;
window.closePhoneScripts = closePhoneScripts;
window.selectPhoneScript = selectPhoneScript;
window.copyScriptToClipboard = copyScriptToClipboard;
window.markCallCompleted = markCallCompleted;

// Debug function to check phone scripts
window.debugPhoneScripts = async function() {
  console.log('🧪 === PHONE SCRIPTS DEBUG ===');
  console.log('📞 currentPhoneScripts:', currentPhoneScripts);
  console.log('📞 window.messageTemplates:', window.messageTemplates);
  console.log('📞 window.currentUser:', window.currentUser);
  console.log('📞 window.db:', window.db);
  
  // Try to manually load from Firebase
  if (window.currentUser && window.db) {
    try {
      const { ref, get } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js');
      
      const userPath = `ppcmessagecontent25/${window.currentUser.uid}`;
      console.log('🧪 Checking Firebase path:', userPath);
      
      const userRef = ref(window.db, userPath);
      const snapshot = await get(userRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        console.log('🧪 Firebase data found:', data);
        console.log('🧪 Data keys:', Object.keys(data));
        console.log('🧪 Phone data:', data.phone);
        
        if (data.phone) {
          console.log('🧪 Phone data type:', typeof data.phone);
          console.log('🧪 Phone data is array:', Array.isArray(data.phone));
          if (Array.isArray(data.phone)) {
            console.log('🧪 Phone array length:', data.phone.length);
            console.log('🧪 Phone array content:', data.phone);
          } else if (typeof data.phone === 'object') {
            console.log('🧪 Phone object keys:', Object.keys(data.phone));
            console.log('🧪 Phone object values:', Object.values(data.phone));
          }
        }
      } else {
        console.log('🧪 No data found at path');
      }
    } catch (error) {
      console.error('🧪 Error checking Firebase:', error);
    }
  }
  
  console.log('🧪 === END DEBUG ===');
};

// Force load phone scripts function
window.forceLoadPhoneScripts = async function() {
  console.log('🔄 Force loading phone scripts...');
  
  if (window.messageTemplates && window.messageTemplates.phone) {
    currentPhoneScripts = window.messageTemplates.phone;
    console.log('✅ Loaded from messageTemplates:', currentPhoneScripts.length);
    return;
  }
  
  // Try loading from Firebase
  if (window.currentUser && window.db) {
    try {
      const { ref, get } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js');
      
      const userPath = `ppcmessagecontent25/${window.currentUser.uid}`;
      const userRef = ref(window.db, userPath);
      const snapshot = await get(userRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        
        if (data.phone && Array.isArray(data.phone)) {
          const phoneScripts = data.phone.filter(msg => msg && msg.content && msg.content.trim());
          if (phoneScripts.length > 0) {
            currentPhoneScripts = phoneScripts;
            window.messageTemplates = window.messageTemplates || {};
            window.messageTemplates.phone = phoneScripts;
            console.log('✅ Force loaded phone scripts:', phoneScripts.length);
            return;
          }
        }
      }
    } catch (error) {
      console.error('❌ Error force loading:', error);
    }
  }
  
  console.log('❌ No phone scripts found');
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPhoneScriptsIntegration);
} else {
  initPhoneScriptsIntegration();
} 