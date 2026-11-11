# Unipile Migration Plan: moving LinkedIn outreach off HeyReach

Status: **plan only, nothing built.** Written 2026-11-09. Revised the same day with the decisions on client login, caps, the default week, prime times, spacing, liking posts and holidays (sections 7, 11 and 17).
Companion file: [`UNIPILE_MIGRATION_PAGE_INVENTORY.md`](UNIPILE_MIGRATION_PAGE_INVENTORY.md) lists every page, backend route and scheduled job that touches HeyReach and what happens to each.

---

## 1. Summary

Today we hand a message to HeyReach and HeyReach decides when it goes out. Unipile is different in kind: it is a thin pipe to LinkedIn. It sends exactly what we tell it, the moment we tell it, and does nothing else. It has no campaigns, no drip engine, no daily limits of its own that we can rely on, and no "sent" report.

So this migration is mostly about building the things HeyReach did for us, and doing them better:

| HeyReach did this for us | After the move, we own it |
|---|---|
| Held leads in a campaign and sent them over time | Our own queue (the **outbox**) and a **sending engine** on the Railway `worker` service |
| Chose the send time (we only set a 12:00–21:00 Denver window) | A scheduler that places each send in the best day and time for its hypothesis group |
| Enforced daily limits per LinkedIn account | Daily, weekly and hourly caps enforced in a database transaction |
| Checked "already connected?" before inviting | A live LinkedIn check immediately before every invite |
| Told us what was sent, by webhook | A **sent ledger** we write ourselves at the moment of sending |
| Withdrew unanswered invites after 21 days | A small nightly job |
| Liked a post, waited, then invited | Kept: the engine likes a recent post, waits, then sends the request (section 7.6) |
| Sent every day of the year | A holiday calendar we edit, with the skipped volume made up on other days (section 7.7) |

Two things we gain that HeyReach could never give us: we know the exact second every message went out (Unipile's send call is synchronous), and we can put any check we like in front of the send, including the AI review.

The four rules the whole design follows:

1. **One sender per LinkedIn account.** An account is on HeyReach or on Unipile, never both. A single field decides, and every send path checks it.
2. **At most once.** If we are not sure whether a message went out, we do not send it again. We ask LinkedIn, and a person decides if needed.
3. **No record, no send.** If the engine cannot write to the ledger, it stops sending.
4. **When in doubt, hold.** Any failed check, including the AI being unavailable, parks the message for a human. It never falls through to "send anyway".

---

## 2. How it works today

### 2.1 The path of one connection request

```
connect_queue (Firestore)          one doc per drafted message
   |  approved in fast_connect_review.html / connect_push.html / auto-approval
   v
processConnectQueueAutoPush        RailwayCLemail server.js, cron every 30 min
   |  9am-5pm MT weekdays every 30 min, off-hours every 3 h, max 50 leads per call
   |  checks: BDR review mode ready? same text+URL already pushed by another BDR?
   |          already in heyreach_contacts (1st-degree)?
   v
HeyReach campaign (AddLeadsToCampaignV2)    message text rides along as {content}
   |  HeyReach sequence: like a post -> wait 3h or 2d -> still not connected? ->
   |  connection request, withdraw after 21 days
   |  HeyReach picks the actual send time inside its schedule window
   v
HeyReach webhook  ->  heyreach_activity (CONNECTION_REQUEST_SENT, ..._ACCEPTED, MESSAGE_SENT, replies)
   v
Every report, client portal, billing page and summary email reads heyreach_activity
```

### 2.2 Where each piece lives

| Function | Page(s) | Backend (repo `RailwayCLemail`) | Firestore |
|---|---|---|---|
| Create the LinkedIn account record, link it to HeyReach, set daily limits | `admin/email_controls.html` (LinkedIn tab, "Audit & Fix", "Easy Enroll") | `/proxy/heyreach/*` | `linkedin_accounts`, `bdr_leaders`, `customerList.heyreachApiKey` |
| Build the three campaigns per BDR (Connect, Message, Quick Message) | `admin/heyreach_campaign_builder.html`, `js/heyreach-campaigns.js` | `/proxy/heyreach/*` | `bdr_leaders.heyreachCampaigns[]` |
| Client logs in to LinkedIn | `connect/linkedin_account_setup.html` (creates an invite link), `public/linkedin_connect.html` (the client-facing form) | `routes/linkedin_connect_routes.js` (HeyReach `li_account/Connect`, `SubmitPin`) | `linkedin_connect_invites`, `linkedin_connect_secrets` |
| Approve and push messages | `connect/fast_connect_review.html` (main), `connect/connect_push.html`, `connect/mistake_queue.html` | `processConnectQueueAutoPush`, `/api/connect-queue/auto-push`, `/ai-review`, `/similarity-check` | `connect_queue`, `connect_activity` |
| Send right now | `connect/quick_outreach.html`, `mass_messages_to_connections.html`, `current_connections_fast_outreach.html`, `delayed_replies_send.html`, `fast_message_speedup.html`, `bdr_send_audit.html` | `/api/mass-messages/add-lead` (Quick Message campaign), `linkedin_message_queue_service.js` | `quick_message_campaign_leads`, `linkedin_message_queue` |
| See and answer replies | `connect/index_admin.html`, `connect/company_review_replies.html`, `review_replies.html` | Inbox sync and reply scanner (every 30 min), `/heyreach/inbox/send-message` | `heyreach_inbox`, `linkedin_reply_alerts`, `heyreach_activity` |
| Edit a message still on its way out | `connect/sent_messages.html`, `edit_in_process_messages.html` | `/api/connect-queue/sync-in-process-to-heyreach` | `connect_queue`, `connect_message_edits` |
| Timing analysis | `connect/analysis_results.html` | none (offline R batch uploads to Realtime Database `ConnectAnalysis/latest`) | RTDB |
| Stop everything | `connect/outreach_stop_button.html` | `/heyreach/outreach/pause-*`, `resume-*` | `linkedin_accounts.preventAutoActivation`, `customerList.heyreachEnabled`, `outreach_kill_switch_log` |
| Reports, portals, billing | about 75 pages | summary email and dashboard services | `heyreach_activity`, `heyreach_inbox` |

### 2.3 Railway today

Project `jubilant-success`, production environment, three services built from the same repo and branch:

| Service | Replicas | Role |
|---|---|---|
| `RailwayCLemail` | 3 | Public web API (`railwayclemail-production.up.railway.app`). All pages call this. |
| `heavy-api` | 2 | Long-running API calls. Not involved in sending. |
| `worker` | 1 | Runs every `cron.schedule()` job (selected by the `SERVICE_ROLE` env var). |

`UNIPILE_API_KEY`, `HEYREACH_API_KEY` and `OPEN_ROUTER_API_KEY` already exist as variables on all three.

### 2.4 Weak points in the current setup that the new design must not inherit

These are existing behaviours I found while reading the code. Each one is a way we could send something twice or lose track of it.

1. **The auto-push job has no lock.** It is safe today only because `worker` has one replica. Scale it to two and both would push the same leads.
2. **Duplicate checking is narrow.** The auto-push only blocks the *same text to the same URL by a different BDR*. Different text to the same person passes.
3. **LinkedIn URLs are normalized four different ways** in different files (`normalizeLinkedInUrl`, `_normConnUrl`, the auto-push index, `normalizeLinkedinUrlForHeyreach`). Two spellings of the same profile can look like two people.
4. **Pages write to the sent record from the browser.** `fast_connect_review.html`, `bdr_send_audit.html`, `linkedin_campaign_followup.html` write `connect_activity`; `manual_log_heyreach.html` writes `heyreach_activity`. A sent record that a browser can write is not a strict record.
5. **The HeyReach webhook endpoint has no authentication and no de-duplication.** `POST /heyreach/webhook/:customerId/:eventType` accepts anything and uses `add()`, so a retried delivery is counted twice. Billing counts these rows.
6. **Three places hold "limits"**: `linkedin_accounts.connectionsPerDay`, `bdr_leaders.limits.*`, and HeyReach's own settings. There is no weekly limit anywhere in our code.
7. **`POST /api/connect-queue/push-single` does not exist in the backend repo**, but `connect_push.html` (3 call sites) and `mistake_queue.html` (2) call it. Those buttons are presumably failing today.
8. **The 6 AM "resume campaigns" job restarts paused HeyReach campaigns** every day unless `preventAutoActivation` is set on the account. If the lookup of that flag fails, the code logs a warning and resumes everything. This matters a great deal during cutover (section 14).

---

## 3. What Unipile gives us and what it does not

Everything in this table comes from Unipile's v2 documentation or from the working sandbox (`connect/unipile.html`, `routes/unipile_routes.js`). Items I could not confirm are in section 18.

| Capability | Unipile | Consequence for us |
|---|---|---|
| Send a connection request | `POST /v2/{account}/users/me/relation-requests` with the person's LinkedIn member id and an optional note (300 characters) | Synchronous. Success means it was sent, and we stamp the time ourselves. |
| Send a message to a connection | `POST /v2/{account}/inboxes/{inbox}/chats/send` (new chat) or `.../chats/{chatId}/messages/send` (reply) | Same. |
| Look up a profile | `GET /v2/{account}/users/{identifier}` | Returns the member id we need for sending, plus `network_distance` and `relation_request_status`. One call tells us "already connected" or "invite already pending" straight from LinkedIn. About 100 lookups per account per day. |
| List and withdraw pending invites | Yes | We run the 21-day withdrawal ourselves. |
| React to and comment on posts | Yes | The "like a post first" step is possible. |
| Incoming message notification | Webhook `message.new` | Also fires for our own sent messages, so we filter on `is_sender`. |
| Invite accepted notification | Webhook `relation.new` | **Arrives up to 6 hours late.** Acceptance time is approximate. |
| Invite sent notification | **None** | Our ledger is the only record. |
| Account disconnected notification | Webhooks `account.status.disconnected`, `errored`, `running` | We must pause that account's sending and ask the client to reconnect. |
| Webhook delivery guarantee | Must answer within 5 seconds. Retries only twice (after 2 s and 12 s). Events kept 7 days and can be replayed. | A webhook can be lost during a deploy. We need a polling safety net. |
| Campaigns, sequences, schedules | **None** | We build the engine. |
| Sending limits | Unipile publishes recommendations and lets us set rate limits in its dashboard, and returns `429` when they are hit | We enforce our own caps first and set Unipile's dashboard limits as a second, independent brake. |
| Account login | Hosted Auth (a Unipile-run login page reached by a link we generate) or Custom Auth (our own form, we relay credentials and the 2FA step) | Decided: Unipile's hosted login, launched from our own page (section 11). |
| Credentials | One API key for the whole company. Accounts are `acc_...` ids under it. | No more per-customer API keys. |

**LinkedIn limits Unipile recommends, per LinkedIn account:** 80 to 100 invitations per day and about 200 per week on a paid account; about 100 per day for other actions such as messages and profile views; actions spaced at random intervals, never on a fixed beat; new or small accounts start low. A free LinkedIn account can send only about 5 invitations *with a note* per month (it can send more without a note).

Two things to hold next to that. The limits decided for the new engine are 60 connection requests a day and 215 a week per account (section 7.2); today's setting is `connectionsPerDay: 35` with campaigns enabled seven days a week, a configured ceiling of 245. And nothing in our code tracks whether an account is free or paid, which the note limit depends on.

---

## 4. Target architecture

```
        PAGES (pandonetworking)                               RAILWAY (RailwayCLemail repo)
 ┌────────────────────────────────────┐        ┌───────────────────────────────────────────────────┐
 │ fast_connect_review / connect_push │        │  web service (3 replicas)                         │
 │ quick_outreach / mass_messages ... │──────► │   POST /api/linkedin/outbox      enqueue          │
 │ index_admin / company_review_...   │──────► │   POST /api/linkedin/reply       enqueue, urgent  │
 │ sent_messages (edit / cancel)      │──────► │   PATCH /api/linkedin/outbox/:id edit, cancel     │
 │ outreach_stop_button               │──────► │   POST /api/linkedin/pause|resume                 │
 │ email_controls / account setup     │──────► │   POST /api/linkedin/accounts/link                │
 └────────────────────────────────────┘        │   POST /api/unipile/webhook      store raw, 200   │
        pages never call Unipile                └───────────────────────┬───────────────────────────┘
        and never write the ledger                                      │ Firestore
                                                                        ▼
        ┌───────────────────────────────────────────────────────────────────────────────────────┐
        │ linkedin_outbox      the queue: one doc per intended action, with status and send time │
        │ linkedin_send_locks  one doc per (account, person, action): the "never twice" guard    │
        │ linkedin_sent_ledger append-only record of everything that left                        │
        │ linkedin_account_days  per-account daily counters for caps                             │
        │ unipile_events       every webhook delivery, keyed by Unipile's event id               │
        │ heyreach_activity    existing collection; engine mirrors events here so reports work   │
        └───────────────────────────────────────────────────────────────────────────────────────┘
                                                                        ▲
                                                ┌───────────────────────┴───────────────────────────┐
                                                │  worker service                                   │
                                                │   PLANNER   assigns each queued item a send time  │
                                                │   SENDER    every minute: claim, check, send, log │
                                                │   RECONCILER  unknown outcomes, missed webhooks   │
                                                │   INBOUND   replies, acceptances, disconnects     │
                                                │   HOUSEKEEPING  withdraw old invites, relations   │
                                                └───────────────────────┬───────────────────────────┘
                                                                        │ only the worker sends
                                                                        ▼
                                                              Unipile API ──► LinkedIn
```

Design choices worth stating:

- **Only one piece of code calls Unipile's send endpoints**: a single `sendThroughUnipile(outboxItem)` function in the engine. The "immediate" pages and the reply pages do not get their own send path. They enqueue with high priority and the same function sends, so every check applies to every message.
- **Pages never write the sent record.** The four browser-side writes listed in 2.4 are replaced with API calls.
- **The existing sandbox routes stay admin-only for testing.** They are not reused for production sends because they deliberately write nothing to Firestore.
- **Correctness does not depend on the worker having one replica.** Every send is claimed in a Firestore transaction, so a second worker (or a restart mid-send) cannot double-send.

---

## 5. Data model

Names are proposals. Field lists are the minimum each record needs.

### 5.1 `linkedin_accounts` (existing, extended)

| Field | Purpose |
|---|---|
| `provider` | `heyreach` or `unipile`. **The single switch that decides who sends for this account.** Missing means `heyreach`. |
| `unipileAccountId` | `acc_...`. Can be set while `provider` is still `heyreach` (linked but not live). |
| `unipileStatus` | `running`, `disconnected`, `errored`, from account webhooks. |
| `accountTier` | `free` or `premium`. Drives note limits. |
| `timezone` | The BDR's own timezone. Recorded for reporting; sending windows use the Central clock (section 7.3). |
| `caps` | `{ requestsPerDayMax: 60, requestsPerWeek: 215, messagesPerDay, likesPerDay, lookupsPerDay }`. The one place limits live. Defaults come from `system_settings/linkedin_engine`. |
| `weekPlan` | Optional pinned override of the day quotas. Normally absent, and the engine computes the plan (section 7.4). |
| `warmupStartedAt` | Start of the ramp for a new or newly migrated account. |
| `likeDelay` | `3h` or `2d`: the wait between liking a post and sending the request, carried over from today's campaign setting. |
| `preventAutoActivation` | Existing kill-switch flag. Reused as "paused". |
| `heyreachAccountId` | Kept. Existing reports join on it (section 12). |

### 5.2 `linkedin_outbox` (the queue)

One document per intended LinkedIn action. The document id is deterministic so the same thing cannot be queued twice: `cq_{connectQueueId}` for anything that comes from `connect_queue`, `reply_{clientRequestId}` for a reply typed in a page (the page generates the id once per composed message, so a double-click or a browser retry lands on the same document).

| Field | Notes |
|---|---|
| `kind` | `invite`, `message`, `reply`, `like`, `withdraw_invite` |
| `priority` | `scheduled` (engine picks the time) or `immediate` (skip timing, keep every other check) |
| `status` | See lifecycle below |
| `customerId`, `bdrLeaderId`, `bdrEmail`, `linkedinAccountDocId`, `unipileAccountId` | Who sends |
| `recipientUrl`, `recipientUrlKey`, `recipientMemberId`, `recipientName`, `recipientCompany` | Who receives. `recipientUrlKey` comes from the one shared normalizer. `recipientMemberId` is filled when the profile is resolved. |
| `text`, `contentHash`, `contentVersion` | The message. Version increases on every edit. |
| `source` | `{ page, connectQueueId, hypothesisGroupId, hypothesisVariationId, approvedBy, approvalMethod }` |
| `plan` | `{ sendAfter, sendBefore, day, window, arm, likeAt, plannedAt }`. `arm` is `prime`, `test` or `trickle` (section 7.3). |
| `gate` | `{ contentVersion, verdict, severity, categories, reason, model, checkedAt }` |
| `claim` | `{ by, at, leaseUntil }` |
| `hold` | `{ reason, detail, at }` when status is `held` |
| `result` | `{ ledgerId, sentAt, providerId }` or `{ errorType, errorDetail, at }` |
| `history[]` | Append-only list of status changes with time and actor |

Lifecycle:

```
queued ──► scheduled ──► claimed ──► sending ──► sent
   │           │            │           │
   │           │            │           ├──► outcome_unknown ──► sent | scheduled (only after proof it did not go)
   │           │            │           └──► failed_permanent
   │           │            └──► held  (a check failed; a person releases or cancels)
   └───────────┴──► cancelled  (edited away, prospect replied, DNC, account moved, stale)
```

### 5.3 `linkedin_send_locks` (the never-twice guard)

Created with Firestore `create()`, which fails if the document already exists. That failure is the guard.

| Lock id (hashed) | Meaning |
|---|---|
| `invite | {unipileAccountId} | {recipientMemberId}` | This account has invited this person. One invite per pair, ever, unless a person releases the lock after a withdrawal. |
| `msg | {unipileAccountId} | {recipientMemberId} | {contentHash}` | This account has sent this exact text to this person. |
| `item | {outboxId}` | This outbox item has been attempted. |

Fields: `state` (`attempting`, `sent`, `released`), `outboxId`, `createdAt`, `ledgerId`. Locks are also created by the history backfill (section 14.2) so that everything HeyReach already sent is protected from day one.

### 5.4 `linkedin_sent_ledger` (the strict record)

Append-only. Written only by the engine, in the same batch that marks the outbox item `sent`. Security rules deny all client writes. Never updated except to add confirmation fields; never deleted.

| Field | Notes |
|---|---|
| `ledgerId` | Deterministic: `{outboxId}` |
| `kind`, `customerId`, `bdrLeaderId`, `bdrEmail`, `unipileAccountId`, `linkedinAccountDocId` | |
| `recipientUrl`, `recipientUrlKey`, `recipientMemberId`, `recipientName`, `recipientCompany` | |
| `textSent`, `contentHash`, `charCount` | The exact text that left, not a reference to it |
| `sentAt` | Our clock at the moment Unipile returned success |
| `providerResponse` | Unipile's returned ids (`invitation_id`, `chat_id`, `message_id`) |
| `plannedFor`, `window`, `arm`, `calendarRule` | What the scheduler intended (which window, whether a prime, test or trickle send, and any holiday rule in force), so we can measure the scheduler |
| `hypothesisGroupId`, `hypothesisVariationId`, `connectQueueId`, `sourcePage`, `approvedBy` | Attribution |
| `gate` | The AI verdict that let it through |
| `provider` | `unipile` (backfilled history uses `heyreach`) |
| `confirmedBy` | `api_response`, or `reconcile` if we had to look it up afterwards |
| `acceptedAt`, `acceptedDetectedAt`, `repliedAt`, `withdrawnAt` | Outcome stamps added later |

### 5.5 Supporting collections

| Collection | Purpose |
|---|---|
| `linkedin_account_days/{accountDocId}_{YYYY-MM-DD}` | Counters `{ invites, messages, actions, lookups }`, incremented inside the claim transaction. The weekly figure is the sum of the last seven. |
| `linkedin_prospect_ids/{recipientUrlKey}` | Cache of URL to LinkedIn member id, with name and headline at lookup time. |
| `linkedin_relations/{accountDocId}_{memberId}` | Our copy of each account's first-degree connections, replacing the role of `heyreach_contacts`. |
| `unipile_events/{evt_id}` | Raw webhook body, `receivedAt`, `processedAt`, `processingError`. |
| `linkedin_conversations/{accountDocId}_{chatId}` | Provider-neutral conversation record. Mirrored into `heyreach_inbox` for existing pages (section 10). |
| `system_settings/linkedin_engine` | Global on/off, default caps and default week, window definitions and shares, holiday make-up policy, AI gate settings. |
| `linkedin_calendar/{date}` | Holiday and special-day entries: name, rule (no send, light, normal, heavy, custom), make-up choice, who edited it. |
| `linkedin_timing/{level}_{id}` | For each hypothesis group, client and the company as a whole: the status of each time window, the day quotas, the counts behind them, and when each last changed. |
| `linkedin_engine_log` | One row per engine decision that is not a send: holds, skips, re-plans, breaker trips. |

---

## 6. Sending a message, end to end

### 6.1 Enqueue

Every source (queue approval, auto-approval, reserve top-up, quick outreach, a typed reply) calls one backend function. It:

1. Loads the sending account. If `provider` is not `unipile`, the item goes down the existing HeyReach path unchanged. This is what lets clients move one at a time.
2. Normalizes the recipient URL with the single shared normalizer.
3. Creates the outbox document with its deterministic id. If it already exists, returns the existing one and changes nothing.
4. Runs the hard checks that need no network call (section 8.2). A failure sets `held` immediately, so a person sees it hours before it would have sent.
5. Writes `connect_activity/push_{connectQueueId}` and marks the `connect_queue` document as handed off, so current pages show it as "in process" (section 12).

### 6.2 Plan

The planner (section 7) gives each `queued` item a `plan.sendAfter` and sets `scheduled`. `immediate` items get `sendAfter = now`.

### 6.3 Send

The sender runs every minute on the worker. For each account that has an item due, it takes **one** item and does the following. Steps 1 and 5 are Firestore transactions.

| # | Step | If it fails |
|---|---|---|
| 1 | **Claim.** In one transaction: re-read the item (must still be `scheduled`, due, and at the same `contentVersion` the gate approved); re-read the account (`provider = unipile`, status `running`, not paused); read the global and customer switches; read today's and the last seven days' counters and compare to caps; check the random minimum gap since this account's last action. If all pass, set `claimed` with a 5-minute lease and increment the counters. | Not due, capped or paused: leave it, the planner moves it. Anything else: `held`. |
| 2 | **Resolve and look.** Call the profile lookup (normally already done when the post was liked, section 7.6; repeated only if that was more than 3 days ago). Fill `recipientMemberId`. For an invite: if LinkedIn says first-degree, cancel as `already_connected`; if it says an invite is pending, cancel as `already_invited`. For a message: confirm the person is a connection. Compare the name on the profile with the name in the greeting. | `held` with the reason, or `cancelled` for the two "already" cases. |
| 3 | **Hard checks with the member id** (section 8.2): ledger and lock lookups by member id, cross-BDR rule, DNC list, reply-since-queued check. | `held` or `cancelled`. |
| 4 | **AI gate** (section 9), if there is no verdict for this `contentVersion` or the verdict is older than the configured age. | `held`. If the AI call itself fails twice: `held` with reason `ai_unavailable`. |
| 5 | **Lock.** Create the send-lock documents with `state: attempting` and set the item to `sending`, in one transaction. | Lock already exists: this was sent before. Cancel as `duplicate_blocked` and alert, because an earlier check should have caught it. |
| 6 | **Send.** One call to Unipile with a 30-second timeout. No automatic retry. | See 6.4. |
| 7 | **Record.** One batch: write the ledger row, set the item `sent`, set the lock `sent`, write the compatible `heyreach_activity` event (section 12), update `connect_queue`. | If this batch fails, retry it up to five times with backoff. If it still fails, **stop the engine globally** and alert. The lock from step 5 already prevents a re-send. |

The lock is written **before** the call and the ledger **after**. If the process dies between them, we are left with a lock in `attempting` and no ledger row, which the reconciler finds and resolves. The reverse order could leave a message sent with nothing to stop it going again.

### 6.4 When Unipile does not say "success"

| Response | Meaning | Action |
|---|---|---|
| `422 already_connected` | They are a connection | Cancel. Add to `linkedin_relations`. |
| `422 already_invited_recently` | An invite is pending or was recently withdrawn | Cancel. Keep the lock. |
| `422 cannot_resend_yet` | LinkedIn's invitation limit has been reached | Release the lock, put the item back to `scheduled`, **pause invites on this account for 24 hours**, lower its cap, alert. |
| `422 invalid_recipient`, `cannot_invite_attendee` | This person cannot be invited | `failed_permanent`. No retry. |
| `429 provider/too_many_requests` | LinkedIn is pushing back | Same as `cannot_resend_yet`, for all action types on this account. |
| `429 api/too_many_requests` | We hit the limit we set in Unipile's dashboard | Release, reschedule after `retry-after`. This should never happen if our caps are below Unipile's; alert because it means a cap bug. |
| `401`/account errors | Session lost | Release, mark the account `disconnected`, pause it, start the reconnect flow. |
| Timeout, connection reset, `5xx` | **We do not know if it was sent** | `outcome_unknown`. Never retried automatically. |

### 6.5 Resolving an unknown outcome

The reconciler runs every 10 minutes and looks at `outcome_unknown` items and at locks stuck in `attempting` for more than five minutes.

- Invite: look the person up. `relation_request_status: PENDING` or first-degree means it went; write the ledger row with `confirmedBy: reconcile`. Otherwise check the sent-invitations list. Not found after two checks 30 minutes apart means it did not go: release the lock and reschedule.
- Message: read the chat with that person and look for a message from us with the same text in the last hour. Found means sent. Not found twice means not sent.
- If Unipile itself cannot be reached, the item waits. After 24 hours it is `held` for a person.

---

## 7. The engine: when to send

Sections 7.2 to 7.7 record the rules decided on 2026-11-09: the weekly and daily caps, the default week, prime times with the 80 / 20 / 10 split, spacing, liking a post first, and holidays. Section 7.1 comes first because it changes how much weight the history deserves.

### 7.1 What our history can and cannot tell us about timing

**The timing tables on `analysis_results.html` do not measure when requests were sent.** The evening, overnight and Sunday advantage they show is mostly or entirely a counting artifact. I cannot tell from that data whether nights are better, the same, or worse.

How I checked. Every "best day" and "best time" figure is built from one field in the export, `first_outreach_sent_at`. I read how `analysis_data.html` fills it (lines 2250 to 2255) and re-ran the numbers on the contact-level exports in `Downloads` (`probit_dataset_2026-10-07.json`, 92,706 rows, and `probit_dataset_2026-11-04.json`, 111,157 rows). The October file reproduces the published figures: Evening 39.4% against the published 38.4%, Sunday evening 93.8% on 496 rows against the published 93.4% on 468.

The field is filled from two different clocks:

- If the contact has a conversation thread in the HeyReach inbox, it is the time of the first message in that thread. A thread exists almost only for people who accepted.
- Otherwise it is the time someone approved the message in our review page (`adminApprovedAt`, then other queue timestamps). That is nearly everyone who did not accept.

So people who accepted are filed by LinkedIn's clock, and people who did not are filed by when our team clicked approve. Any hour or day when our team rarely approves, but LinkedIn threads still start, shows a very high "accept rate" because the people who did not accept are filed somewhere else. The November export shows it plainly:

| Rows whose timestamp falls on | Rows | Accepted |
|---|---|---|
| 2 AM to 6 AM Central (nobody approving) | 1,610 | 99.5% |
| Labor Day | 53 | 53 of 53 |
| Easter Sunday | 31 | 31 of 31 |
| Halloween (a Saturday) | 77 | 77 of 77 |
| 7 PM to 8 PM Central | 2,389 | 77% |
| 7 AM to 8 AM Central (heavy approving) | 10,534 | 11% |

What follows:

- "Nights, Thursdays and Sundays" may still be right. The history neither supports nor contradicts it.
- The differences between hypothesis groups that the first version of this plan cited came from the same field. I have removed that argument.
- The default schedule our campaign builder gives HeyReach is 12:00 to 9:00 PM Mountain every day, which is 1 PM to 10 PM Central. If live campaigns use it (not checked), we have never sent a request in the morning, so there is no morning history at all.

The one clean timing signal in the export is the date each acceptance happened, which comes from HeyReach's acceptance webhook. Of 21,813 acceptances from February 1 to October 20, 2026: Sunday 9.1%, Monday 12.9%, Tuesday 16.4%, Wednesday 17.6%, Thursday 16.5%, Friday 15.8%, Saturday 11.7%. That is when prospects act, which is not the same as when to send, but it does not point to Sunday.

What this plan does about it:

1. **Your defaults go in exactly as specified** (7.2, 7.3). They are a fair place to start and cost little if timing turns out not to matter.
2. **The engine learns only from its own ledger**, where every send has a true timestamp. It is not seeded from the historical tables.
3. **The adjustment rules work in both directions** (7.4). If mornings or Mondays beat nights or Sundays in the ledger, they are promoted.
4. **Recommended before the engine goes live:** change the export to take the send time from HeyReach's `CONNECTION_REQUEST_SENT` webhook events, which carry the true send time for every request whether accepted or not. `analysis_data.html` already loads those events for a reconciliation check, so the change is small. Re-running the analysis would then show whether nights and Thursday and Sunday are real, within the 1 PM to 10 PM window HeyReach used. I could not run this myself because it needs read access to Firestore.

### 7.2 Volume: caps and the default week

These numbers count **connection requests only**. Messages to existing connections, replies and likes are counted separately (end of this section).

Hard limits per LinkedIn account:

| Limit | Value |
|---|---|
| Connection requests in one day | 60 |
| Connection requests in one calendar week (Sunday to Saturday) | 215 |

Default week:

| Sun | Mon | Tue | Wed | Thu | Fri | Sat | Total |
|---|---|---|---|---|---|---|---|
| 50 | 15 | 35 | 35 | 50 | 15 | 15 | 215 |

How it is applied:

- **Small daily variation.** Each day's actual number moves a few either side of its plan (up to 3), so an account does not send exactly 50 every Thursday. The week still totals at most 215 and no day passes 60.
- **Smaller accounts keep the shape.** An account in warm-up, with a lower cap set for its client, or with a thin queue uses the same proportions scaled down.
- **Hand-sent requests count.** Requests the BDR sends themselves in LinkedIn count against both limits as soon as the pending-invitation check sees them.
- **Enforced where it cannot be bypassed.** The limits are checked inside the claim transaction (6.3), per account, using Central-time days.
- **Limits are stored once**, in `linkedin_accounts.caps`, with the default week in `system_settings/linkedin_engine`. The three places limits live today (2.4) are retired.

How this compares with what we do now and with Unipile's guidance:

- In the four weeks from September 27 to October 24, 2026, the export shows 37 sending identities and about 4,400 queue records a week. The median account had about 142 a week and the busiest tenth about 210. So 215 is close to what the busiest accounts already do, and a real increase for the typical one. (These are queue records, not confirmed LinkedIn sends.)
- 60 a day is under Unipile's recommended 80 to 100.
- For the week, Unipile's limits page says "approximately 200" for a paid, active account, and another of their pages gives 200 to 250 for premium accounts. 215 sits just above the first figure. Unipile does not enforce a limit itself; LinkedIn returns a specific error when its own limit is reached, and the engine's response to that error (6.4: pause that account's requests for 24 hours, lower its cap, alert) is the safety valve.
- A free LinkedIn account cannot do this volume with notes (about 5 noted requests a month). Still an open decision (section 17).

Other limits per account, unchanged suggestions: 40 scheduled messages to connections a day; likes no more than the day's requests; 80 profile lookups a day. Unipile's guidance is 100 a day for each of these kinds of action, counted separately.

**Warm-up** (my recommendation, not yet confirmed): an account that is new, or new to Unipile, runs the default week at one third in week one, half in week two, three quarters in week three, then full. Its first week also counts what HeyReach sent in the previous seven days.

**A third brake.** Unipile's dashboard lets us set rate limits per account. Set them slightly above ours. If our code ever ignores a cap, Unipile refuses the call.

### 7.3 Time of day: prime times and the 80 / 20 / 10 rule

The day is divided into windows on the US Central clock, the same clock the reports use.

| Window | Central time | Starting status |
|---|---|---|
| Early morning | 5:00 to 8:59 AM | Testing |
| Morning | 9:00 to 11:59 AM | Testing |
| Afternoon | 12:00 to 2:59 PM | Testing |
| Late afternoon | 3:00 to 5:59 PM | Testing |
| Evening | 6:00 to 9:59 PM | **Prime** |
| Late evening | 10:00 to 10:59 PM | **Prime** |
| Overnight | 11:00 PM to 4:59 AM | Closed |

The rule:

- **80%** of each day's requests go out in Prime windows.
- **20%** go out at other times, shared among the windows still in Testing.
- Once a window has been shown statistically not to work (7.4), it drops to a **trickle**. When every non-prime window is at trickle, other times get **10%** in total and Prime gets 90%.
- In between, the other-times share is 10% plus 10% times the fraction of non-prime windows still in Testing. With four non-prime windows: all four testing gives 20%, two testing gives 15%, none gives 10%.

What that looks like at the start:

| Day | Requests | Night (6 to 11 PM) | Each of the four daytime windows |
|---|---|---|---|
| Thursday, Sunday | 50 | 40 | 2 or 3 |
| Tuesday, Wednesday | 35 | 28 | 1 or 2 |
| Monday, Friday, Saturday | 15 | 12 | 0 or 1 |

Three details:

- **Which requests get the off-prime times is chosen at random** within each hypothesis group. If the engine sent its leftovers or its oldest items in the test windows, the comparison would be unfair and we would repeat the mistake in 7.1.
- **Overnight is closed by default.** A person does not send invitations at 3 AM, and steady overnight activity is a pattern that gets accounts restricted. It is a setting; opening it puts it in Testing like any other window.
- **Scheduled messages to existing connections** follow the same windows and the same split, learned separately with replies as the measure. Replies typed by a person and anything marked `immediate` are not scheduled at all.

### 7.4 How the engine adjusts itself

**What it learns from.** The sent ledger only. The measure for a connection request is "accepted within 14 days of being sent", so a send is counted once it is 14 days old. The engine looks at the last 120 days, so old results fade and a change in behaviour shows up.

**At what level.** Hypothesis group first, then the client, then all clients together. A group uses its own verdict when it has enough sends of its own. Until then it follows its client's verdict, and failing that the company-wide one, and failing that your defaults.

**When.** Once a week.

**Time windows.** Each window has a status:

| Status | Meaning | Share of the day |
|---|---|---|
| Prime | Best-performing | Shares the 80% (90% once testing is finished) |
| Testing | Not enough evidence yet | Shares the testing part of the 20% |
| Trickle | Shown worse than Prime | Shares the 10% |
| Closed | Not used | None |

A window changes status as follows:

| Change | When |
|---|---|
| Testing to Trickle | At least 150 counted sends in the window, and its accept rate is below the Prime rate with 95% confidence, at two weekly reviews in a row |
| Testing to Prime | At least 150 counted sends, and its accept rate is above the weakest Prime window's with 95% confidence, at two weekly reviews in a row |
| Prime to Testing | Another window has been shown better than it by the same test. At least one window is always Prime |
| Trickle to Testing | On the last 120 days it is no longer shown worse. This is what the trickle is for |

Requiring two reviews in a row keeps a lucky or unlucky week from moving the schedule.

**Days of the week.** Same idea, applied to the day quotas:

- Each week the engine compares each day's accept rate with the other days'.
- If one day is shown better than the rest and another is shown worse (95% confidence, at least 150 counted sends each), it moves 5 requests a week from the worse day to the better one. At most two such moves per review.
- No day goes below 15, so every day keeps being tested. No day goes above 60. The week stays at 215.
- With no evidence nothing moves, and your default week holds.
- An account that sends for several hypothesis groups gets a blend of their plans, weighted by what is in its queue.

**How long this takes.** To show a window is worse takes about 150 sends in that window if it accepts at half the Prime rate (say 10% against 20%), and about 500 if the gap is smaller (14% against 20%). At the default split, about 43 of an account's 215 weekly requests go off-prime, about 11 per daytime window.

| Level | Example | Off-prime sends per window per week | Time to a verdict after go-live |
|---|---|---|---|
| All clients | 37 accounts at today's volume | about 220 | 4 to 6 weeks |
| One client | 3 accounts | about 20 to 30 | 2 to 6 months |
| One hypothesis group | 1 account | about 11 | 4 to 11 months; follows its client's verdict meanwhile |

So expect a company-wide answer on "do nights really win" about a month after most accounts are live, client-level answers over the following months, and group-level answers only for the largest groups.

**Control.** The engine status page shows, for each client and group, every window's and day's status, the numbers behind it and when it last changed. An admin can pin a plan so the engine stops adjusting it, or reset it to the defaults. Every change is logged.

### 7.5 Spacing between sends

- **Gap between any two actions from one account:** drawn at random between 2 and 9 minutes, most often 3 to 7, with an occasional longer pause of 10 to 20 minutes. Never a fixed beat, never the same gap twice running, and times fall on odd seconds, not on the minute.
- **The gap covers every kind of action** on the account (requests, likes, scheduled messages), so two never fire together.
- **Each night starts at a different time**, somewhere in the first 25 minutes of the window.
- **It fits.** The largest night is 48 requests (80% of 60) in five hours, an average of one every six minutes. A default Thursday is 40, one every seven and a half.
- **If a window cannot hold its share at these gaps**, the overflow moves to the next day. The gaps are never squeezed to catch up.

### 7.6 Liking a post before the connection request

Kept from the HeyReach sequence. I have read "liking posts before commenting" as "before connecting", which is what the current sequence does; if we later comment on posts through Unipile, the same like-first rule would apply.

1. **Prepare**, 3 hours or 2 days before the planned request (the same per-BDR choice we set today): look the person up (this resolves their LinkedIn id and checks they are not already connected or already invited), run the hard checks and the AI gate, then like their most recent post from the last three months, as HeyReach does now.
2. **Wait** at least 3 hours, or 2 days.
3. **Send the request** in its planned window. No second lookup is needed unless the first is more than 3 days old; if the person connected in the meantime, LinkedIn refuses the request and nothing is sent (6.4).

If the person has no post in the last three months, the like is skipped and the request goes out as planned.

The sandbox backend already has both calls this needs: listing a person's posts and adding a `linkedin_like` reaction (`routes/unipile_routes.js`).

With a 3-hour wait and requests at night, likes fall between about 1 PM and 8 PM the same day. Likes follow the same spacing rule and are recorded in the ledger. They do not count toward the 215 or the 80 / 20 split, which concern requests.

One thing to watch in the pilot: on a 60-request day an account also does up to 60 lookups, 60 post reads and 60 likes. Each kind is under Unipile's 100-a-day guidance and Unipile says the kinds do not add together, but it is more total activity per account than HeyReach's.

### 7.7 Holidays

**The calendar.** A global list of dated entries, each with a rule:

| Rule | Effect on that day |
|---|---|
| No send | Nothing scheduled goes out: no requests, likes or scheduled messages. Replies typed by a person still send. |
| Light | 15 requests, the same floor as a quiet day. Use it to keep measuring a doubtful day. |
| Normal | The day's usual number |
| Heavy | 50 |
| Custom | Any number up to 60 |

Entries are generated each year from recurrence rules (for example "fourth Thursday of November") and can then be edited one by one. A new admin page, "Sending calendar", shows the next twelve months with each day's planned number, lets an admin add, change or remove any entry, and shows the make-up plan before it happens.

**Making up the volume.** One global policy, editable on the same page:

| Setting | Default | Options |
|---|---|---|
| Make up skipped volume | On | On, off, or per holiday |
| Where | Same calendar week | Same week; also the week before; also the week after |
| Split | Half before the holiday, half after | Any split |
| Which days take it | Strongest days first | Strongest first; spread evenly; chosen days only |
| Most per day | 60 | |
| Most in the calendar week | 215 | |
| Most in any 7 days in a row | 240 | See below |

There is a conflict to be aware of. If a normal week already uses all 215, then moving a holiday's requests to other days in the same calendar week keeps that week at 215 but pushes some seven-day stretch above 215, because the stretch just before or just after the holiday now holds the extra. LinkedIn's weekly limit is generally described as a rolling seven days (I have not verified how it counts). Splitting the make-up evenly before and after keeps that peak as low as it can be: 215 plus half the holiday's volume. The last setting caps it. At 240 a 50-request holiday can be made up in full. At 215 nothing can be made up for an account already at its full week, and the volume is simply skipped. **240 is my suggestion and needs your decision.**

Worked example, Thanksgiving week 2026, with Friday left as a normal day:

| | Sun 22 | Mon 23 | Tue 24 | Wed 25 | Thu 26 | Fri 27 | Sat 28 | Week |
|---|---|---|---|---|---|---|---|---|
| Normal | 50 | 15 | 35 | 35 | 50 | 15 | 15 | 215 |
| With holiday and make-up | 60 | 15 | 43 | 42 | 0 | 28 | 27 | 215 |

The busiest seven days in a row are 240 (Thursday the 19th to Wednesday the 25th, and Friday the 27th to Thursday December 3rd).

In a week with several holidays, such as Christmas Eve on a Thursday and Christmas on a Friday, not everything fits under these limits. The calendar page shows the shortfall in advance.

Items that wait because of a holiday are not treated as late.

**What the history says about holidays.** For the reason in 7.1, accept rates by send date are not usable. What is usable is how many acceptances happened on each holiday, compared with the same weekday in the three weeks either side:

| 2026 | Acceptances that day | Typical for that weekday | Share of typical |
|---|---|---|---|
| Good Friday (Apr 3) | 58 | 54 | 107% |
| Easter Sunday (Apr 5) | 47 | 31 | 152% |
| Friday before Memorial Day | 104 | 109 | 95% |
| Memorial Day | 53 | 61 | 87% |
| Tuesday after Memorial Day | 105 | 108 | 97% |
| Juneteenth | 73 | 90 | 81% |
| Thursday July 2 | 73 | 103 | 71% |
| Friday July 3 (holiday observed) | 67 | 98 | 68% |
| Saturday July 4 | 10 | 70 | 14% |
| Monday after July 4 | 98 | 97 | 101% |
| Friday before Labor Day | 78 | 163 | 48% |
| Labor Day | 58 | 128 | 45% |
| Tuesday after Labor Day | 110 | 132 | 83% |
| Columbus / Indigenous Peoples' Day | 119 | 154 | 77% |

How to read it: July 4 and Labor Day were clearly dead, and the Friday before Labor Day was as bad as the day itself. Memorial Day was only mildly down. Good Friday and Easter were normal or better. The days after each holiday were back to normal. Limits: this is one year, one observation per holiday, it counts when people accepted and not when the request was sent, and it also moves with how many requests went out in the days before.

**There is no history for Thanksgiving, the day after it, or Christmas.** In November and December 2025 we were sending almost nothing (183 and 522 records in those whole months), so those days show zero or one acceptance against a typical 10 to 20, which says nothing. Whether the day after Thanksgiving is good is something this year can answer: HeyReach will be sending on November 26 and 27, and its webhook records the true send time, provided the analysis is changed to use it (7.1, point 4).

Proposed starting calendar, all editable:

| Rule | Days |
|---|---|
| No send | New Year's Day, Memorial Day, July 4, Labor Day, Thanksgiving Day, Christmas Eve, Christmas Day |
| Light | New Year's Eve, December 26 to 30, July 3 or the observed July 4 holiday, the Friday before Labor Day |
| Normal, and watched | Day after Thanksgiving, MLK Day, Presidents' Day, Good Friday, Easter, Juneteenth, Columbus / Indigenous Peoples' Day, Veterans Day, Halloween |

**Learning from each holiday.** The calendar page keeps a row per holiday per year: what was sent, the accept rate, and what that weekday normally gets. A No-send day produces no evidence, so Light is the way to test a day you are unsure about. Holiday-flagged days are left out of the ordinary weekday statistics in 7.4 so they do not distort them.

### 7.8 Placing each item

The planner runs every 15 minutes and whenever an item is added, edited or released from hold. For each account:

1. **Build the day numbers** for the next 14 days: the default or learned week, then calendar rules, then holiday make-up, then warm-up scaling, then the small daily variation. Check 60 a day, 215 a week and the seven-day ceiling.
2. **Split each day** into windows using the current shares.
3. **Assign items**, oldest approval first. Each item is assigned to Prime or to an off-prime window at random, in the proportions above, within its hypothesis group. It takes the nearest day with room in that kind of window. Where an account serves several groups, each group's items go to that group's stronger days first.
4. **Pick exact times** inside each window using the spacing rule.
5. **Schedule the like** 3 hours or 2 days before.

If an item misses its time (cap reached, account paused, worker down), it is re-planned into the next suitable window. It is never sent late in a catch-up burst. After an outage the engine re-plans everything overdue before it sends anything.

A request waits at most 7 days for its window (a setting). Anything older shows on the status page so a person can decide. Follow-ups to warm contacts use a shorter limit, and `immediate` items skip the planner.

### 7.9 Closing the loop

The ledger records, for every send, the planned window, whether it was a prime, test or trickle send, and later the acceptance. The offline analysis should read send times from the ledger from now on, which also removes the problem in 7.1 for every account once it is on Unipile. One caution for whoever updates it: Unipile reports acceptances up to six hours late, so the time of acceptance is approximate; the date is reliable.

Two smaller rules carried over from the first version: an optional limit of 3 requests per target organization per customer per day, so six people at one hospital do not get the same pitch in the same evening; and the tier of each LinkedIn account (free or paid) is recorded at onboarding, because the note limit depends on it.

---

## 8. Never sending twice

Seven independent layers. Each one alone would stop most duplicates; the point of having seven is that a bug in one does not reach LinkedIn.

| # | Layer | Stops |
|---|---|---|
| 1 | Deterministic outbox id | The same queue item or the same typed reply being queued twice (double-click, page retry, two tabs, job overlap) |
| 2 | Claim transaction with a lease | Two workers, or a restarted worker, picking up the same item |
| 3 | Send lock created before the call | Any second attempt for the same account, person and action, whatever path it came from |
| 4 | Ledger and lock lookup by LinkedIn member id | The same person reached through two differently spelled URLs |
| 5 | Live LinkedIn check before each invite | Inviting a connection, or someone with an invite pending, including invites the BDR sent by hand and anything HeyReach sent that we never recorded |
| 6 | No automatic retry on an unknown outcome | A timeout turning into a second send |
| 7 | AI gate with recent history in view | Near-duplicates: reworded versions of something already sent, or a message that ignores the conversation so far |

### 8.1 One identity for a person

- **One URL normalizer**, in one backend module, used at enqueue and nowhere reimplemented: lower-case, drop protocol, `www.`, country subdomain, query string, fragment and trailing slash, decode percent-encoding, keep `/in/{slug}`. The four existing normalizers are retired as pages are touched.
- **The LinkedIn member id is the real key.** People change their profile URL; the member id does not change. Locks and ledger lookups use the member id as soon as it is resolved, and the URL key before that.

### 8.2 Hard checks (not adjustable by sensitivity, always on)

| Check | Result |
|---|---|
| Recipient is on `dnc_organizations` or a do-not-contact list | Cancel |
| Text is empty, or over the limit (invite note over 300 characters, or over 200 on a free account) | Hold |
| Unfilled placeholder: `{...}`, `[...]`, `<...>`, the words `undefined`, `null`, `NaN`, `first_name`, `FIRSTNAME` | Hold |
| Leftover AI wrapper: starts with "Here is", "Sure,", "As an AI", or is wrapped in quotation marks or contains markdown | Hold |
| Greeting name does not match the first name on the LinkedIn profile | Hold |
| A lock or ledger row exists for this account and person (invite), or this account, person and text (message) | Cancel as duplicate |
| Another BDR at the same customer contacted this person within 75 days (today's rule from `message-filter-logic.js`) | Hold |
| This account sent this person an unprompted message within the minimum gap (suggested 3 days) with no reply in between | Hold |
| The person has replied since this item was queued | Cancel as `replied`. A scripted follow-up must not land after they answered. |
| Message mentions a different client's name or product than the sending customer | Hold |
| Sending account is paused, disconnected, or not on Unipile | Leave in queue |

---

## 9. The AI gate ("would this embarrass us?")

### 9.1 What it is for

The hard checks catch what a rule can describe. The AI gate reads the message the way a recipient would and catches what a rule cannot: a message that makes no sense, addresses the wrong kind of person, repeats something already said in different words, contradicts the conversation, or is plainly broken. It is not a proofreader. Small spelling and grammar slips pass at every setting except the strictest.

It reviews **every** outbound item: invites, messages, follow-ups, and replies typed by a person.

### 9.2 When it runs

- **Early**, when the item enters the outbox, so a hold appears while there is still time to fix it.
- **Again just before sending** if the text changed, the recipient changed, or the verdict is older than a set age (suggested 3 days), or if something new was sent to or received from that person since the verdict.

A verdict is tied to the `contentVersion` it reviewed. The claim transaction refuses to send a version that was not reviewed.

### 9.3 What it sees

- The message, its kind and the character limit.
- The sender: name, company, the client's one-line description.
- The recipient as LinkedIn shows them: name, headline, current company.
- The hypothesis group name and what the message is supposed to achieve.
- **The last several things sent to and received from this person by anyone at this customer**, from the ledger and the conversation record. This is what makes it able to judge a near-duplicate or a tone-deaf follow-up.

### 9.4 What it returns

Strict JSON, validated before use:

```json
{
  "severity": 0,
  "categories": [],
  "reason": "one sentence a busy person can act on",
  "suggested_fix": "optional"
}
```

`severity` is 0 to 100 with anchors written into the prompt: 90 and up, certain to embarrass; 70 to 89, likely; 50 to 69, possible; 30 to 49, a polish issue; under 30, fine. The prompt instructs it to score ordinary typos and grammar under 30.

Categories: `duplicate_or_repeat`, `wrong_person_or_company`, `broken_template`, `ai_artifact`, `nonsense_or_truncated`, `ignores_conversation`, `wrong_client_reference`, `offensive_or_insensitive`, `factual_howler`, `wrong_language`, `spelling_grammar`.

### 9.5 The sensitivity dial

The model always returns a number. The setting decides what number holds a message. Turning the dial therefore changes nothing about the model or the prompt, and takes effect immediately.

| Setting | Holds at severity | In practice |
|---|---|---|
| 1 Minimal | 90+ | Only certain disasters |
| 2 Low | 75+ | Likely embarrassments |
| 3 Standard (suggested default) | 60+ | Anything a careful colleague would stop |
| 4 High | 45+ | Adds awkward or off-target messages |
| 5 Strict | 30+ | Adds noticeable grammar and phrasing problems |

Settings live in `system_settings/linkedin_engine.gate`, with optional overrides per customer and per message kind (for example Strict for a new client's first two weeks, Standard for typed replies). Individual categories can be switched off or given their own threshold.

Because every verdict is stored with its severity, an admin page can show "at setting 2 this week, 14 messages would have been held; at setting 4, 61" with the actual messages. That is how to choose the setting with evidence.

### 9.6 Failure behaviour

- Invalid JSON or an error: one retry. A second failure holds the message with reason `ai_unavailable` and alerts. The gate never fails open.
- If more than a set share of one customer's messages are held in an hour (suggested 30%), the engine pauses that customer and alerts. A sudden wave of holds usually means a bad batch upstream, and the right response is to stop and look.
- Human-typed replies: the gate runs while the person is still on the page. If it flags the reply, the page shows the reason and asks "send anyway?" rather than silently parking a live conversation. The override is logged with the person's name. Decision in section 17.

### 9.7 Model and cost

The backend already has what this needs: OpenRouter helpers (`askLlama` with JSON mode), a model registry in `config/ai_models.js`, and automatic cost logging to `ai_usage_ledger`. The existing `/api/connect-queue/ai-review` already uses Llama 4 Maverick for a grammar-and-fact review. Start the gate on that model, since it is already wired for this kind of review, and make the model a setting so it can be swapped (the registry also has Claude Haiku 4.5, Qwen3 and DeepSeek V3). Each check is a prompt of roughly a thousand tokens and a short reply. I have not compared the models' prices or priced a check; the shadow run in the next paragraph will give the real per-message cost from `ai_usage_ledger` and show which model catches the seeded mistakes.

**Calibrate before it guards anything.** Run the gate in shadow mode over several thousand messages HeyReach already sent, and over the current queue. Read what it would have held at each setting. Feed it a set of deliberately broken messages (wrong name, placeholder, repeat) and confirm it catches every one. Only then turn it on.

The existing `mistake_queue.html` is the natural home for held messages: it already shows flagged items for a person to fix or release.

---

## 10. Replies and other incoming events

### 10.1 Receiving

The web service has three replicas and any of them can receive a webhook. The sandbox keeps events in memory, which cannot be used for production. The production receiver does three things and returns:

1. Verify the signature.
2. `create()` the document `unipile_events/{evt_id}` with the raw body. If it already exists, this is a redelivery; return 200.
3. Return 200.

Processing happens after that, from the stored event, and is safe to repeat. The worker also sweeps for stored events that were never processed.

### 10.2 What each event does

| Event | Action |
|---|---|
| `message.new`, not from us | Update the conversation record. Create the reply alert (`linkedin_reply_alerts`). Write the `MESSAGE_REPLY_RECEIVED` activity event. **Cancel every pending outbox item to that person from that account.** Stop email follow-ups the same way the existing follow-up service does on a reply. Stamp `repliedAt` on the ledger row. |
| `message.new`, from us | Match it to a ledger row by chat and text. No match means the BDR typed it in LinkedIn directly: record it in the ledger as `source: manual_linkedin` so the record of what was sent stays complete. |
| `relation.new` | Add to `linkedin_relations`. Find the matching invite in the ledger and stamp `acceptedAt`. Write `CONNECTION_REQUEST_ACCEPTED` with a deterministic id. Queue the follow-up message if the hypothesis variation has one. |
| `account.status.disconnected` or `errored` | Mark the account, pause its sending, alert an admin, email the client a reconnect link. Queued items keep their place and are re-planned on reconnect, with caps, so nothing bursts. |
| `account.status.running` | Mark the account, resume, re-plan. |

### 10.3 The safety net

Webhooks can be missed and acceptances arrive late. So the worker also polls, at randomized times, per account:

- Every 30 minutes (matching today's inbox sync): chats changed since the last check, compared with what we stored.
- Every few hours: recent relations, compared with pending invites in the ledger.
- Daily: Unipile's event list for the last 48 hours against `unipile_events`, replaying anything missing.

All three feed the same processing functions as the webhooks, and those functions use deterministic ids, so an event seen by both a webhook and a poll is recorded once.

### 10.4 Answering

`index_admin.html` and `company_review_replies.html` keep their layout. The send button calls `POST /api/linkedin/reply` with `{ accountDocId, chatId or recipient, text, clientRequestId }` in place of `/heyreach/inbox/send-message`. The backend routes by the account's `provider`, so one page serves accounts on either service during the migration.

An improvement falls out of this. Today HeyReach webhooks carry no conversation id, so a page sometimes has to sync before it can reply, and `/heyreach/inbox/send-message` writes nothing to Firestore, so sent replies are recorded separately by the page. With Unipile the `message.new` event carries the chat id, and every reply goes through the outbox and lands in the ledger.

For existing pages to work on day one, each conversation is also written to `heyreach_inbox` in the shape those pages already read (`{customerId}_{chatId}`, `lastMessageSender`, `bdrEmail`, the message list), with `provider: 'unipile'` added.

---

## 11. Connecting accounts and client login

### 11.1 Two ways to log a client in

| | Hosted Auth | Custom Auth |
|---|---|---|
| What the client sees | A Unipile-run login page reached from a link we generate (can be put on our own domain) | Our existing form in `public/linkedin_connect.html` |
| Who handles 2FA, app approval, captcha | Unipile | Us, relaying each checkpoint |
| What we store | Nothing secret | Nothing if we pass credentials straight through. Today we store a 2FA key, encrypted. |
| Effort and fragility | Low. Unipile maintains it as LinkedIn changes its login. | Higher. Every new LinkedIn checkpoint is ours to handle. |

**Decided (2026-11-09): the client login launches from our own page.** The client opens our existing invite link (`public/linkedin_connect.html`), sees our branding and instructions, and presses a button that opens Unipile's hosted login. When they finish, Unipile returns them to our page, which confirms the account is connected. We handle no passwords and store no 2FA keys. Unipile's login page can also be served from a domain of ours, so the address bar never shows another company's name; worth setting up before the first client uses it.

### 11.2 Flow

1. Admin clicks "Connect with Unipile" on the account in `email_controls.html` (or sends the client a link from `linkedin_account_setup.html`).
2. Backend creates a hosted-auth link with a `state` value that identifies the `linkedin_accounts` document, a short expiry, and the proxy country matching what the account uses today.
3. Client logs in. Unipile calls us back with the `account_id`.
4. Backend stores `unipileAccountId` and `unipileStatus`. **`provider` stays `heyreach`.** Linking and going live are separate steps on purpose.
5. Backend verifies: fetch the account's own profile from Unipile and confirm it is the LinkedIn profile recorded on the account document. A client who logs into the wrong LinkedIn account would otherwise send one person's messages under another's name.
6. Record `accountTier` and connection count (for warm-up).

Reconnection after a disconnect uses the same link with the existing `account_id`.

### 11.3 What goes away

Per-customer HeyReach API keys, the three campaigns per BDR, campaign and list ids, the campaign builder, "Audit & Fix" for campaign ids, the daily resume job, the reserve queue's HeyReach top-up. A BDR on Unipile needs a LinkedIn account record with a `unipileAccountId` and caps, and nothing else.

---

## 12. Reporting: a strict record, and nothing breaks

### 12.1 The record

`linkedin_sent_ledger` is the source of truth for what was sent: exact text, exact time, sender, recipient, who approved it, what the AI said, and which scheduling arm it was in. Only the engine writes it. The HeyReach history is backfilled into it (section 14.2) so that reports spanning the changeover have one source.

### 12.2 Keeping about 75 pages working without touching them

Seventy-five pages and several backend services read `heyreach_activity` by `eventType`; seventy read `heyreach_inbox`; fifty use `connect_queue.pushed_to_heyreach`. Rewriting them all before the first client can move would delay the migration and risk the reports. So the engine also writes what those pages expect:

| Existing data | What the engine writes |
|---|---|
| `heyreach_activity` events | The same `eventType` strings (`CONNECTION_REQUEST_SENT`, `CONNECTION_REQUEST_ACCEPTED`, `MESSAGE_SENT`, `MESSAGE_REPLY_RECEIVED`, `EVERY_MESSAGE_REPLY_RECEIVED`), the same field names, plus `provider: 'unipile'`, `ledgerId` and `bdrEmail`. Document ids are deterministic (`unipile_{ledgerId}_{eventType}`) so a retry cannot double-count. |
| The join from an event to a BDR (`linkedInAccountId` to `linkedin_accounts.heyreachAccountId`) | For a migrated account the event carries the account's existing HeyReach account id in `linkedInAccountId`, and the Unipile id in a new field. Existing joins keep resolving. |
| `connect_activity/push_{id}` | Written at enqueue, as today. |
| `connect_queue.pushed_to_heyreach`, `heyreach_push_date` | Still set at enqueue so every page that filters on them behaves the same, alongside new, honestly named fields (`outboxId`, `sendProvider`, `sendStatus`, `sentAt`). |
| `heyreach_inbox` conversations | Mirrored as described in 10.4. |
| `heyreach_contacts` (first-degree network) | Mirrored from `linkedin_relations`. |

This is a bridge, and the names will be misleading for a while. Once every client is on Unipile, pages can be moved to the ledger and the neutral collections at leisure, and the mirror switched off.

One real improvement arrives immediately: today "sent" means "HeyReach's webhook reached us". After the move it means "LinkedIn accepted the request at this second".

### 12.3 Billing

`cost_revenue_tracking.html` and the nightly `nightlyClientDashboardCalc` function bill from `heyreach_activity` counts ($1.60 per `CONNECTION_REQUEST_SENT`, `MESSAGE_SENT` or `INMAIL_SENT`; $1.00 per `CONNECTION_REQUEST_ACCEPTED`). Money is attached to this mirror, so:

- A nightly job compares ledger counts with mirrored event counts per customer per day, and alerts on any difference.
- During the changeover, acceptances are the double-count risk: an invite HeyReach sent last week is accepted this week, and both HeyReach and Unipile may report it. Acceptance events get a deterministic id per account and person, and the HeyReach webhook handler is changed to use the same id.
- For a migrated account, HeyReach webhook events are stored but marked `shadow: true` and excluded from counts. Unipile sees every chat and every new connection on the account regardless of which tool sent the original invite, so it becomes the single source for incoming events the moment the account flips.

### 12.4 The analysis pipeline

`analysis_results.html` reads the output of an offline R batch, which is fed by the export from `analysis_data.html`. Two changes are needed there:

- **Now, independent of the migration:** the export's send-time field mixes two clocks, which makes the timing tables unreliable (section 7.1). Take the send time from `CONNECTION_REQUEST_SENT` events instead.
- **Before the first client moves:** make the export read the ledger (or the mirrored events) for Unipile accounts. Otherwise migrated clients silently drop out of the analysis.

---

## 13. Editing, cancelling, pausing, monitoring

### 13.1 Editing a message still on its way (`sent_messages.html`)

Today an edit has to be pushed into HeyReach and may or may not arrive before HeyReach sends. Afterwards the message sits in our own queue until the second it is sent, so an edit is one transaction:

- Allowed while the item is `queued`, `scheduled` or `held`. Refused once it is `claimed`.
- Updates the text, raises `contentVersion`, clears the AI verdict so it is reviewed again, writes the audit row to `connect_message_edits`, and updates `connect_queue.message_to_contact`.
- The sender re-reads the item inside its claim transaction, so an edit and a send cannot cross.

The page can also show things it never could: the planned send time, why that time was chosen, and buttons for "cancel", "send sooner" and "hold".

### 13.2 Stopping

| Scope | Switch | Takes effect |
|---|---|---|
| Everything | `system_settings/linkedin_engine.enabled` | Next claim, under a minute |
| One customer | `customerList.linkedinSendingEnabled` (alongside today's `heyreachEnabled`) | Same |
| One LinkedIn account | `linkedin_accounts.preventAutoActivation` (existing) | Same |
| One prospect | Cancel their outbox items; add to do-not-contact | Immediately |

`outreach_stop_button.html` keeps working: its endpoints set the same flags, and for accounts still on HeyReach also pause the HeyReach campaigns as today. Pausing no longer depends on a third party's API call succeeding, because the flag is read inside the transaction that claims each send.

Automatic stops:

| Trigger | Scope paused |
|---|---|
| Ledger write fails after retries | Everything |
| LinkedIn limit response (`cannot_resend_yet`, provider 429) | That account, 24 hours |
| Three consecutive send failures | That account |
| Account disconnected | That account |
| AI hold rate above threshold | That customer |
| A send-lock collision at step 5 | That customer, plus an alert, because it means an earlier check has a hole |
| Sent count for an account exceeds its cap in the nightly audit | Everything |

### 13.3 Watching it

A single admin page, "Engine status": per account, queue depth, what is planned for each of the next seven days, sent today and this week against caps, items held and why, unknown outcomes, account connection state, webhook delay, and the last 50 engine decisions. It also shows the timing status for each client and hypothesis group (section 7.4), with the controls to pin or reset a plan. A second page, "Sending calendar", holds the holidays and the make-up policy (section 7.7). Plus a daily digest email through the existing summary-email service, and an immediate alert for every automatic stop.

A nightly audit compares, per account: ledger rows, Unipile's own list of sent invitations, and the mirrored events. Any invite Unipile lists that the ledger does not have is a send we failed to record, and is the most important alert in the system.

### 13.4 Railway specifics

- The engine's jobs register in the worker's cron list. Because all logic is transaction-claimed, a second worker replica would be safe; it is not required.
- On deploy, the worker receives a stop signal. The engine must stop claiming, let an in-flight Unipile call finish (up to 30 seconds), and write the result. Anything cut off is left as a lock in `attempting`, which the reconciler resolves.
- The Unipile webhook points at the public web domain. It needs the raw request body for signature checking, which the sandbox route already handles.
- New variables: none required beyond the existing `UNIPILE_API_KEY` and `OPEN_ROUTER_API_KEY`. The webhook signing secret is currently cached in memory per replica; store it as a variable or in Firestore so all three web replicas agree.
- Before relying on the worker, confirm `SERVICE_ROLE` is set to `worker` on that service and `web` on the other two. I saw the variable exists on each but did not read the values. If the web replicas ran crons, the existing unlocked auto-push would already be running three times over.
- `heavy-api` is not involved.

---

## 14. Switching a client from HeyReach to Unipile

### 14.1 The principle

A LinkedIn account has exactly one sender at any moment, and the handover has a gap of silence in the middle, not an overlap. A day with no sends costs almost nothing. One prospect receiving the same invite from two systems is the outcome this whole plan exists to prevent.

### 14.2 Before any client moves (once)

1. **Backfill the ledger and the locks** from HeyReach history: `connect_activity`, `heyreach_activity` send events, `heyreach_inbox` outbound messages, and `heyreach_contacts`. Every person any account has ever invited or messaged gets a lock. Where a record has a URL but no member id, the lock is keyed by the normalized URL and upgraded when the person is next resolved.
2. Fix the HeyReach webhook handler to use deterministic ids, and add the `provider` field everywhere it will be read.
3. Make the 6 AM campaign-resume job, the auto-push, the legacy hourly processor, the reserve top-up, and `/api/mass-messages/add-lead` all skip any account whose `provider` is `unipile`. Until this is done and tested, no account may be flipped: the resume job would restart a migrated account's HeyReach campaigns the next morning.
4. Run the engine in dry-run for at least a week (section 15, phase 1).

### 14.3 Per client

| Step | Action | Gate to pass before the next step |
|---|---|---|
| 1 | Tell the client what is happening and that they will be asked to log in to LinkedIn once. | |
| 2 | Link each BDR's LinkedIn account to Unipile (section 11). `provider` stays `heyreach`. | Each linked profile matches the account record. Tier recorded. |
| 3 | Sync from Unipile: connections into `linkedin_relations`, pending sent invitations, recent chats. | Counts look sane against `heyreach_contacts`. |
| 4 | Run the engine in dry-run for this client for two or three days. Review what it would have sent, when, and what the gate would have held. | A person has read the dry-run list and found nothing wrong. |
| 5 | **Stop feeding HeyReach**: set the account to "draining". Auto-push and immediate-send pages stop adding leads for it. New approvals wait in the outbox. | |
| 6 | **Let HeyReach empty.** Leads already inside a HeyReach sequence finish (the sequence waits 3 hours or 2 days after the like, then invites). Watch the in-process count (`/api/bdr/in-process-leads`). | In-process count is zero, or the remainder has been removed from the campaigns and confirmed removed. |
| 7 | Pause the HeyReach campaigns and set `preventAutoActivation`-style protection so nothing restarts them. Wait one quiet day. | No `CONNECTION_REQUEST_SENT` or `MESSAGE_SENT` from HeyReach for this account in 24 hours. |
| 8 | Top up the backfill for this client with everything HeyReach sent since step 14.2. | Lock count matches send-event count. |
| 9 | **Flip** `provider` to `unipile`. Engine starts at warm-up caps, counting HeyReach's last seven days against the weekly cap. Gate at a stricter setting for the first two weeks. | |
| 10 | Watch daily for a week: sends against caps, holds, unknown outcomes, replies arriving in the reply pages, events appearing in the client portal, billing reconciliation. | Seven clean days. |
| 11 | Disconnect the LinkedIn account from HeyReach. | 21 days after the flip, so HeyReach's last pending invites have been accepted or withdrawn. The engine's own withdrawal job covers them from here. |

Between steps 9 and 11 the account is logged in through both services while only Unipile sends. Two automation sessions on one LinkedIn account is a risk I cannot quantify from documentation, so the pilot should watch for forced logouts, and if they occur, step 11 moves up and the engine takes over withdrawing old invites sooner.

The safer choice at step 6 is to drain, not to pull leads back out and re-queue them. A lead HeyReach is minutes from sending is the one most likely to be sent by both systems. The live LinkedIn check before every invite is the last line of defence either way.

### 14.4 Rolling back

Rollback is the same procedure in reverse and equally unhurried: pause the account in the engine, wait for the outbox to show nothing `claimed` or `sending`, resolve any unknown outcomes, set `provider` back to `heyreach`, resume campaigns. Items in the outbox go back through the existing auto-push. The ledger and locks stay, and the existing auto-push must consult them once they exist, so that a rollback cannot re-send what Unipile sent.

### 14.5 Order of clients

1. One internal Health Luminate BDR account.
2. All internal accounts.
3. One client with moderate volume, a single BDR, and a contact who will tolerate a login request and tell us if anything looks off.
4. Waves of three to five clients, a week apart, largest last.

Every wave uses the same checklist and the same gates. No wave starts while the previous one has an open issue.

---

## 15. Build order

Each phase ends with something verifiable and leaves production sending untouched until phase 3.

| Phase | Build | Sends anything? | Done when |
|---|---|---|---|
| 0. Foundations | Shared URL normalizer. `provider` field and the guards in 14.2 step 3. Durable Unipile webhook receiver. Account linking (shadow). Ledger, lock and outbox schemas with security rules. History backfill. HeyReach webhook de-duplication. | No | Backfill counts reconcile with `heyreach_activity`. A linked account's replies appear in `unipile_events`. |
| 0b. Fix the timing analysis | Change the export to take send time from `CONNECTION_REQUEST_SENT` events and re-run it (section 7.1). Independent of everything else and worth doing first. | No | We know whether nights, Thursday and Sunday hold up on true send times. |
| 1. Engine, dry-run | Planner with the default week, windows and the 80 / 20 / 10 split, spacing, holiday calendar and make-up, the Sending calendar page. Sender with every step except the Unipile call, AI gate in shadow, reconciler, engine status page. | No | A week of dry-run plans reviewed, including a simulated holiday week. Gate calibrated on historical and seeded-bad messages. Cap arithmetic verified against the plan. |
| 2. Internal pilot | Real sends for one internal account at warm-up caps, including the like-then-request step. Replies through the new reply endpoint. Editing and cancelling from `sent_messages.html`. Kill switch. | Yes, one account | Two weeks: zero duplicates, zero unrecorded sends in the nightly audit, every reply seen, reports and billing reconcile. |
| 3. First client | The runbook in 14.3, once. Immediate-send pages routed through the outbox. Disconnect and reconnect flow tested for real. | Yes | Seven clean days and the client's portal numbers match the ledger. |
| 4. Waves | Remaining clients. Weekly self-adjustment of windows and day quotas switched on once the first sends are 14 days old. Follow-up sequences if wanted. | Yes | All accounts on `provider: unipile`. |
| 5. Retire HeyReach | Remove HeyReach crons, routes and pages (inventory file). Move reports from the mirror to the ledger. Cancel HeyReach after the last account's 21-day window. | | No code path references a HeyReach API key. |

Tests that must exist before phase 2, because they are the ones that protect us from embarrassment: two senders racing for one item send once; a kill between lock and ledger is recovered without a re-send; a timeout produces `outcome_unknown` and no retry; the same person under two URL spellings is blocked; an edit during a claim is refused; caps hold when the planner is wrong; a replayed webhook is counted once; a reply cancels pending follow-ups; an AI outage holds and does not send; no day passes 60 and no week passes 215 whatever the calendar, make-up and adjustments ask for; a No-send day sends nothing scheduled; two sends from one account are never closer than the minimum gap.

---

## 16. How we could embarrass ourselves, and what stops it

| Risk | Prevention |
|---|---|
| Same invite or message sent twice | Section 8, seven layers |
| HeyReach and Unipile both send to one prospect during cutover | One-sender rule, drain and quiet day, backfilled locks, live LinkedIn check |
| HeyReach campaigns silently restart on a migrated account | Guard in the resume job (14.2 step 3) before any flip |
| Wrong name, unfilled placeholder, AI preamble in a message | Hard checks, then the AI gate |
| Follow-up sent after the prospect already replied | Reply cancels pending items; re-checked at send time |
| Follow-up sent to someone who declined or asked us to stop | AI gate sees the conversation; do-not-contact check |
| A burst of sends after an outage or a reconnect | Re-plan, never catch up; caps in the claim transaction |
| Account restricted by LinkedIn | 60 a day and 215 a week enforced in the transaction, a ceiling on any seven days during holiday make-up, warm-up, random spacing of a few minutes, no overnight sending, automatic 24-hour pause on a limit response, Unipile dashboard limits as backstop |
| Requests go out on Christmas morning | Holiday calendar with No-send days, visible and editable twelve months ahead |
| Client logs into the wrong LinkedIn account | Profile match check at linking |
| Messages sent from a disconnected or paused account's backlog all at once | Paused items are re-planned under caps |
| A bad batch of generated messages goes out | AI hold-rate breaker pauses the customer |
| We cannot say what was sent | Ledger written with every send; engine stops if it cannot write; nightly audit against Unipile's own list |
| Client is billed twice or not at all | Deterministic event ids; nightly ledger-to-mirror reconciliation |
| Reports go blank for migrated clients | Compatible events and conversations (section 12) |
| Replies missed | Webhook stored before acknowledging, plus three polling safety nets |
| The schedule is built on a timing belief that turns out to be wrong (section 7.1) | The engine learns only from true send times in its own ledger, test sends are chosen at random, and a window or day can be demoted as well as promoted |
| Six people at one organization get the same pitch in an hour | Per-organization daily limit |

---

## 17. Decisions

### Decided on 2026-11-09

| Topic | Decision | Where |
|---|---|---|
| Client login | Launched from our own page (Unipile's hosted login opened from our invite-link page) | 11 |
| Caps | 60 connection requests a day, 215 a week, per account. Requests only, not all messages | 7.2 |
| Default week | Sunday 50, Monday 15, Tuesday 35, Wednesday 35, Thursday 50, Friday 15, Saturday 15 | 7.2 |
| Prime times | Nights. 80% in prime, 20% at other times until shown statistically not to work, then a 10% trickle | 7.3, 7.4 |
| Self-adjustment | By hypothesis group, from what is working | 7.4 |
| Spacing | A few minutes between sends, varied | 7.5 |
| Liking posts | Kept, before the connection request | 7.6 |
| Holidays | No sending on holidays, volume made up on other days, calendar and make-up policy editable globally | 7.7 |

### Defaults I chose that you should confirm

1. **Seven-day ceiling during holiday make-up: 240.** Making up a holiday means some seven days in a row exceed 215 (section 7.7). At 215, nothing is made up for an account already at its full week.
2. **Overnight (11 PM to 5 AM Central) is closed.** Nights means 6 PM to 11 PM.
3. **Windows run on the Central clock for every account.** A Pacific-time BDR's "night" therefore starts at 4 PM their time. The alternative is each BDR's own evening.
4. **The week runs Sunday to Saturday.**
5. **"Shown not to work" means:** at least 150 sends, 95% confidence, two weekly reviews in a row, measured as accepted within 14 days.
6. **Warm-up** for new and newly migrated accounts: one third, half, three quarters, then full.
7. **Starting holiday calendar** as listed in 7.7, including the day after Thanksgiving as a normal day.
8. **"Liking posts before commenting"** read as liking before connecting.

### Still open

1. **Fix the timing analysis first?** Section 7.1: the history behind "nights, Thursday, Sunday" does not measure send time. A small change to the export would show whether it holds up. I recommend doing it before the engine is built.
2. **AI gate on typed replies**: warn and allow override (suggested), or hold like everything else?
3. **Pilot client** after internal accounts: who?
4. **Free LinkedIn accounts**: send requests without a note, or require a paid account for anything we run? 215 a week is not possible with notes on a free account.

---

## 18. What I verified and what I did not

**Read directly in code or data:** the sandbox page and its backend routes; the auto-push logic including its duplicate and already-connected checks; the message-queue claim pattern; the cron schedule and the `SERVICE_ROLE` guard; the campaign sequence definitions; the kill-switch routes; the campaign-resume job and its `preventAutoActivation` handling; the absence of a `push-single` route; the Railway service layout and replica counts.

**Computed from the contact-level exports** (`probit_dataset_2026-10-07.json` and `probit_dataset_2026-11-04.json` in `Downloads`, read with throwaway scripts in the temp folder; nothing in the repos was changed): every figure in sections 7.1, 7.2 and 7.7. I read how `first_outreach_sent_at` is filled in `analysis_data.html` and confirmed the October export reproduces the published timing figures. I did not see the R script that produces the published tables, so "built from this field" rests on that reproduction and on the export having no other send-time field.

**Reported by codebase exploration and spot-checked, not read line by line:** the behaviour of individual report pages and client portals; the full list of services that read `heyreach_activity`; the page inventory in the companion file, which is a pattern match.

**From Unipile's documentation, not yet tested by us:** the limits, the webhook retry schedule, the 6-hour acceptance delay, error codes, Hosted Auth. The sandbox has exercised lookup, invite, messaging and webhooks.

**Not verified, and to be settled before or during the pilot:**

- Whether LinkedIn member ids returned by Unipile are identical across our accounts for the same person. I believe they are for standard LinkedIn; the lock design depends on it, so test with two accounts looking up the same profile.
- What Unipile sends when an account first connects (a flood of historical `message.new` events would need filtering by date).
- How LinkedIn reacts to one account being logged in through HeyReach and Unipile at once.
- Whether Unipile can use a stored 2FA key the way HeyReach does, which matters for unattended reconnection.
- Unipile pricing. I did not look at it and have stated no figures.
- The `SERVICE_ROLE` value on each Railway service.
- Whether `jobs/heyreach-auto-resume.js` is still scheduled on a Windows machine somewhere. If it is, it is another thing that could restart campaigns.
- Whether nights, Thursdays and Sundays are better on true send times. Needs the `CONNECTION_REQUEST_SENT` events in Firestore, which I could not read.
- Whether live HeyReach campaigns all use the builder's default 1 PM to 10 PM Central schedule.
- How LinkedIn counts its weekly limit (rolling seven days or otherwise), and how it treats 215 a week on our accounts.- The second copy of the site: `c:\repos\HealthLuminateSiteFromLocal` has its own copies of `connect_push.html`, `fast_connect_review.html`, `sent_messages.html`, `index_admin.html` and `company_review_replies.html` among 149 files that mention HeyReach. If that site is live, its pages need the same changes. I did not inventory it.

---

## 19. Implementation status (what was built, and where it differs from the plan)

Everything below ships **off and in dry-run** (`system_settings/linkedin_engine`: `enabled:false`, `dryRun:true`). Nothing sends until the engine is on, dry-run is off (both need the typed word SEND), and an account has been moved to the engine step by step.

**Backend (`RailwayCLemail`)**

- `services/linkedin_engine/`: settings, Central-time utilities, URL keys, calendar and make-up, week plan, send windows, learned timing, Unipile client, store, hard checks, AI gate, outbox, planner, compat mirrors, sender, inbound webhook handling, reconciler, account and cutover logic.
- `routes/linkedin_engine_routes.js`, mounted at `/linkedin-engine`: public (webhook, hosted-login start and callback) and admin routes (status, settings, stop, outbox actions, plan, calendar, timing, account cutover, backfill, gate preview, webhook registration, ledger, log, `POST /invites` for hosted-login invites).
- Guards on the HeyReach side: a HeyReach write for an account the engine owns is refused (`ENGINE_OWNED`, HTTP 409); the HeyReach acceptance and reply webhooks skip engine-owned accounts; the reserve queue, auto-reply and message-queue services route engine-owned senders through the outbox; inbox replies for engine-owned accounts go through the outbox. Every lookup failure blocks rather than falls through to HeyReach.
- Engine collections are in `BLOCKED_COLLECTIONS`, so the generic collection API cannot touch them.
- 64 automated tests: `npm run test:engine` (races, crash recovery, timeouts, duplicate URL variants, edits during a claim, webhook replay, reply cancellation, AI outage, no-send days, minimum gap, caps under a faulty planner, the 80/20/10 split, make-up arithmetic, cutover gates and the HeyReach guards).

**Pages (`pandonetworking`)**

- `connect/linkedin_engine_status.html`: switches and STOP, accounts and the cutover buttons with their confirmations, the queue (held, unknown outcome, waiting, dry run), limits and AI sensitivity, an AI-check tester, recent log.
- `connect/linkedin_sending_calendar.html`: holiday editing, make-up choices, how each holiday performed (acceptances against nearby ordinary days), the next fourteen days of plan, what the engine has learned with pin and reset.
- `connect/sent_messages.html`: an admin-only engine queue panel (edit, hold, release, send sooner, cancel) that appears when the viewed BDR has engine items.
- `connect/mistake_queue.html`: a "Held by the sending engine" section (edit, release, cancel).
- `connect/linkedin_account_setup.html` and `public/linkedin_connect.html`: a choice of HeyReach or hosted login; hosted-login invites open `linkedin_connect.html?p=unipile`.
- `connect/analysis_data.html`: exports `first_outreach_sent_at_source`; `connect/analysis_results.html` warns that send-time findings are trustworthy only on true send times.
- `connect/index_admin.html`: cards for the two new pages.
- `firestore.rules`: explicit denies for the engine collections and settings document (the existing catch-all would otherwise allow any signed-in user to read them). **These need deploying.**

**Differences from the plan above**

- The holiday calendar collection is `linkedin_engine_calendar`, not `linkedin_calendar`, because `crm/email_calendar.html` already stores its settings under that name.
- Hosted-login invites are created by `POST /linkedin-engine/invites` (method `unipile`), and the old `/public/connect` route refuses them.
- Chat polling and a daily replay of missed webhook events are not built. The relations poll and the nightly audit are. If a webhook is missed, an acceptance or reply can be late until the audit finds it.
- The account cache is 30 seconds per replica. The sender re-checks ownership at claim time, so a stale cache cannot cause a send through the wrong path.
- At 60 sends in a day the prime windows (about 44 at the minimum spacing) fill, so the remainder spills into the other windows.
- `connect_queue` mirroring and the invite list on the setup page use HeyReach-shaped fields.
- `functions/index.js` reserve top-up is unchanged.

**Still to verify against the Unipile sandbox before the pilot** (field names are read tolerantly, but not confirmed): profile id on lookup, `network_distance`, the invite-status and sent-invitation list shapes, the webhook payloads, and the `providers` value for the hosted-login link (override with `UNIPILE_AUTH_PROVIDERS`).

**Environment** (Railway): `UNIPILE_API_KEY`, `UNIPILE_SERVICE_KEY`, `PUBLIC_API_BASE`, `LINKEDIN_ENGINE_RETURN_HOSTS`; optional `UNIPILE_BASE_URL`, `UNIPILE_AUTH_PROVIDERS`. Then register the webhook with `POST /linkedin-engine/webhook/register` and set Unipile's own rate limits to match ours.

### 19.1 Added later: moving in-process leads, and stricter send times

- **Move In-Process Leads** (`connect/linkedin_migration.html`, `services/linkedin_engine/migration.js`, routes under `/linkedin-engine/migration`). Uses the same "in process" computation as the in-process page and email. For each lead: create the engine copy **held**, ask HeyReach to stop the lead (only an HTTP 2xx counts; a 400/404 parks the lead for a person), then release the held copy into the normal queue. Every step is recorded per lead and is safe to repeat. Leads the engine refuses (already in the sent record, do-not-contact, a bad message) are still stopped in HeyReach. Leads with no campaign id, and HeyReach "not started" leads that cannot be named, cannot be moved and are reported. Going live is refused while scanned leads remain unmoved. Moving requires the account to be at "draining" or "live", linked, and identity-checked, and needs the typed word MIGRATE. Not covered: approved messages that were never pushed to HeyReach; those go straight to the engine through the normal auto-push once the account is draining.
- **Send times in `analysis_data.html`**: `first_outreach_sent_at` is now filled only from a send event whose timestamp came from the sender. Webhook events with no sender timestamp (the handler stamps "now" when HeyReach sends none), backfilled events, and receipt-time stand-ins are ignored. Rows with no true send time are blank; the old message-log and approval times moved to `first_outreach_estimated_at` (not a send time). New columns: `first_outreach_sent_day_central`, `first_outreach_sent_hour_central`.
- **Bug fixed**: going live set `preventAutoActivation`, and the sender treated that flag as "keep this account off", which would have blocked every live account. The flag now applies only to accounts HeyReach still owns. A test covers it.


## 19.2 When LinkedIn says no: pauses (decided by the owner)

| LinkedIn / Unipile says | What happens |
|---|---|
| **Rate limited** (weekly invitation limit, 429, "too many requests") | The whole account pauses for **24 hours**. Nothing is probed during the pause. If it is limited again within 14 days the pause is **72 hours**; a third time within 14 days pauses it **until a person resumes it**. Lookups and post likes use the same rule. Reports that arrive while the pause is already running (items in flight) are the same incident, not a new strike. |
| **Already invited / invitation pending / can't resend yet** | Only **that lead** is held (`held`, code `cannot_resend_yet`). The error is recorded on the item (`sendError`), mirrored to the lead's queue row, and written to the event log as `lead_error`. The account is not paused and the daily cap is given back. |
| **Account problem** (login expired, checkpoint, disconnected) | The account is paused **indefinitely** and highlighted in red on the Engine page (banner at the top plus the row). Only a person pressing Resume lifts it. Unipile reporting "running" again, or relinking the account, does not. Going live does not lift it either. |

Implementation: `RailwayCLemail/services/linkedin_engine/pauses.js`; used by `sender.js` (sends, profile lookups, likes) and `inbound.js` (account status webhooks). A manual pause can never shorten a longer pause. Resume keeps the rate-limit strikes, so a refusal soon after resuming goes straight to the longer pause. Tests: `tests/linkedin_engine/pauses.test.js`.
