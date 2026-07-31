#!/usr/bin/env node
/**
 * migrate_heyreach_v2.js  —  Fast version
 *
 * Optimizations over v1:
 *  1. Loads all existing firestore_doc_ids into a Set at startup
 *     → skips Postgres entirely for already-migrated pages (pure memory check)
 *  2. Bulk INSERT (up to 100 rows per query) instead of one INSERT per doc
 *  3. Reports estimated time to completion
 *
 * Run from GCP Cloud Shell (proxy must already be running):
 *   PGUSER=postgres PGPASSWORD=yourpassword node migrate_heyreach_v2.js
 */

const admin    = require('firebase-admin');
const { Pool } = require('pg');

const PROJECT_ID           = 'clemail';
const DB_NAME              = 'clemail-database';
const FIRESTORE_COLLECTION = 'heyreach_activity';
const FIRESTORE_BATCH      = 500;   // Firestore page size
const INSERT_BATCH         = 100;   // rows per bulk INSERT

function toTs(val) {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  return null;
}

function toRow(docId, d) {
  return {
    firestore_doc_id:        docId,
    event_type:              d.eventType             ?? null,
    timestamp:               toTs(d.timestamp),
    bdr_email:               d.bdrEmail              ?? d.accountEmail ?? '',
    account_email:           d.accountEmail          ?? null,
    account_name:            d.accountName           ?? null,
    linked_in_account_id:    d.linkedInAccountId != null ? String(d.linkedInAccountId) : null,
    lead_first_name:         d.leadFirstName         ?? d.contactFirstName ?? d.firstName  ?? null,
    lead_last_name:          d.leadLastName          ?? d.contactLastName  ?? d.lastName   ?? null,
    lead_profile_url:        d.leadProfileUrl        ?? d.prospect_li_url  ?? null,
    lead_position:           d.leadPosition          ?? null,
    lead_company:            d.leadCompany           ?? null,
    lead_email:              d.leadEmail             ?? null,
    lead_linked_in_id:       d.leadLinkedInId        ?? null,
    campaign_id:             d.campaignId            ?? null,
    campaign_name:           d.campaignName          ?? null,
    connection_message:      d.connectionMessage     ?? null,
    message_text:            d.messageText           ?? null,
    inmail_body:             d.inmailBody            ?? null,
    source:                  d.source                ?? null,
    manually_logged:         d.manuallyLogged        ?? null,
    manually_logged_by:      d.manuallyLoggedBy      ?? null,
    manually_logged_at:      toTs(d.manuallyLoggedAt),
    source_connect_queue_id: d.sourceConnectQueueId  ?? null,
    raw_data:                d.rawData   ? JSON.stringify(d.rawData)   : null,
    event_data:              d.eventData ? JSON.stringify(d.eventData) : null,
  };
}

const COLUMNS = [
  'firestore_doc_id','event_type','timestamp','bdr_email',
  'account_email','account_name','linked_in_account_id',
  'lead_first_name','lead_last_name','lead_profile_url',
  'lead_position','lead_company','lead_email','lead_linked_in_id',
  'campaign_id','campaign_name','connection_message','message_text',
  'inmail_body','source','manually_logged','manually_logged_by',
  'manually_logged_at','source_connect_queue_id','raw_data','event_data',
];

async function bulkInsert(pool, rows) {
  if (rows.length === 0) return 0;
  const placeholders = [];
  const values = [];
  let idx = 1;
  for (const row of rows) {
    const rowPlaceholders = COLUMNS.map(() => `$${idx++}`);
    placeholders.push(`(${rowPlaceholders.join(',')})`);
    for (const col of COLUMNS) values.push(row[col] ?? null);
  }
  const sql = `
    INSERT INTO heyreach_activity (${COLUMNS.join(',')})
    VALUES ${placeholders.join(',')}
    ON CONFLICT (firestore_doc_id) DO NOTHING
  `;
  const result = await pool.query(sql, values);
  return result.rowCount;
}

async function migrate() {
  admin.initializeApp({ projectId: PROJECT_ID });
  const fsDb = admin.firestore();

  const pool = new Pool({
    host:     process.env.PGHOST     || '127.0.0.1',
    port:     parseInt(process.env.PGPORT || '5432'),
    user:     process.env.PGUSER     || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: DB_NAME,
    ssl:      false,
    max:      5,
  });

  // ── Ensure schema is ready ────────────────────────────────────────────────
  await pool.query(`
    ALTER TABLE heyreach_activity
    ADD COLUMN IF NOT EXISTS firestore_doc_id TEXT UNIQUE
  `);
  await pool.query(`
    ALTER TABLE heyreach_activity
    ALTER COLUMN timestamp DROP NOT NULL
  `);
  console.log('✔  Schema ready');

  // ── Load all existing IDs into memory ─────────────────────────────────────
  console.log('Loading existing Postgres IDs into memory…');
  const { rows: existingRows } = await pool.query(
    'SELECT firestore_doc_id FROM heyreach_activity WHERE firestore_doc_id IS NOT NULL'
  );
  const existingIds = new Set(existingRows.map(r => r.firestore_doc_id));
  console.log(`✔  ${existingIds.size.toLocaleString()} existing rows loaded`);

  // ── Paginate Firestore ────────────────────────────────────────────────────
  let lastDoc        = null;
  let page           = 0;
  let totalInserted  = 0;
  let totalSkipped   = 0;
  let pagesSkipped   = 0;
  const startTime    = Date.now();

  console.log(`\nStarting migration from "${FIRESTORE_COLLECTION}"…\n`);

  while (true) {
    let q = fsDb.collection(FIRESTORE_COLLECTION)
               .orderBy('__name__')
               .limit(FIRESTORE_BATCH);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;
    page++;

    // Check if ALL docs on this page are already in Postgres (memory-only check)
    const newDocs = snap.docs.filter(d => !existingIds.has(d.id));

    if (newDocs.length === 0) {
      pagesSkipped++;
      // Print progress every 50 skipped pages
      if (pagesSkipped % 50 === 0) {
        console.log(`  … skipping page ${page} (${pagesSkipped} pages skipped so far)`);
      }
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < FIRESTORE_BATCH) break;
      continue;
    }

    // Bulk insert new docs in batches of INSERT_BATCH
    const rows = newDocs.map(d => toRow(d.id, d.data()));
    let pageInserted = 0;
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH);
      try {
        pageInserted += await bulkInsert(pool, batch);
      } catch (err) {
        console.error(`  ✗ bulk insert error (${batch.length} rows): ${err.message}`);
      }
    }

    totalInserted += pageInserted;
    totalSkipped  += (snap.docs.length - newDocs.length);

    const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
    console.log(
      `Page ${page} | +${pageInserted} inserted, ${snap.docs.length - newDocs.length} skipped` +
      ` | total: ${totalInserted.toLocaleString()} | elapsed: ${elapsedMin}m`
    );

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < FIRESTORE_BATCH) break;
  }

  await pool.end();
  console.log(`\n✅  Migration complete`);
  console.log(`   Inserted : ${totalInserted.toLocaleString()}`);
  console.log(`   Skipped  : ${totalSkipped.toLocaleString()}  (already in Postgres)`);
  console.log(`   Pages    : ${page} Firestore pages read`);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
