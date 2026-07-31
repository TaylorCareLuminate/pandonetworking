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
let hospitalColumns = new Set();

// ============================================================================
// DATABASE SETUP
// ============================================================================

async function initializeDatabase() {
  let dbPath;
  try {
    // Database path - in development vs production
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
          // In packaged builds we copy sql.js wasm to extraResources/sql.js
          return path.join(process.resourcesPath, 'sql.js', file);
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

    // Cache hospitals table column names for robust filter mapping.
    const columnInfo = query('PRAGMA table_info(hospitals)');
    hospitalColumns = new Set(columnInfo.map(c => c.name));
    console.log(`📊 Hospitals table columns detected: ${hospitalColumns.size}`);

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

// Execute query and return results as objects.
// sql.js supports named parameters natively with @name syntax —
// pass params as { '@name': value } so repeated references to the
// same parameter (e.g. @search appearing 5× in OR clauses) all
// receive the correct value without positional-index mismatches.
function query(sql, params = {}) {
  try {
    // Convert plain { key: value } to sql.js named-param format { '@key': value }
    const namedParams = {};
    Object.keys(params).forEach(key => {
      namedParams[`@${key}`] = params[key];
    });

    const result = db.exec(sql, namedParams);
    return resultsToObjects(result);
  } catch (error) {
    console.error('Query error:', error);
    console.error('SQL:', sql);
    console.error('Params:', params);
    throw error;
  }
}

function getExistingHospitalColumn(candidates) {
  for (const column of candidates) {
    if (hospitalColumns.has(column)) {
      return column;
    }
  }
  return null;
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
function addHospitalFilterClause(whereClauses, params, field, value) {
  if (!value || value === 'all') return;

  if (value === '(NA/Unknown)') {
    whereClauses.push(`(${field} IS NULL OR ${field} = '' OR ${field} = 'N/A')`);
    return;
  }

  if (field === 'ehr' || field === 'erp_system' || field === 'nurse_scheduling_system' ||
      field === 'nurse_scheduling_product' || field === 'time_attendance_system') {
    const paramKey = `${field}_contains`;
    whereClauses.push(`TRIM(${field}) LIKE @${paramKey}`);
    params[paramKey] = `%${value}%`;
    return;
  }

  if (field === 'gpo_filter') {
    const gpoColumn = getExistingHospitalColumn(['gpo_membership', 'gpo']);
    if (!gpoColumn) {
      return;
    }
    whereClauses.push(`${gpoColumn} = @gpo_filter`);
    params.gpo_filter = value;
    return;
  }

  if (field === 'magnet_filter') {
    if (value === 'yes') {
      whereClauses.push(`(is_magnet = 1 OR is_magnet = 'TRUE' OR (magnet_status IS NOT NULL AND magnet_status != '' AND magnet_status != 'Non-Magnet'))`);
    } else if (value === 'no') {
      whereClauses.push(`(is_magnet = 0 OR is_magnet = 'FALSE' OR magnet_status = 'Non-Magnet' OR magnet_status IS NULL OR magnet_status = '')`);
    }
    return;
  }

  if (field === 'pathway_filter') {
    if (value === 'yes') {
      whereClauses.push(`(pathway_to_excellence IS NOT NULL AND TRIM(pathway_to_excellence) != '')`);
    } else if (value === 'no') {
      whereClauses.push(`(pathway_to_excellence IS NULL OR TRIM(pathway_to_excellence) = '')`);
    }
    return;
  }

  if (field === 'best_place_filter') {
    if (value === 'yes') {
      whereClauses.push(`(great_places_to_work IS NOT NULL AND TRIM(great_places_to_work) != '')`);
    } else if (value === 'no') {
      whereClauses.push(`(great_places_to_work IS NULL OR TRIM(great_places_to_work) = '')`);
    }
    return;
  }

  if (field === 'leapfrog_filter') {
    if (value === 'yes') {
      whereClauses.push(`(leapfrog_top_rated IS NOT NULL AND TRIM(leapfrog_top_rated) != '')`);
    } else if (value === 'no') {
      whereClauses.push(`(leapfrog_top_rated IS NULL OR TRIM(leapfrog_top_rated) = '')`);
    }
    return;
  }

  if (field === 'innovation_filter') {
    const innovationColumn = getExistingHospitalColumn(['innovation_center_name', 'innovation_center_lead']);
    if (!innovationColumn) {
      return;
    }
    if (value === 'yes') {
      whereClauses.push(`(${innovationColumn} IS NOT NULL AND TRIM(${innovationColumn}) != '' AND TRIM(${innovationColumn}) != 'N/A')`);
    } else if (value === 'no') {
      whereClauses.push(`(${innovationColumn} IS NULL OR TRIM(${innovationColumn}) = '' OR TRIM(${innovationColumn}) = 'N/A')`);
    }
    return;
  }

  whereClauses.push(`TRIM(${field}) = @${field}`);
  params[field] = value;
}

ipcMain.handle('db:query-hospitals', async (event, options) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      search = '',
      filters = {},
      complexFilter = null,  // NEW: Support for complex filter builder
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

    // Simple filters (dropdown selections)
    Object.entries(filters).forEach(([field, value]) => {
      addHospitalFilterClause(whereClauses, params, field, value);
    });
    
    // Complex filter (from filter builder)
    if (hasComplexFilterNodes(complexFilter)) {
      const complexSQL = buildComplexFilterSQL(complexFilter, params);
      if (complexSQL) {
        whereClauses.push(`(${complexSQL})`);
      }
    }

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

// Build SQL for complex filter builder
function hasComplexFilterNodes(filter) {
  if (!filter) return false;
  const nodes = filter.conditions || filter.items || [];
  return Array.isArray(nodes) && nodes.length > 0;
}

function buildComplexFilterSQL(filter, params) {
  const nodes = filter?.conditions || filter?.items || [];
  if (!nodes.length) {
    return '';
  }
  
  const logic = filter.logic || 'AND';
  const clauses = [];
  
  nodes.forEach((condition, index) => {
    if (condition.type === 'group' && (condition.conditions || condition.items)) {
      // Nested group
      const nestedSQL = buildComplexFilterSQL(condition, params);
      if (nestedSQL) {
        clauses.push(`(${nestedSQL})`);
      }
    } else {
      // Simple condition
      const { field, operator, value } = condition;
      const paramKey = `filter_${field}_${index}`;
      
      let clause = '';
      const listValue = Array.isArray(value)
        ? value.map(v => String(v).trim()).filter(Boolean)
        : null;
      const scalarValue = listValue ? (listValue[0] ?? '') : value;

      // Special: magnet_designated TRUE/FALSE — read directly from magnet_status (no computed column needed)
      if (field === 'magnet_designated' && (operator === '==' || operator === 'equals' || operator === 'in')) {
        const vals = listValue || [scalarValue];
        const wantTrue  = vals.includes('TRUE');
        const wantFalse = vals.includes('FALSE');
        const isMagnet  = `(magnet_status IS NOT NULL AND TRIM(magnet_status) LIKE 'Magnet %')`;
        const notMagnet = `(magnet_status IS NULL OR TRIM(magnet_status) = '' OR TRIM(magnet_status) = 'Non-Magnet')`;
        if (wantTrue && wantFalse) return;
        if (wantTrue)  { clauses.push(isMagnet);  return; }
        if (wantFalse) { clauses.push(notMagnet); return; }
        return;
      }

      // Special: great_places_to_work and pathway_to_excellence use TRUE/FALSE options.
      // TRUE = has any non-null/non-empty/non-NA value; FALSE = null/empty/NA.
      if ((field === 'great_places_to_work' || field === 'pathway_to_excellence') &&
          (operator === '==' || operator === 'equals' || operator === 'in')) {
        const vals = listValue || [scalarValue];
        const wantTrue  = vals.includes('TRUE')  || vals.some(v => v.toUpperCase() === 'Y');
        const wantFalse = vals.includes('FALSE') || vals.includes('(NA/Unknown)');
        const hasVal = `(${field} IS NOT NULL AND TRIM(${field}) != '' AND UPPER(TRIM(${field})) != 'N/A' AND UPPER(TRIM(${field})) != '(NA/UNKNOWN)')`;
        const isNA  = `(${field} IS NULL OR TRIM(${field}) = '' OR UPPER(TRIM(${field})) = 'N/A' OR UPPER(TRIM(${field})) = '(NA/UNKNOWN)')`;
        if (wantTrue && wantFalse) { /* both selected — no filter */ return; }
        if (wantTrue)  clause = condition.includeNA ? `(${hasVal} OR ${isNA})` : hasVal;
        if (wantFalse) clause = isNA;
        if (clause) clauses.push(clause);
        return;
      }

      switch (operator) {
        case '==':
        case 'equals':
          if (listValue) {
            if (listValue.length === 1) {
              clause = `${field} = @${paramKey}`;
              params[paramKey] = scalarValue;
            } else if (listValue.length > 1) {
              const placeholders = listValue.map((_, i) => `@${paramKey}_${i}`);
              clause = `${field} IN (${placeholders.join(', ')})`;
              listValue.forEach((v, i) => {
                params[`${paramKey}_${i}`] = v;
              });
            }
          } else {
            clause = `${field} = @${paramKey}`;
            params[paramKey] = scalarValue;
          }
          break;
        case '!=':
        case 'not_equals':
          if (listValue) {
            if (listValue.length === 1) {
              clause = `${field} != @${paramKey}`;
              params[paramKey] = scalarValue;
            } else if (listValue.length > 1) {
              const placeholders = listValue.map((_, i) => `@${paramKey}_${i}`);
              clause = `${field} NOT IN (${placeholders.join(', ')})`;
              listValue.forEach((v, i) => {
                params[`${paramKey}_${i}`] = v;
              });
            }
          } else {
            clause = `${field} != @${paramKey}`;
            params[paramKey] = scalarValue;
          }
          break;
        case 'contains':
          clause = `${field} LIKE @${paramKey}`;
          params[paramKey] = `%${scalarValue}%`;
          break;
        case 'not_contains':
          clause = `${field} NOT LIKE @${paramKey}`;
          params[paramKey] = `%${scalarValue}%`;
          break;
        case 'starts_with':
          clause = `${field} LIKE @${paramKey}`;
          params[paramKey] = `${scalarValue}%`;
          break;
        case 'ends_with':
          clause = `${field} LIKE @${paramKey}`;
          params[paramKey] = `%${scalarValue}`;
          break;
        case '>':
        case 'greater_than':
          clause = `CAST(${field} AS REAL) > @${paramKey}`;
          params[paramKey] = parseFloat(scalarValue);
          break;
        case '<':
        case 'less_than':
          clause = `CAST(${field} AS REAL) < @${paramKey}`;
          params[paramKey] = parseFloat(scalarValue);
          break;
        case '>=':
        case 'greater_than_or_equal':
          clause = `CAST(${field} AS REAL) >= @${paramKey}`;
          params[paramKey] = parseFloat(scalarValue);
          break;
        case '<=':
        case 'less_than_or_equal':
          clause = `CAST(${field} AS REAL) <= @${paramKey}`;
          params[paramKey] = parseFloat(scalarValue);
          break;
        case 'in': {
          const list = Array.isArray(value) ? value : String(value).split(',').map(v => v.trim()).filter(Boolean);
          if (list.length > 0) {
            const placeholders = list.map((_, i) => `@${paramKey}_${i}`);
            clause = `${field} IN (${placeholders.join(', ')})`;
            list.forEach((v, i) => {
              params[`${paramKey}_${i}`] = v;
            });
          }
          break;
        }
        case 'not_in': {
          const list = Array.isArray(value) ? value : String(value).split(',').map(v => v.trim()).filter(Boolean);
          if (list.length > 0) {
            const placeholders = list.map((_, i) => `@${paramKey}_${i}`);
            clause = `${field} NOT IN (${placeholders.join(', ')})`;
            list.forEach((v, i) => {
              params[`${paramKey}_${i}`] = v;
            });
          }
          break;
        }
        case 'is_empty':
          clause = `(${field} IS NULL OR ${field} = '')`;
          break;
        case 'is_not_empty':
          clause = `(${field} IS NOT NULL AND ${field} != '')`;
          break;
        default:
          console.warn('Unknown operator:', operator);
      }
      
      if (clause && condition.includeNA) {
        clause = `(${clause} OR ${field} IS NULL OR ${field} = '' OR ${field} = 'N/A')`;
      }

      if (clause) {
        clauses.push(clause);
      }
    }
  });
  
  return clauses.join(` ${logic} `);
}

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
ipcMain.handle('db:get-stats', async (event, options = {}) => {
  try {
    const { filters = {}, search = '', complexFilter = null } = options;
    
    // Build WHERE clause (same as query-hospitals)
    const whereClauses = [];
    const params = {};

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

    Object.entries(filters).forEach(([field, value]) => {
      addHospitalFilterClause(whereClauses, params, field, value);
    });
    
    if (hasComplexFilterNodes(complexFilter)) {
      const complexSQL = buildComplexFilterSQL(complexFilter, params);
      if (complexSQL) {
        whereClauses.push(`(${complexSQL})`);
      }
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Calculate statistics on filtered data
    // Handle WHERE clause properly - if whereSQL is empty, start with WHERE, otherwise use AND
    const andOrWhere = whereSQL ? `${whereSQL} AND` : 'WHERE';
    
    const queries = {
      totalHospitals: `SELECT COUNT(*) as count FROM hospitals ${whereSQL}`,
      uniqueStates: `SELECT COUNT(DISTINCT hospital_state) as count FROM hospitals ${andOrWhere} hospital_state IS NOT NULL`,
      uniqueHealthSystems: `SELECT COUNT(DISTINCT vflok_health_system) as count FROM hospitals ${andOrWhere} vflok_health_system IS NOT NULL`,
      uniqueEHRs: `SELECT COUNT(DISTINCT ehr) as count FROM hospitals ${andOrWhere} ehr IS NOT NULL`,
      avgBeds: `SELECT AVG(CAST(hospital_beds AS REAL)) as avg FROM hospitals ${andOrWhere} hospital_beds IS NOT NULL`,
      totalBeds: `SELECT SUM(CAST(hospital_beds AS REAL)) as sum FROM hospitals ${andOrWhere} hospital_beds IS NOT NULL`,
      avgMargin: `SELECT AVG(CAST(hospital_operating_margin_pct AS REAL)) as avg FROM hospitals ${andOrWhere} hospital_operating_margin_pct IS NOT NULL`,
      totalRevenue: `SELECT SUM(CAST(hospital_revenue_millions AS REAL)) as sum FROM hospitals ${andOrWhere} hospital_revenue_millions IS NOT NULL`
    };

    const stats = {};
    for (const [key, sql] of Object.entries(queries)) {
      const result = query(sql, params);
      if (key === 'avgBeds') {
        stats[key] = Math.round(result[0]?.avg || 0);
      } else if (key === 'totalBeds' || key === 'totalRevenue') {
        stats[key] = Math.round(result[0]?.sum || 0);
      } else if (key === 'avgMargin') {
        const v = result[0]?.avg;
        stats[key] = (v !== null && v !== undefined && !isNaN(v)) ? v : null;
      } else {
        stats[key] = result[0]?.count || 0;
      }
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
    const { filters = {}, search = '', table = 'hospitals', complexFilter = null } = options;

    // Build WHERE clause using the same robust pipeline as query-hospitals
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

    if (table === 'hospitals') {
      Object.entries(filters).forEach(([field, value]) => {
        addHospitalFilterClause(whereClauses, params, field, value);
      });
    } else {
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
    }

    if (hasComplexFilterNodes(complexFilter)) {
      const complexSQL = buildComplexFilterSQL(complexFilter, params);
      if (complexSQL) {
        whereClauses.push(`(${complexSQL})`);
      }
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const sqlQuery = `SELECT * FROM ${table} ${whereSQL} ORDER BY ${table === 'health_systems' ? 'vflok_health_system' : 'hospital_name'}`;
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

// Query health systems with filtering/pagination
ipcMain.handle('db:query-health-systems', async (event, options) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      search = '',
      filters = {},
      complexFilter = null,
      sortBy = 'vflok_health_system',
      sortDirection = 'ASC'
    } = options;

    // Check if table exists
    const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='health_systems'");
    if (!tablesResult || tablesResult.length === 0) {
      return {
        success: true,
        data: [],
        totalRecords: 0,
        totalPages: 0,
        currentPage: 1
      };
    }

    // Build WHERE clause
    const whereClauses = [];
    const params = {};

    if (search) {
      whereClauses.push(`(
        vflok_health_system LIKE @search OR
        hs_bond_rating LIKE @search
      )`);
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
    
    if (hasComplexFilterNodes(complexFilter)) {
      const complexSQL = buildComplexFilterSQL(complexFilter, params);
      if (complexSQL) {
        whereClauses.push(`(${complexSQL})`);
      }
    }

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM health_systems ${whereSQL}`;
    const countResults = query(countQuery, params);
    const totalRecords = countResults[0]?.count || 0;

    // Get paginated results
    const offset = (page - 1) * pageSize;
    const dataQuery = `
      SELECT * FROM health_systems 
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
    console.error('Query health systems error:', error);
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

  // Default-off in distributed client builds unless explicitly enabled.
  // This avoids startup errors when publish URL/cert isn't configured yet.
  if (process.env.VFLOK_ENABLE_UPDATER !== 'true') {
    console.log('⚠️  Auto-updater disabled (set VFLOK_ENABLE_UPDATER=true to enable)');
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

// ─── Contacts: query ──────────────────────────────────────────────────────────
ipcMain.handle('db:query-contacts', async (event, options = {}) => {
  try {
    const { search = '', jobLevel = 'all', clinicalDomain = 'all',
            healthSystem = '', page = 1, pageSize = 50 } = options;

    const params = {};
    const where = [];

    if (search && search.trim()) {
      params['s'] = `%${search.trim()}%`;
      where.push(`(
        first_name  LIKE @s OR last_name   LIKE @s OR
        current_title LIKE @s OR current_company LIKE @s OR
        vflok_health_system LIKE @s OR location LIKE @s
      )`);
    }

    if (jobLevel && jobLevel !== 'all') {
      params['jl'] = jobLevel;
      where.push(`UPPER(TRIM(job_level)) = UPPER(@jl)`);
    }

    if (clinicalDomain && clinicalDomain !== 'all') {
      params['cd'] = clinicalDomain;
      where.push(`UPPER(TRIM(clinical_domain)) = UPPER(@cd)`);
    }

    if (healthSystem && healthSystem.trim()) {
      params['hs'] = `%${healthSystem.trim()}%`;
      where.push(`(vflok_health_system LIKE @hs OR current_company LIKE @hs)`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset   = (page - 1) * pageSize;

    const countSQL = `SELECT COUNT(*) AS total FROM contacts ${whereSQL}`;
    const dataSQL  = `
      SELECT first_name, last_name, linkedin_url, current_title, headline,
             current_company, vflok_health_system, location, job_level,
             clinical_domain, about, experience_paragraph, education_paragraph,
             open_profile, premium
      FROM contacts ${whereSQL}
      ORDER BY last_name ASC, first_name ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    const countRes = query(countSQL, params);
    const total    = countRes?.[0]?.total ?? 0;

    const contacts = query(dataSQL, params);

    return { success: true, contacts, total, page, pageSize };
  } catch (err) {
    console.error('db:query-contacts error:', err);
    return { success: false, error: err.message, contacts: [], total: 0 };
  }
});

// ─── Contacts: stats ──────────────────────────────────────────────────────────
ipcMain.handle('db:get-contact-stats', async (event, options = {}) => {
  try {
    const { search = '', jobLevel = 'all', clinicalDomain = 'all',
            healthSystem = '' } = options;

    const params = {};
    const where  = [];

    if (search && search.trim()) {
      params['s'] = `%${search.trim()}%`;
      where.push(`(first_name LIKE @s OR last_name LIKE @s OR current_title LIKE @s OR current_company LIKE @s OR vflok_health_system LIKE @s OR location LIKE @s)`);
    }
    if (jobLevel && jobLevel !== 'all') {
      params['jl'] = jobLevel;
      where.push(`UPPER(TRIM(job_level)) = UPPER(@jl)`);
    }
    if (clinicalDomain && clinicalDomain !== 'all') {
      params['cd'] = clinicalDomain;
      where.push(`UPPER(TRIM(clinical_domain)) = UPPER(@cd)`);
    }
    if (healthSystem && healthSystem.trim()) {
      params['hs'] = `%${healthSystem.trim()}%`;
      where.push(`(vflok_health_system LIKE @hs OR current_company LIKE @hs)`);
    }

    const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const r = q => { const res = query(q, params); return res?.[0] ? Object.values(res[0])[0] ?? 0 : 0; };
    const andOr = whereSQL ? 'AND' : 'WHERE';

    const total      = r(`SELECT COUNT(*) FROM contacts ${whereSQL}`);
    const uniqueHS   = r(`SELECT COUNT(DISTINCT vflok_health_system) FROM contacts ${whereSQL} ${andOr} vflok_health_system IS NOT NULL AND TRIM(vflok_health_system) != ''`);
    const executives = r(`SELECT COUNT(*) FROM contacts ${whereSQL} ${andOr} UPPER(TRIM(job_level)) = 'EXECUTIVE'`);
    const directors  = r(`SELECT COUNT(*) FROM contacts ${whereSQL} ${andOr} UPPER(TRIM(job_level)) = 'DIRECTOR'`);

    return { success: true, total, uniqueHS, executives, directors };
  } catch (err) {
    console.error('db:get-contact-stats error:', err);
    return { success: false, error: err.message, total: 0, uniqueHS: 0, executives: 0, directors: 0 };
  }
});

// ─── Computed HS distributions (fields not stored in health_systems table) ───
ipcMain.handle('db:get-computed-hs-distributions', async () => {
  try {
    // msa_census_bureau distribution — group hospitals by HS then by MSA region
    const msaRows = query(`
      SELECT vflok_health_system, msa_census_bureau, COUNT(*) AS n
      FROM hospitals
      WHERE vflok_health_system IS NOT NULL AND TRIM(vflok_health_system) != ''
        AND msa_census_bureau IS NOT NULL AND TRIM(msa_census_bureau) != ''
      GROUP BY vflok_health_system, msa_census_bureau
    `);

    // hospital_state distribution — group hospitals by HS then by state
    const stateRows = query(`
      SELECT vflok_health_system, hospital_state, COUNT(*) AS n
      FROM hospitals
      WHERE vflok_health_system IS NOT NULL AND TRIM(vflok_health_system) != ''
        AND hospital_state IS NOT NULL AND TRIM(hospital_state) != ''
      GROUP BY vflok_health_system, hospital_state
    `);

    // Build distribution strings { hsName: "Cat1: 33.3%, Cat2: 66.7%" }
    function buildDistMap(rows, groupKey, catKey) {
      const totals = {};
      const counts = {};
      rows.forEach(r => {
        const hs = r[groupKey];
        totals[hs] = (totals[hs] || 0) + r.n;
        if (!counts[hs]) counts[hs] = {};
        counts[hs][r[catKey]] = r.n;
      });
      const result = {};
      Object.keys(counts).forEach(hs => {
        const total = totals[hs];
        const parts = Object.entries(counts[hs])
          .sort((a, b) => b[1] - a[1])
          .map(([cat, n]) => `${cat}: ${((n / total) * 100).toFixed(1)}%`);
        result[hs] = parts.join(', ');
      });
      return result;
    }

    return {
      success: true,
      msa_census_bureau_distribution: buildDistMap(msaRows, 'vflok_health_system', 'msa_census_bureau'),
      hospital_state_distribution:    buildDistMap(stateRows, 'vflok_health_system', 'hospital_state'),
    };
  } catch (err) {
    console.error('db:get-computed-hs-distributions error:', err);
    return { success: false, msa_census_bureau_distribution: {}, hospital_state_distribution: {} };
  }
});

// ─── Contacts: get set of health system names that have contacts ──────────────
ipcMain.handle('db:get-hs-with-contacts', async () => {
  try {
    const tablesCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='contacts'");
    if (!tablesCheck || tablesCheck.length === 0) return { success: true, hsNames: [] };
    const rows = query(
      `SELECT DISTINCT vflok_health_system FROM contacts
       WHERE vflok_health_system IS NOT NULL AND TRIM(vflok_health_system) != ''`
    );
    const hsNames = rows.map(r => r.vflok_health_system);
    return { success: true, hsNames };
  } catch (err) {
    console.error('db:get-hs-with-contacts error:', err);
    return { success: true, hsNames: [] };
  }
});

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
