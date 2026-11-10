# Unipile Migration: page, route and job inventory

Companion to [`UNIPILE_MIGRATION_PLAN.md`](UNIPILE_MIGRATION_PLAN.md). Plan only, nothing built. Written 2026-11-09 and revised the same day (new pages in 5b, the analysis export note in section 4, new jobs in section 7).

This lists everything that touches HeyReach and what happens to it. Section references such as "plan 6.1" point into the main plan.

**How this list was made.** I searched every `.html` and `.js` file in `pandonetworking` for "heyreach" (183 files) and sorted them by which backend endpoints and Firestore collections each one references. The pages named in the migration request and the main send paths were read properly. The rest are classified by pattern match, so treat each row as a checklist item to confirm when the page is opened, not as a finding. A page can be in a higher tier than it deserves if it merely contains a matching string.

| Tier | Meaning | Files | When it must change |
|---|---|---|---|
| A | Causes something to be sent | 37 | Before the first client whose users rely on that page is moved |
| B | Controls HeyReach (campaigns, pause, account linking) | 18 | Before the first client moves, or retired |
| C | Calls HeyReach live to read something | 27 | Shows stale or empty data for migrated accounts until changed |
| D | Reads our own Firestore copies only | 84 | No change at cutover; works through the compatible events (plan 12.2) |
| E | Mentions HeyReach in text only | 17 | Wording, at leisure |

A second copy of the site exists at `c:\repos\HealthLuminateSiteFromLocal` (149 files mention HeyReach, including its own `connect_push.html`, `fast_connect_review.html`, `sent_messages.html`, `index_admin.html`, `company_review_replies.html`). It is not inventoried here.

---

## 1. Tier A: pages that cause a send (37)

Every one of these ends up calling the same new backend function (plan 6.1), which routes by the account's `provider`. None of them calls Unipile directly and none writes the sent record.

### 1.1 Queue approval and push

| Page | Today | After |
|---|---|---|
| `connect/fast_connect_review.html` | Main Queue 1 approval. Four exits: campaign (auto-push later), direct slot (`linkedin_message_queue`), immediate Quick Message (`/api/mass-messages/add-lead`), reserve. Writes `connect_activity` from the browser (line 14842). | Approval sets `approved`; the backend enqueues. All four exits become one enqueue with a priority. The browser write is removed. |
| `connect/connect_push.html` | "Push Now" runs `/api/connect-queue/ai-review` then `/auto-push`. Three calls to `/api/connect-queue/push-single`, which has no backend route. | "Push Now" becomes "Queue now". Shows planned send time per item. The dead `push-single` calls are replaced with the enqueue endpoint. |
| `connect/mistake_queue.html` | Shows `reviewStatus: 'mistake_queue'` items. Two calls to the missing `push-single`. | Becomes the home for all `held` outbox items with the hold reason and the AI's explanation (plan 9). Release, edit or cancel. |
| `connect/generate_messages.html` | Generates and can queue to `linkedin_message_queue`. | Enqueue endpoint. |
| `connect/reserve_queue.html`, `connect/requests_for_connections.html` | Reserve queue management and top-up into HeyReach. | The reserve existed to keep HeyReach campaigns fed. With our own outbox it becomes a view of what is queued but not yet planned. Likely retired; confirm with the people who use it. |
| `connect/repurpose_messages.html`, `connect/bdr_identity_repair.html` | Move or re-push queue items. | Re-point to outbox operations. Must respect send locks: a repurposed message to a person already contacted is held. |

### 1.2 Immediate sends

| Page | Today | After |
|---|---|---|
| `connect/quick_outreach.html` | Adds a lead to the Quick Message campaign (connected? send now). | Enqueue with `priority: immediate`. Skips timing only. Caps, locks, hard checks and the AI gate still apply. The page shows "sent" or the hold reason within seconds. |
| `connect/mass_messages_to_connections.html` | Bulk messages to existing connections through Quick Message. | Enqueue as `scheduled` by default. A bulk send is exactly what the daily cap and random spacing are for; it should not go out as a burst. |
| `connect/current_connections_fast_outreach.html` | Same pattern, plus `linkedin_message_queue`. | Same. |
| `connect/delayed_replies_send.html`, `connect/fast_message_speedup.html` | Send or accelerate pending messages. | "Send sooner" becomes a re-plan of the outbox item. |
| `connect/bdr_send_audit.html` | Audits and re-sends; writes `connect_activity` from the browser (lines 1046, 1244). | Read from the ledger. Re-send goes through the enqueue endpoint and will be blocked by locks unless a person releases one. Browser writes removed. |
| `connect/linkedin_campaign_followup.html` | Follow-up campaigns; writes `connect_activity` from the browser (lines 1651, 1778). | Enqueue endpoint. Browser writes removed. |
| `connect/linkedin_message_slots.html` | Schedules messages into time slots in `linkedin_message_queue`. | The planner replaces manual slots. Keep the page as a way to pin a specific time on an item if that is still wanted. |
| `connect/personal_messages.html`, `connect/conversation_lookup.html` | Send a one-off message in a conversation. | Reply endpoint (plan 10.4). |

### 1.3 Replies

| Page | Today | After |
|---|---|---|
| `connect/index_admin.html` | Polls `/api/linkedin-reply-alerts/scan` every 5 minutes; replies through `/heyreach/inbox/send-message`; AI drafts through `/api/ai-profile-eval`. | Same layout. Alerts come from the same `linkedin_reply_alerts` collection, now fed by Unipile events. Send button calls `/api/linkedin/reply`. |
| `connect/company_review_replies.html` | Merges `heyreach_inbox` with webhook events; uses `check-conversation`, `add-sent-message`, `update-conversation-category`. | Reads the same mirrored collections. `add-sent-message` is no longer needed because the engine records every reply. `check-conversation` is no longer needed because Unipile events carry the chat id. Categories unchanged. |
| `connect/review_replies.html`, `kba/dereks_linkedin_reply.html` | Variants of the above. | Same change. |
| `crm/heyreach_inbox.html`, `crm/heyreach_inbox_combined.html`, `crm/followup.html`, `crm/worklist.html`, `crm/company-comms-scan.html` | The older CRM inbox and follow-up path. | Decide whether the CRM path is still used. If yes, same reply endpoint. If no, retire. |

### 1.4 Editing in flight

| Page | Today | After |
|---|---|---|
| `connect/sent_messages.html` | Lists from `connect_activity`; "confirmed sent" from `heyreach_activity`; live status through `js/heyreach-live-status.js`; edit pushes to HeyReach via `/api/connect-queue/sync-in-process-to-heyreach`. | Lists from the outbox and ledger. Edit, cancel, send sooner and hold are single outbox operations (plan 13.1). Shows planned time. Live status comes from our own data. |
| `connect/edit_in_process_messages.html`, `connect/edit_quick_message_in_process.html`, `connect/lead_pause_manager.html` | Edit or pause leads inside HeyReach campaigns. | Fold into `sent_messages.html` behaviour; pausing a lead is cancelling or holding its outbox item. |

### 1.5 Other

| Page | Note |
|---|---|
| `connect/heyreach_sync_audit.html` | Compares our records with HeyReach. Replace with the nightly ledger audit (plan 13.3). |
| `connect/heyreach_content_update_TEST.html`, `crm/test-heyreach-custom-variables.html` | Test pages that can send. Remove. |
| `crm/linkedin_manager.html`, `crm/heyreach_cleanup.html` | Legacy CRM path (`linkedin_activities`, `/heyreach/process-now`). Retire unless in use. |
| `railway-backend/linkedin-queue-processor.js` | Example code in this repo, not the deployed backend. Delete to avoid confusion. |

---

## 2. Tier B: pages that control HeyReach (18)

| Page | Today | After |
|---|---|---|
| `admin/email_controls.html` | LinkedIn tab: create account record, link HeyReach account, "Audit & Fix", "Easy Enroll", daily limits. | Add "Connect with Unipile", provider badge, connection status, tier, caps (the single place limits live), warm-up state, and the per-account cutover state (linked, draining, live). HeyReach controls remain for accounts not yet moved. |
| `public/linkedin_connect.html` | Client-facing login form (email, password, PIN) relayed to HeyReach. | Decided: stays as our branded page and becomes the launch point for Unipile's hosted login (plan 11.1). The email, password and PIN fields go away. |
| `connect/linkedin_account_setup.html` (Tier D by pattern, listed here by function) | Creates the invite link for the client. | Same page, generates the Unipile link. |
| `connect/outreach_stop_button.html` | Pause and resume by BDR or company. | Same buttons. Endpoints set the same flags and, for HeyReach accounts, still pause campaigns. Add "pause everything". |
| `admin/heyreach_campaign_builder.html`, `js/heyreach-campaigns.js` | Build the three campaigns per BDR. | Not needed for Unipile accounts. Retire in phase 5. |
| `admin/fix_campaign_ids.html`, `admin/test_heyreach_manual.html`, `connect/temp_heyreach_queue_debug.html` | Campaign repair and debugging. | Retire in phase 5. |
| `connect/metrics_reconciliation.html`, `connect/prospect_organizations_admin.html` | Reconciliation and admin views that also touch the reserve queue. | Re-point to ledger and outbox. |
| `crm/campaigns_enhanced.html`, `crm/campaign_schedule.html`, `crm/heyreach_campaigns.html`, `crm/heyreach_resume.html`, `crm/heyreach_connection_check.html`, `crm/billing_dashboard.html`, `crm/campaign-org-explorer.html` | CRM-side campaign controls. | Retire with the CRM HeyReach path, or confirm which are still used. |
| `functions/index.js` | `reserveQueueDailyTopUp` (6 AM MT weekdays, cap 35) and `nightlyClientDashboardCalc` (billing from `heyreach_activity`). | Top-up must skip Unipile accounts from phase 0. Billing calc keeps working through the mirror, then moves to the ledger. |
| `jobs/heyreach-auto-resume.js` | Resumes campaigns; documented as run by Windows Task Scheduler. Status unknown. | Find out whether it is still scheduled anywhere. If so it must be stopped or taught to skip Unipile accounts before any cutover. |

---

## 3. Tier C: pages that read HeyReach live (27)

These call the backend's HeyReach proxy or status endpoints to show current state. For a migrated account they will show nothing or stale data until pointed at our own records. None of them can cause a send.

| Page | What it reads live | After |
|---|---|---|
| `js/heyreach-live-status.js` | Per-lead status in a campaign. Used by `sent_messages.html` and others. | Replace with an outbox and ledger status lookup with the same function signature, so pages that include it need no change. |
| `connect/in_processes_today.html` | Leads currently inside HeyReach sequences. | The outbox is the "in process" list. Still needed for HeyReach accounts during draining (plan 14.3 step 6). |
| `connect/message_history.html`, `connect/outcomes.html`, `demos/outcomes.html`, `connect/ab_outcomes_comparison.html`, `connect/catch_meetings.html`, `connect/interested_to_meet.html`, `connect/review_replies2.html` | Conversation or outcome lookups. | Read mirrored conversations. |
| `connect/prospect_organizations.html`, `connect/manage_organization_contacts.html`, `connect/contact_universe_search.html`, `connect/connect_hypothesis_documentation.html`, `connect/test_profile_search.html` | Contact and connection lookups. | Read `linkedin_relations` mirror. Profile search can use Unipile lookup, within the daily lookup budget. |
| `admin/connection_troubleshooter.html` | Diagnoses a BDR's HeyReach link. | Add Unipile account status and last webhook time. |
| `crm/heyreach_activity.html`, `crm/heyreach_allcontacts.html`, `crm/heyreach_leads.html`, `crm/heyreach_remove.html`, `crm/heyreach_sync.html`, `crm/outcomes.html` | CRM views of HeyReach data. | Retire or re-point. |
| `crm/debug-heyreach.html`, `crm/linkedinconnect_heyreach_test.html`, `crm/test-heyreach-complete.html`, `crm/test-heyreach-lists.html`, `crm/test-heyreach-simple.html` | Test pages. | Remove in phase 5. |

---

## 4. Tier D: pages that read our own data (84)

These read `heyreach_activity` (75 files in total across all tiers), `heyreach_inbox` (70), `heyreach_contacts`, `connect_activity`, or `connect_queue.pushed_to_heyreach` (50). They keep working without changes as long as the engine writes the compatible records described in plan 12.2. That is the reason for the compatibility layer.

The ones where a mistake would be visible to a client or cost money, and which should be checked by hand after the first migrated account has a week of data:

| Page or job | Why it matters |
|---|---|
| `connect/cost_revenue_tracking.html`, `connect/monthly_cost_overview.html`, `functions/index.js` `nightlyClientDashboardCalc` | Billing. $1.60 per send event, $1.00 per acceptance, counted from `heyreach_activity`. |
| `everex/client-portal.html`, `everex/client-portal2.html`, `idville/client-portal.html`, `mentavi/client-portal.html`, `neurocast/client-portal.html`, `outcomemd/client-portal.html` | Clients look at these. |
| `connect/index.html`, `connect/company_performance.html`, `connect/company_results.html`, `connect/overall_trends.html`, `connect/email_summary.html` | Main dashboards and the summary email. |
| `connect/analysis_data.html` | Builds the export the timing analysis is computed from. Its send-time field (`first_outreach_sent_at`, around lines 2250 to 2255) uses the inbox thread time for people who accepted and the approval time for everyone else, which makes the day and time tables unreliable (plan 7.1). Fix now: use `CONNECTION_REQUEST_SENT` event times. Later: read the ledger for Unipile accounts. |
| `connect/variation-performance.js`, `connect/message_hypothesis_lab.html`, `connect/analysis_results.html` | Hypothesis and timing analysis. Depend on the R batch seeing migrated sends (plan 12.4). The "best time to send" cards on `analysis_results.html` should carry a warning, or be hidden, until the export is fixed. |
| `connect/message-filter-logic.js` | The 75-day "already contacted" filter (documented as 45 days). Must read the ledger as well, and use the shared URL normalizer. |
| `connect/already_connected_audit.html`, `connect/duplicate_message_check.html`, `connect/johns_dup_check.html`, `connect/internet_news_duplicate_messages.html`, `connect/test_duplicate_send.html` | Existing duplicate audits. Useful as independent checks on the engine during the pilot. |
| `connect/manual_log_heyreach.html` | Writes `heyreach_activity` from the browser (line 1165) to log sends made by hand. Replace with a backend "record manual send" call that writes the ledger, so manual sends also create locks. |
| `connect/heyreach_webhook_activity.html` | Raw event viewer. Add a provider column; a twin for `unipile_events` is the first debugging tool to build. |
| `connect/message_audit_trail.html`, `connect/export_outreach_history.html` | Per-message history and export. Should become ledger-first early, since they are how questions about "what did we send this person" get answered. |

The remaining Tier D files, unchanged at cutover:

`admin/quick_add_linkedin_account.html`; `connect/`: `about_me_message_lookup`, `backfill_lead_urls`, `bdr_shared_contact_comparison`, `conference-scheduling.js`, `connect_review`, `connect_review_bobby`, `connect_review_old`, `contact_data_cleanup`, `contact_diagnostic`, `contact_release_planner`, `demo_dashboard`, `demo_review_replies`, `edit_pending_messages`, `filtered_messages`, `fix_invalid_account_ids`, `fix_my_account_ids`, `followup_needed`, `full_pipeline`, `full_pipeline_dashboard`, `harvest_pool_admin`, `healthconnect-header.js`, `hypothesis_target_rules`, `linkedin_followups`, `manage_my_linkedin_data`, `monthly_research_plan`, `my_leads`, `outbound_approvals`, `process_exclusions`, `profile_enrichment`, `prospect_cleanup`, `prospect_contacts`, `queue_diagnostics`, `queue1_cleanup`, `quick_message_bulk_delete`, `quick_message_cleanup`, `recover_orphaned_messages`, `reply_response_times`, `scan_conversations`, `scheduled_debug`, `stale_queue_cleanup`, `today_check`; `crm/`: `home`, `install-tracking-helper`, `js/analytics-dashboard.js`, `js/analytics-dashboard2.js`, `my_leads`, `page-usage-analytics`, `ppc_manual_scheduler`, `reporting`; `js/`: `clemail-api.js`, `clemail-firestore-wrapper.js`, `contact-fields.js`; `railway-backend/`: `ai-review-route.js`, `full-ai-generate-route.js`; `scripts/`: `migrate_heyreach_activity.js`, `migrate_heyreach_v2.js`.

Three of those deserve a note: `queue1_cleanup`, `stale_queue_cleanup` and `quick_message_cleanup` delete or expire queue items. Once an outbox exists, a cleanup that removes a `connect_queue` item must also cancel its outbox item, or the engine will send something a person thought they deleted.

---

## 5. Tier E: text only (17)

`admin/oauth_email_connections.html`, `connect/auto_bdr_connections.html`, `connect/bdr_review_settings.html`, `connect/contact_coverage_analytics.html`, `connect/fast_prospect_message.html`, `connect/harvest_pool.html`, `connect/header-demo.html`, `connect/heyreach_api_page_5-7-26.html`, `connect/mass_upload.html`, `connect/message_edit_reports.html`, `connect/setup_checklist.html`, `connect/sop_builder.html`, `connect/unipile.html`, `crm/campaign_cleanup.html`, `crm/decline_scanner.html`, `crm/email_frequency_monitor.html`, `kba/campaign-portal.html`.

`connect/bdr_review_settings.html` and `connect/auto_bdr_connections.html` matter functionally even though they only mention HeyReach in text: they set the review mode (`manual`, `auto`, `timebased`) and create auto-approved queue items. That logic moves from the auto-push into the enqueue step unchanged.

`connect/unipile.html` stays as the admin sandbox.

---

## 5b. New pages

| Page | Purpose | Plan |
|---|---|---|
| Engine status | Per account: queue, planned sends for the next seven days, sent against the 60-a-day and 215-a-week limits, holds, unknown outcomes, connection state. Per client and hypothesis group: which time windows are Prime, Testing or Trickle, the day quotas, the numbers behind them, and pin or reset controls. | 13.3, 7.4 |
| Sending calendar | Twelve months ahead with each day's planned number. Add, edit or remove holidays and set each one's rule (no send, light, normal, heavy, custom). Set the global make-up policy. Shows the make-up plan and any shortfall before it happens, and a history row per holiday per year. | 7.7 |
| Engine settings | Default caps and default week, window definitions and shares, spacing, AI gate sensitivity. Could be a tab of Engine status. | 7, 9.5 |
| Unipile event viewer | Raw `unipile_events`, the twin of `heyreach_webhook_activity.html`. | 10.1 |

---

## 6. Backend routes (`RailwayCLemail/server.js` unless noted)

| Route | Today | After |
|---|---|---|
| `POST /api/connect-queue/auto-push` and `processConnectQueueAutoPush` | Pushes approved items to HeyReach campaigns. No lock. | Phase 0: skip accounts with `provider: unipile`; consult the ledger and locks. Unipile accounts go to the enqueue function. Removed in phase 5. |
| `POST /api/connect-queue/ai-review` | Grammar and fact review with Llama 4 Maverick; sets `mistake_queue`. | Kept as the pre-approval review. The send-time gate (plan 9) is separate and runs on everything. |
| `POST /api/connect-queue/similarity-check` | Flags similar messages. | Kept. |
| `POST /api/connect-queue/sync-in-process-to-heyreach` | Pushes an edit into HeyReach. | HeyReach accounts only, then removed. |
| `POST /api/connect-queue/push-single` | Does not exist. | Do not create it. Replace its five call sites. |
| `GET /api/connect-queue/connection-request-sent-events`, `GET /api/bdr/in-process-leads` | Read sent events and in-process leads. | Answer from ledger and outbox for Unipile accounts. |
| `POST /api/mass-messages/add-lead`, `/remove-lead` | Quick Message campaign. | Route by provider: Unipile accounts enqueue with `immediate`; cancel maps to outbox cancel. |
| `POST /heyreach/inbox/send-message` | Sends a reply; writes nothing to Firestore. | Replaced by `/api/linkedin/reply`. Old route kept for HeyReach accounts until phase 5. |
| `POST /heyreach/send-scheduled-messages` | Manual trigger of the message queue. | Removed with `linkedin_message_queue`. |
| `/heyreach/outreach/status`, `pause-bdr`, `resume-bdr`, `pause-company`, `resume-company` | Kill switch. Requires a HeyReach API key on the customer or returns an error. | Must work for customers with no HeyReach key. Set flags first, then pause HeyReach campaigns if the account is on HeyReach. |
| `/api/reserve-queue/*` | Reserve queue. | Skip Unipile accounts; removed in phase 5. |
| `POST /heyreach/webhook/:customerId/:eventType` | No authentication, no de-duplication, `add()`. | Phase 0: deterministic document ids; mark events for Unipile accounts as `shadow`. Authentication if HeyReach supports a secret. |
| `/proxy/heyreach/*` including `campaigns/addleadsv2` | Browser-callable HeyReach proxy. `addleadsv2` writes `connect_activity` with random ids. | Refuse sends for Unipile accounts. Removed in phase 5. |
| `/linkedin-connect/*` (`routes/linkedin_connect_routes.js`) | Invite tokens and HeyReach login relay. | Keep the token model; swap the provider calls for Unipile. |
| `/api/unipile/*` (`routes/unipile_routes.js`) | Admin sandbox. Webhook events kept in memory, 200 per replica. | Sandbox stays. The webhook handler gains durable storage (plan 10.1). The Unipile client helper, error class and signature check are reused by the engine. |
| New | | `/api/linkedin/outbox` (enqueue, list, edit, cancel, re-plan), `/api/linkedin/reply`, `/api/linkedin/accounts/link`, `/api/linkedin/pause`, `/api/linkedin/engine/status`, `/api/linkedin/engine/settings`, `/api/linkedin/gate/settings`, `/api/linkedin/calendar` (holidays and make-up policy), `/api/linkedin/timing` (view, pin, reset). |

---

## 7. Scheduled jobs on the Railway worker

| Job | Schedule | After |
|---|---|---|
| Connect queue auto-push | every 30 min | Skip Unipile accounts (phase 0). Removed in phase 5. |
| LinkedIn message queue processor | every 10 min | Replaced by the engine's sender. Its claim pattern is the model for the new one. |
| Legacy `processScheduledLinkedInActivities` | hourly | Confirm whether anything still feeds it. Skip Unipile accounts or remove. |
| HeyReach inbox sync | every 30 min, not 11 PM to 5 AM MT | HeyReach accounts only. Unipile equivalent: webhook plus 30-minute poll (plan 10.3). |
| Reply scanner | every 30 min | Kept; reads the mirrored conversations. |
| Conversation analysis | every 6 h | Kept; reads the mirrored conversations. |
| HeyReach contacts sync | every 2 days, 8 AM | HeyReach accounts only. Unipile equivalent: relations sync. |
| HeyReach webhook registration | daily 5 AM | HeyReach accounts only. Unipile webhooks are registered once for the whole company. |
| **HeyReach campaign resume** | daily 6 AM | **Must skip Unipile and draining accounts before any cutover.** Today it resumes everything if the `preventAutoActivation` lookup fails. |
| Reserve queue top-up | daily 6 AM | Skip Unipile accounts. |
| Decline scanner | daily 6:45 AM MT | Uses the global HeyReach key. Re-point to mirrored conversations. |
| Quick message cleanup | daily 9 AM | HeyReach accounts only. |
| Queue 1 cleanup | Tue and Thu 2:30 AM | Kept. Must cancel matching outbox items. |
| BDR strict verify | every 12 min, 8 to 5 weekdays | Review what it verifies against HeyReach. |
| LinkedIn follow-up (email after LinkedIn events) | every 5 min and at 7, 22, 37, 52 past | Kept. Triggered by the mirrored events. |
| New: planner | every 15 min and on change | |
| New: sender | every minute | |
| New: reconciler | every 10 min | |
| New: inbound sweep and polls | every 30 min, randomized per account | |
| New: relations and acceptance poll | every few hours, randomized | |
| New: like-a-post step | part of the sender; 3 hours or 2 days before each request | |
| New: invite withdrawal (older than 21 days) | nightly, a few per account | |
| New: timing review (window statuses and day quotas per hypothesis group, client and overall) | weekly | |
| New: calendar generation (next year's holiday entries from the recurrence rules) | yearly, and on edit | |
| New: ledger audit and billing reconciliation | nightly | |
| New: daily digest email | daily | |

---

## 8. Firestore collections

| Collection | Today | After |
|---|---|---|
| `connect_queue` | Drafted messages and approval state | Unchanged role. Gains `outboxId`, `sendProvider`, `sendStatus`, `sentAt`. Legacy `pushed_to_heyreach` fields still set. |
| `connect_activity` | "Pushed" record, partly written by browsers | Written by the backend only. |
| `heyreach_activity` | Webhook events; the basis of all reporting and billing | Receives compatible events from the engine, with `provider`. |
| `heyreach_inbox` | Conversation copies | Receives compatible conversation records. |
| `heyreach_contacts` | First-degree network, refreshed every two days | Mirrored from `linkedin_relations`. |
| `heyreach_leads`, `heyreach_campaigns`, `heyreach_linkedin_accounts` | HeyReach sync copies | Frozen at cutover, removed in phase 5. |
| `linkedin_message_queue` | Scheduled direct messages | Replaced by the outbox. Drained per account at cutover. |
| `connect_reserve_queue`, `quick_message_campaign_leads` | HeyReach feeding mechanisms | Not used for Unipile accounts. |
| `linkedin_accounts` | Account records | Extended (plan 5.1). |
| `bdr_leaders.heyreachCampaigns[]`, `bdr_leaders.limits.*`, `customerList.heyreachApiKey`, `customerList.heyreachEnabled` | HeyReach configuration and a second copy of limits | Unused for Unipile accounts. Limits live only in `linkedin_accounts.caps`. |
| `linkedin_connect_invites`, `linkedin_connect_secrets` | Client login tokens and encrypted 2FA keys | Tokens kept. Secrets unnecessary with Hosted Auth. |
| `linkedin_reply_alerts`, `outreach_kill_switch_log`, `connect_message_edits`, `dnc_organizations`, `hypothesis_groups` | | Unchanged. |
| New | | `linkedin_outbox`, `linkedin_send_locks`, `linkedin_sent_ledger`, `linkedin_account_days`, `linkedin_prospect_ids`, `linkedin_relations`, `linkedin_conversations`, `unipile_events`, `linkedin_engine_log`, `linkedin_calendar`, `linkedin_timing`, `system_settings/linkedin_engine`. |
