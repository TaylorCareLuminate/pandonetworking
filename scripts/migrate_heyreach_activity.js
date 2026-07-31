#!/usr/bin/env node
/**
 * migrate_heyreach_activity.js
 *
 * One-time backfill: reads every document from Firestore `heyreach_activity`
 * and inserts it into the Cloud SQL PostgreSQL table of the same name.
 *
 * Run from GCP Cloud Shell:
 *   npm install firebase-admin @google-cloud/cloud-sql-connector pg
 *   node migrate_heyreach_activity.js
 *
 * Safe to re-run — uses ON CONFLICT (firestore_doc_id) DO NOTHING.
 */

const admin    = require('firebase-admin');
const { Pool } = require('pg');

// ── Config ────────────────────────────────────────────────────────────────────
const PROJECT_ID              = 'clemail';
const CLOUD_SQL_INSTANCE      = 'clemail:us-central1:clemail-instance';
const DB_NAME                 = 'clemail-database';
const FIRESTORE_COLLECTION    = 'heyreach_activity';
const BATCH_SIZE              = 500;
// ─────────────────────────────────────────────────────────────────────────────

/** Convert a Firestore Timestamp, Date, or ISO string → ISO string for Postgres */
function toTs(val) {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  return null;
}

/** Map a Firestore document to a flat Postgres row */
function toRow(docId, d) {
  return {
    firestore_doc_id:       docId,
    event_type:             d.eventType             ?? null,
    timestamp:              toTs(d.timestamp),
    bdr_email:              d.bdrEmail              ?? d.accountEmail ?? '',
    account_email:          d.accountEmail          ?? null,
    account_name:           d.accountName           ?? null,
    linked_in_account_id:   d.linkedInAccountId != null ? String(d.linkedInAccountId) : null,
    lead_first_name:        d.leadFirstName         ?? d.contactFirstName  ?? d.firstName  ?? null,
    lead_last_name:         d.leadLastName          ?? d.contactLastName   ?? d.lastName   ?? null,
    lead_profile_url:       d.leadProfileUrl        ?? d.prospect_li_url   ?? null,
    lead_position:          d.leadPosition          ?? null,
    lead_company:           d.leadCompany           ?? null,
    lead_email:             d.leadEmail             ?? null,
    lead_linked_in_id:      d.leadLinkedInId        ?? null,
    campaign_id:            d.campaignId            ?? null,
    campaign_name:          d.campaignName          ?? null,
    connection_message:     d.connectionMessage     ?? null,
    message_text:           d.messageText           ?? null,
    inmail_body:            d.inmailBody            ?? null,
    source:                 d.source                ?? null,
    manually_logged:        d.manuallyLogged        ?? null,
    manually_logged_by:     d.manuallyLoggedBy      ?? null,
    manually_logged_at:     toTs(d.manuallyLoggedAt),
    source_connect_queue_id:d.sourceConnectQueueId  ?? null,
    raw_data:               d.rawData   ? JSON.stringify(d.rawData)   : null,
    event_data:             d.eventData ? JSON.stringify(d.eventData) : null,
  };
}

const INSERT_SQL = `
  INSERT INTO heyreach_activity (
    firestore_doc_id, event_type, timestamp, bdr_email,
    account_email, account_name, linked_in_account_id,
    lead_first_name, lead_last_name, lead_profile_url,
    lead_position, lead_company, lead_email, lead_linked_in_id,
    campaign_id, campaign_name, connection_message, message_text,
    inmail_body, source, manually_logged, manually_logged_by,
    manually_logged_at, source_connect_queue_id, raw_data, event_data
  ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
    $11,$12,$13,$14,$15,$16,$17,$18,
    $19,$20,$21,$22,$23,$24,$25,$26
  )
  ON CONFLICT (firestore_doc_id) DO NOTHING
`;

async function migrate() {
  // ── Firebase Admin (uses Cloud Shell's Application Default Credentials) ────
  admin.initializeApp({ projectId: PROJECT_ID });
  const fsDb = admin.firestore();

  // ── Cloud SQL connection ───────────────────────────────────────────────────
  // Uses Cloud SQL Auth Proxy running on localhost (start it first — see below).
  // Run in Cloud Shell:
  //   wget -O cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.linux.amd64
  //   chmod +x cloud-sql-proxy
  //   ./cloud-sql-proxy --port=5432 clemail:us-central1:clemail-instance &
  //   sleep 3
  //   PGPASSWORD=yourpassword node migrate_heyreach_activity.js
  const pool = new Pool({
    host:     process.env.PGHOST     || '127.0.0.1',
    port:     parseInt(process.env.PGPORT || '5432'),
    user:     process.env.PGUSER     || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: DB_NAME,
    ssl:      false,
  });

  // ── Ensure firestore_doc_id column exists (idempotency key) ───────────────
  await pool.query(`
    ALTER TABLE heyreach_activity
    ADD COLUMN IF NOT EXISTS firestore_doc_id TEXT UNIQUE
  `);
  console.log('✔  firestore_doc_id column ready');

  // ── Paginated Firestore read ───────────────────────────────────────────────
  let lastDoc     = null;
  let totalInserted = 0;
  let totalSkipped  = 0;
  let page          = 0;

  console.log(`Starting migration from Firestore collection "${FIRESTORE_COLLECTION}"…\n`);

  while (true) {
    let q = fsDb.collection(FIRESTORE_COLLECTION)
               .orderBy('__name__')
               .limit(BATCH_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    page++;
    let pageInserted = 0;
    let pageFailed   = 0;

    for (const doc of snap.docs) {
      const row = toRow(doc.id, doc.data());
      const vals = [
        row.firestore_doc_id, row.event_type, row.timestamp, row.bdr_email,
        row.account_email, row.account_name, row.linked_in_account_id,
        row.lead_first_name, row.lead_last_name, row.lead_profile_url,
        row.lead_position, row.lead_company, row.lead_email, row.lead_linked_in_id,
        row.campaign_id, row.campaign_name, row.connection_message, row.message_text,
        row.inmail_body, row.source, row.manually_logged, row.manually_logged_by,
        row.manually_logged_at, row.source_connect_queue_id, row.raw_data, row.event_data,
      ];

      try {
        const result = await pool.query(INSERT_SQL, vals);
        if (result.rowCount > 0) pageInserted++;
        else totalSkipped++;
      } catch (err) {
        console.error(`  ✗ doc ${doc.id}: ${err.message}`);
        pageFailed++;
      }
    }

    totalInserted += pageInserted;
    console.log(`Page ${page} (${snap.docs.length} docs): +${pageInserted} inserted, ${pageFailed} errors — running total: ${totalInserted}`);

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < BATCH_SIZE) break;
  }

  await pool.end();
  connector.close();

  console.log(`\n✅  Migration complete`);
  console.log(`   Inserted : ${totalInserted}`);
  console.log(`   Skipped  : ${totalSkipped}  (already existed — safe to ignore)`);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
