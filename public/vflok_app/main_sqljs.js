// ============================================================================
// vFlok Hospital Dashboard - Main Process (Backend) - sql.js Version
// ============================================================================
// This version uses sql.js (pure JavaScript) instead of better-sqlite3
// No build tools required!
// ============================================================================

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const { autoUpdater } = require('electron-updater');

let mainWindow;
let db;
let SQL;

// ============================================================================
// DATABASE SETUP
// ============================================================================

async function initializeDatabase() {
  try {
    // Database path - in development vs production
    let dbPath;
    
    if (app.isPackaged) {
      // Production: database is in resources/database
      dbPath = path.join(process.resourcesPath, 'database', 'vflok_hospitals.db');
    } else {
      // Development: database is in project directory
      dbPath = path.join(__dirname, 'database', 'vflok_hospitals.db');
    }

    console.log('📂 Database path:', dbPath);

    // Check if file exists
    if (!fs.existsSync(dbPath)) {
      throw new Error(`Database file not found at: ${dbPath}`);
    }

    // Initialize sql.js
    console.log('🔄 Initializing sql.js...');
    SQL = await initSqlJs({
      locateFile: file => {
        if (app.isPackaged) {
          return path.join(process.resourcesPath, 'node_modules', 'sql.js', 'dist', file);
        } else {
          return path.join(__dirname, 'node_modules', 'sql.js', 'dist', file);
        }
      }
    });

    // Load database file into memory
    console.log('🔄 Loading database into memory...');
    const dbBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(dbBuffer);

    console.log('✅ Database loaded successfully');

    // Get database stats
    const result = db.exec('SELECT COUNT(*) as count FROM hospitals');
    if (result && result.length > 0) {
      const recordCount = result[0].values[0][0];
      console.log(`📊 Total hospital records: ${recordCount}`);
    }
    
    // Check if health_systems table exists
    const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='health_systems'");
    if (tablesResult && tablesResult.length > 0) {
      const hsResult = db.exec('SELECT COUNT(*) as count FROM health_systems');
      if (hsResult && hsResult.length > 0) {
        const hsCount = hsResult[0].values[0][0];
        console.log(`📊 Total health system records: ${hsCount}`);
      }
    }

    return true;
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    console.error('Attempted database path:', dbPath);
    console.error('Current directory:', __dirname);
    console.error('Is packaged:', app.isPackaged);
    
    dialog.showErrorBox(
      'Database Error',
      `Failed to open database: ${error.message}\n\nDatabase path: ${dbPath}\n\nPlease ensure the database file exists at this location.`
    );
    return false;
  }
}

// ============================================================================
// HELPER FUNCTIONS FOR sql.js
// ============================================================================

// Convert sql.js result to array of objects (like better-sqlite3)
function resultsToObjects(result) {
  if (!result || result.length === 0) return [];
  
  const columns = result[0].columns;
  const values = result[0].values;
  
  return values.map(row => {
    const obj = {};
    columns.forEach((col, index) => {
      obj[col] = row[index];
    });
    return obj;
  });
}

// Execute query and return results as objects
function query(sql, params = {}) {
  try {
    // Convert named parameters to positional
    let sqlQuery = sql;
    const paramValues = [];
    
    // Replace @param with ?
    Object.keys(params).forEach(key => {
      sqlQuery = sqlQuery.replace(new RegExp(`@${key}`, 'g'), '?');
      paramValues.push(params[key]);
    });
    
    const result = db.exec(sqlQuery, paramValues);
    return resultsToObjects(result);
  } catch (error) {
    console.error('Query error:', error);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}

// ============================================================================
// WINDOW CREATION
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    title: 'vFlok Hospital Dashboard',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    backgroundColor: '#f9fafb',
    show: false  // Don't show until ready
  });

  // Load the HTML file
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('✅ Window shown');
  });

  // Open DevTools in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
  
  // Log any console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer: ${message}`);
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ============================================================================
// IPC HANDLERS - Database Queries
// ============================================================================

// Get all hospitals with pagination and filtering
ipcMain.handle('db:query-hospitals', async (event, options) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      search = '',
      filters = {},
      sortBy = 'hospital_name',
      sortDirection = 'ASC'
    } = options;

    // Build WHERE clause
    const whereClauses = [];
    const params = {};

    // Search across multiple fields
    if (search) {
      whereClauses.push(`(
        hospital_name LIKE @search OR
        vflok_health_system LIKE @search OR
        facility_id LIKE @search OR
        hospital_city LIKE @search OR
        hospital_state LIKE @search
      )`);
      params.search = `%${search}%`;
    }

    // Add filters
    Object.entries(filters).forEach(([field, value]) => {
      if (value && value !== 'all') {
        if (value === '(NA/Unknown)') {
          whereClauses.push(`(${field} IS NULL OR ${field} = '' OR ${field} = 'N/A')`);
        } else if (value === 'other' && field === 'hospital_state') {
          whereClauses.push(`${field} NOT IN ('TX','CA','FL','IL','OH','NY','PA','LA','GA','IN')`);
        } else {
          whereClauses.push(`${field} = @${field}`);
          params[field] = value;
        }
      }
    });

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM hospitals ${whereSQL}`;
    const countResults = query(countQuery, params);
    const totalRecords = countResults[0]?.count || 0;

    // Get paginated results
    const offset = (page - 1) * pageSize;
    const dataQuery = `
      SELECT * FROM hospitals 
      ${whereSQL}
      ORDER BY ${sortBy} ${sortDirection}
      LIMIT @limit OFFSET @offset
    `;
    
    const records = query(dataQuery, {
      ...params,
      limit: pageSize,
      offset: offset
    });

    return {
      success: true,
      data: records,
      totalRecords,
      totalPages: Math.ceil(totalRecords / pageSize),
      currentPage: page
    };

  } catch (error) {
    console.error('Query error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get all data for filtering (cached in renderer)
ipcMain.handle('db:get-all-hospitals', async () => {
  try {
    const sqlQuery = 'SELECT * FROM hospitals ORDER BY hospital_name';
    const records = query(sqlQuery);

    return {
      success: true,
      data: records
    };
  } catch (error) {
    console.error('Get all hospitals error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get unique values for filter dropdowns
ipcMain.handle('db:get-unique-values', async (event, field) => {
  try {
    const sqlQuery = `
      SELECT DISTINCT ${field} as value 
      FROM hospitals 
      WHERE ${field} IS NOT NULL AND ${field} != ''
      ORDER BY ${field}
    `;
    const results = query(sqlQuery);

    return {
      success: true,
      data: results.map(r => r.value)
    };
  } catch (error) {
    console.error('Get unique values error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get statistics
ipcMain.handle('db:get-stats', async () => {
  try {
    const queries = {
      totalHospitals: 'SELECT COUNT(*) as count FROM hospitals',
      uniqueStates: 'SELECT COUNT(DISTINCT hospital_state) as count FROM hospitals WHERE hospital_state IS NOT NULL',
      uniqueHealthSystems: 'SELECT COUNT(DISTINCT vflok_health_system) as count FROM hospitals WHERE vflok_health_system IS NOT NULL',
      uniqueEHRs: 'SELECT COUNT(DISTINCT ehr) as count FROM hospitals WHERE ehr IS NOT NULL'
    };

    const stats = {};
    for (const [key, sql] of Object.entries(queries)) {
      const result = query(sql);
      stats[key] = result[0]?.count || 0;
    }
    
    // Check if health_systems table exists
    const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='health_systems'");
    if (tablesResult && tablesResult.length > 0) {
      const hsResult = query('SELECT COUNT(*) as count FROM health_systems');
      stats.totalHealthSystems = hsResult[0]?.count || 0;
    } else {
      stats.totalHealthSystems = 0;
    }

    return {
      success: true,
      data: stats
    };
  } catch (error) {
    console.error('Get stats error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Export data to CSV
ipcMain.handle('db:export-csv', async (event, options) => {
  try {
    const { filters = {}, search = '', table = 'hospitals' } = options;

    // Build WHERE clause
    const whereClauses = [];
    const params = {};

    if (search) {
      if (table === 'hospitals') {
        whereClauses.push(`(
          hospital_name LIKE @search OR
          vflok_health_system LIKE @search OR
          facility_id LIKE @search OR
          hospital_city LIKE @search OR
          hospital_state LIKE @search
        )`);
      } else if (table === 'health_systems') {
        whereClauses.push(`(
          vflok_health_system LIKE @search OR
          hs_bond_rating LIKE @search
        )`);
      }
      params.search = `%${search}%`;
    }

    Object.entries(filters).forEach(([field, value]) => {
      if (value && value !== 'all') {
        if (value === '(NA/Unknown)') {
          whereClauses.push(`(${field} IS NULL OR ${field} = '' OR ${field} = 'N/A')`);
        } else {
          whereClauses.push(`${field} = @${field}`);
          params[field] = value;
        }
      }
    });

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sqlQuery = `SELECT * FROM ${table} ${whereSQL}`;
    const records = query(sqlQuery, params);

    return {
      success: true,
      data: records
    };
  } catch (error) {
    console.error('Export CSV error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get all health systems
ipcMain.handle('db:get-all-health-systems', async () => {
  try {
    // Check if health_systems table exists
    const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='health_systems'");
    if (!tablesResult || tablesResult.length === 0) {
      return {
        success: true,
        data: []
      };
    }
    
    const sqlQuery = 'SELECT * FROM health_systems ORDER BY vflok_health_system';
    const records = query(sqlQuery);

    return {
      success: true,
      data: records
    };
  } catch (error) {
    console.error('Get all health systems error:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// ============================================================================
// AUTO-UPDATER
// ============================================================================

function setupAutoUpdater() {
  // Don't check for updates in development
  if (!app.isPackaged) {
    console.log('⚠️  Auto-updater disabled in development mode');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('🔍 Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('✨ Update available:', info.version);
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available!`,
      detail: 'Would you like to download and install it?',
      buttons: ['Download', 'Later'],
      defaultId: 0
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    console.log('✅ App is up to date');
  });

  autoUpdater.on('error', (err) => {
    console.error('❌ Update error:', err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const msg = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`;
    console.log(msg);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('✅ Update downloaded');
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. Restart to install?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  // Check for updates on startup (after 3 seconds)
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 3000);
}

// Manual update check
ipcMain.handle('app:check-for-updates', async () => {
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  }
  return { success: true };
});

// Get app version
ipcMain.handle('app:get-version', async () => {
  return { 
    success: true, 
    version: app.getVersion() 
  };
});

// ============================================================================
// APP LIFECYCLE
// ============================================================================

app.whenReady().then(async () => {
  console.log('🚀 vFlok Hospital Dashboard starting...');
  console.log(`📦 Version: ${app.getVersion()}`);
  console.log(`🏠 App path: ${app.getAppPath()}`);
  console.log(`💾 Using sql.js (pure JavaScript SQLite)`);
  
  // Initialize database
  const dbSuccess = await initializeDatabase();
  if (!dbSuccess) {
    app.quit();
    return;
  }

  // Create window
  createWindow();

  // Setup auto-updater
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (db) {
      db.close();
      console.log('✅ Database connection closed');
    }
    app.quit();
  }
});

app.on('before-quit', () => {
  if (db) {
    db.close();
    console.log('✅ Database connection closed');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  dialog.showErrorBox('Application Error', error.message);
});
