/**
 * HealthConnect Common Header Component
 * Version: 3.0.0 - Reorganized Navigation & Cache-Busting
 * 
 * Provides a beautiful, consistent header across all HealthConnect pages
 * with organized dropdown navigation sections.
 * 
 * Changelog v3.0.0:
 * - Reorganized navigation: Me, Network and Prospects, Outreach, Admin
 * - Added cache-busting versioning (?v=3.0) to all references
 * - Added LinkedIn Message Slots to admin section
 * - Added Prospect Organizations to Network and Prospects (customer-facing dashboard)
 * - Added Prospect Org Admin to Admin section (scanning/management tools)
 */

console.log('🎨 HealthConnect Header loading...');

// Configuration with dropdown sections
const HEALTHCONNECT_CONFIG = {
    brandName: 'PandoConnect',
    brandColor: '#12314C', // Navy
    accentColor: '#94AD82', // New leaf
    navSections: [
        {
            label: 'Me',
            icon: 'fa-user',
            items: [
                { label: 'About Me', href: 'about_me.html', icon: 'fa-user-circle' },
                { label: 'Campaign Settings', href: 'campaign_settings.html', icon: 'fa-cog' },
                { label: 'Manage My Data', href: 'manage_my_linkedin_data.html', icon: 'fa-database' },
                { label: 'Download My Outreach History', href: 'export_outreach_history.html', icon: 'fa-file-export' }
            ]
        },
        {
            label: 'Network and Prospects',
            icon: 'fa-network-wired',
            items: [
                { label: 'My Connections', href: 'my_leads.html', icon: 'fa-users' },
                { label: 'Harvest Pool', href: 'harvest_pool.html', icon: 'fa-seedling' },
                { label: 'Prospect Contacts', href: 'prospect_contacts.html', icon: 'fa-address-book' },
                { label: 'Prospect Organizations', href: 'prospect_organizations.html', icon: 'fa-building' },
                // Company-level pages (shown conditionally if 2+ BDRs)
                { label: 'Company Dashboard', href: 'company_results.html', icon: 'fa-building', requiresMultipleBDRs: true },
                { label: 'Company Conversations', href: 'company_review_replies.html', icon: 'fa-comments', requiresMultipleBDRs: true },
                { label: 'Company Performance', href: 'company_performance.html', icon: 'fa-chart-bar', requiresMultipleBDRs: true }
            ]
        },
        {
            label: 'Outreach',
            icon: 'fa-paper-plane',
            items: [
                { label: 'Requests for Connections', href: 'requests_for_connections.html', icon: 'fa-clipboard-list' },
                { label: 'Review Queue', href: 'connect_review.html', icon: 'fa-check-circle' },
                { label: 'Prospect Follow Up', href: 'review_replies.html', icon: 'fa-reply' },
                { label: 'Campaign Follow-up', href: 'linkedin_campaign_followup.html', icon: 'fa-rotate-left' },
                { label: 'Personal Inbox', href: 'personal_messages.html', icon: 'fa-inbox' },
                { label: 'Auto-Reply Inbox', href: 'linkedin_auto_replies.html', icon: 'fa-robot' },
                { label: 'Sent Messages', href: 'sent_messages.html', icon: 'fa-check-double' },
                { label: 'Outcomes', href: 'index.html', icon: 'fa-chart-line' },
                { label: 'Stop Outreach', href: 'outreach_stop_button.html', icon: 'fa-power-off' }
            ]
        },
        {
            label: 'Admin',
            icon: 'fa-shield-alt',
            adminOnly: true,
            items: [
                // Admin Dashboard & Guide
                { label: 'Admin Dashboard', href: 'index_admin.html', icon: 'fa-tachometer-alt' },
                { label: 'Demo: Scheduled Meetings', href: 'demo_review_replies.html', icon: 'fa-calendar-check' },
                { label: 'Catch Missed Meetings (AI)', href: 'catch_meetings.html', icon: 'fa-magnifying-glass-chart' },
                { label: 'Scan Conversations (AI)', href: 'scan_conversations.html', icon: 'fa-search-plus' },
                { label: 'Follow-Up Needed (AI)', href: 'followup_needed.html', icon: 'fa-reply-all' },
                { label: 'Engagement Score', href: 'profile_enrichment.html', icon: 'fa-star-half-stroke' },
                { label: 'divider' },
                // Message Generation & Content
                { label: 'Generate Messages', href: 'generate_messages.html', icon: 'fa-wand-magic-sparkles' },
                { label: 'Fast Batch Review', href: 'fast_connect_review.html', icon: 'fa-bolt' },
                { label: 'Elion Batch Review', href: 'elion_batch_review.html', icon: 'fa-file-import' },
                { label: 'Reserve Queue', href: 'reserve_queue.html', icon: 'fa-boxes-stacked' },
                { label: 'Mass Messages to Group', href: 'fast_prospect_message.html', icon: 'fa-users-between-lines' },
                { label: 'Mass Messages to Connections', href: 'mass_messages_to_connections.html', icon: 'fa-paper-plane' },
                { label: 'Mass Upload', href: 'mass_upload.html', icon: 'fa-cloud-upload-alt' },
                { label: 'Manage Prompts', href: 'generate_prompts.html', icon: 'fa-brain' },
                { label: 'Scraped Posts', href: 'scrapped_linkedin_posts.html', icon: 'fab fa-linkedin' },
                { label: 'Filtered Messages', href: 'filtered_messages.html', icon: 'fa-filter' },
                { label: 'divider' },
                // Contact & Search Tools
                { label: 'Prospect Org Admin', href: 'prospect_organizations_admin.html', icon: 'fa-building-circle-check' },
                { label: 'LinkedIn Contact Search', href: 'linkedin_contact_search.html', icon: 'fa-search' },
                { label: 'Contact Search by Keyword', href: 'contact_search_by_keyword.html', icon: 'fa-key' },
                { label: 'divider' },
                // Analytics & Reporting
                { label: 'Cost/Revenue Tracking', href: 'cost_revenue_tracking.html', icon: 'fa-dollar-sign' },
                { label: 'Apify Cost Tracking', href: 'apify_cost_tracking.html', icon: 'fa-robot' },
                { label: 'LinkedIn Message Slots', href: 'linkedin_message_slots.html', icon: 'fa-calendar-alt' },
                { label: 'Coverage Analytics', href: 'contact_coverage_analytics.html', icon: 'fa-chart-pie' },
                { label: 'Overall Trends', href: 'overall_trends.html', icon: 'fa-chart-line' },
                { label: 'Message History', href: 'message_history.html', icon: 'fa-history' },
                { label: 'Message Outcomes', href: 'outcomes.html', icon: 'fa-bullseye' },
                { label: 'Connect Success Analysis', href: 'analysis_results.html', icon: 'fa-lightbulb' },
                { label: 'Analysis Dataset (Probit)', href: 'analysis_data.html', icon: 'fa-database' },
                { label: 'Research Hypotheses', href: 'connect_hypothesis_documentation.html', icon: 'fa-flask' },
                { label: 'Target Contact / Exclude Rules', href: 'hypothesis_target_rules.html', icon: 'fa-crosshairs' },
                { label: 'Monthly Research Plan', href: 'monthly_research_plan.html', icon: 'fa-calendar-check' },
                { label: 'divider' },
                // Operations & Management
                { label: 'HeyReach Webhook Activity', href: 'heyreach_webhook_activity.html', icon: 'fa-bolt' },
                { label: 'Manual HeyReach Log', href: 'manual_log_heyreach.html', icon: 'fa-user-plus' },
                { label: 'Push Contacts', href: 'connect_push.html', icon: 'fa-paper-plane' },
                { label: 'BDR Setup Checklist', href: 'setup_checklist.html', icon: 'fa-clipboard-check' },
                { label: 'BDR Settings', href: 'bdr_review_settings.html', icon: 'fa-user-cog' },
                { label: 'BDR Email Change', href: 'recover_orphaned_messages.html', icon: 'fa-at' },
                { label: 'BDR Review Audit', href: 'review_review.html', icon: 'fa-clipboard-check' },
                { label: 'Weekly Summaries', href: 'email_summary.html', icon: 'fa-envelope-open-text' },
                { label: 'Harvest Pool (admin)', href: 'harvest_pool_admin.html', icon: 'fa-seedling' },
                { label: 'divider' },
                // Cleanup & Maintenance
                { label: 'Process Exclusions', href: 'process_exclusions.html', icon: 'fa-ban' },
                { label: 'Prospect Cleanup (AI)', href: 'prospect_cleanup.html', icon: 'fa-broom' },
                { label: 'Manage Org Contacts', href: 'manage_organization_contacts.html', icon: 'fa-users-gear' },
                { label: 'Cleanup Jobs', href: 'cleanup_jobs.html', icon: 'fa-chart-line' },
                { label: 'divider' },
                // Database Access
                { label: 'Health System IT Contacts', href: 'all_contacts_database.html', icon: 'fa-database' }
            ]
        }
    ]
};

// Check if user is admin
function isAdminUser(user) {
    if (!user || !user.email) return false;
    const domain = user.email.split('@')[1];
    return domain === 'healthluminate.com' || domain === 'careluminate.com';
}

// Check if user's company has multiple BDRs
let companyBDRCount = null;
let bdrCountCheckInProgress = false;

async function checkCompanyBDRCount(userEmail) {
    // Return cached value if available
    if (companyBDRCount !== null) {
        return companyBDRCount;
    }
    
    // Prevent multiple simultaneous checks
    if (bdrCountCheckInProgress) {
        return 1; // Default to single BDR while checking
    }
    
    if (!userEmail) return 1;
    
    try {
        bdrCountCheckInProgress = true;
        
        // Use CLEmail wrapper to check BDR count
        if (!window.clemailFirestore || !window.emailDB) {
            console.log('⏳ CLEmail not ready yet, defaulting to single BDR');
            return 1;
        }
        
        const { collection, query, where, getDocs } = window.clemailFirestore;
        
        // Get current user's BDR record to find their customerId
        const bdrQuery = query(
            collection(window.emailDB, 'bdr_leaders'),
            where('primaryEmail', '==', userEmail.toLowerCase())
        );
        const bdrSnapshot = await getDocs(bdrQuery);
        
        if (bdrSnapshot.empty) {
            console.log('📊 No BDR record found, defaulting to single BDR');
            companyBDRCount = 1;
            return 1;
        }
        
        const userBDR = bdrSnapshot.docs[0].data();
        const customerId = userBDR.customerId;
        
        if (!customerId) {
            console.log('📊 No customerId found, defaulting to single BDR');
            companyBDRCount = 1;
            return 1;
        }
        
        // Count all BDRs with the same customerId
        const companyBDRQuery = query(
            collection(window.emailDB, 'bdr_leaders'),
            where('customerId', '==', customerId)
        );
        const companyBDRSnapshot = await getDocs(companyBDRQuery);
        
        const count = companyBDRSnapshot.size;
        console.log(`📊 Company has ${count} BDR(s) (customerId: ${customerId})`);
        companyBDRCount = count;
        return count;
        
    } catch (error) {
        console.error('❌ Error checking company BDR count:', error);
        companyBDRCount = 1;
        return 1;
    } finally {
        bdrCountCheckInProgress = false;
    }
}

// =====================================================
// VIEWER BDR RESOLUTION
// Allows designated viewers to see pages as a BDR
// =====================================================

let _viewerBDRCache = undefined; // undefined=unchecked, null=not a viewer, object=viewer info
let _viewerBDRPromise = null;

async function resolveViewerBDR(userEmail) {
    if (_viewerBDRCache !== undefined) return _viewerBDRCache;
    if (_viewerBDRPromise) return _viewerBDRPromise;
    if (!userEmail) { _viewerBDRCache = null; return null; }

    _viewerBDRPromise = (async () => {
        try {
            // Wait up to 2s for CLEmail wrapper to be ready
            let waited = 0;
            while ((!window.clemailFirestore || !window.clemailDb) && waited < 2000) {
                await new Promise(r => setTimeout(r, 200));
                waited += 200;
            }
            if (!window.clemailFirestore || !window.clemailDb) {
                _viewerBDRCache = null;
                return null;
            }

            const { collection, query, where, getDocs } = window.clemailFirestore;
            const q = query(
                collection(window.clemailDb, 'bdr_leaders'),
                where('viewerEmails', 'array-contains', userEmail.toLowerCase())
            );
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                _viewerBDRCache = null;
                return null;
            }

            // Collect ALL BDRs this viewer has access to
            const allBDRs = snapshot.docs.map(bdrDoc => {
                const bdr = bdrDoc.data();
                return {
                    email: bdr.primaryEmail,
                    name: bdr.name || bdr.primaryEmail,
                    id: bdrDoc.id
                };
            });

            // Sort alphabetically by name
            allBDRs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

            // Expose full list globally so the banner and other pages can use it
            window.viewerBDROptions = allBDRs;

            // Pick the active BDR: honour a previously saved choice in sessionStorage
            const savedBdrId = sessionStorage.getItem('hc_viewer_bdr_id');
            let result = allBDRs[0]; // default to first
            if (savedBdrId) {
                const saved = allBDRs.find(b => b.id === savedBdrId);
                if (saved) result = saved;
            }

            _viewerBDRCache = result;
            window.viewingAsBDR = result;
            console.log(`👁️ Viewer mode: ${userEmail} viewing as BDR ${result.email} (${result.name})`);
            if (allBDRs.length > 1) {
                console.log(`👁️ Viewer has access to ${allBDRs.length} BDR accounts`);
            }
            return result;
        } catch (error) {
            console.error('❌ Error resolving viewer BDR:', error);
            _viewerBDRCache = null;
            return null;
        }
    })();

    return _viewerBDRPromise;
}

// Switch the active viewer BDR account and reload the page to apply the change
window.switchViewerBDR = function(bdrId) {
    if (!bdrId) return;
    sessionStorage.setItem('hc_viewer_bdr_id', bdrId);
    // Clear the in-memory cache so resolveViewerBDR re-runs on the next page load
    _viewerBDRCache = undefined;
    _viewerBDRPromise = null;
    window.location.reload();
};

window.resolveViewerBDR = resolveViewerBDR;

// =====================================================
// BDR RESOLUTION BY UID (guaranteed match)
// Resolves the BDR leader record for the logged-in user.
// Strategy:
//   1. Match by loginUID (Firebase UID) — never fails due to email issues
//   2. Fall back to case-insensitive primaryEmail match
//   3. If email match found without a stored UID, auto-save the UID for future logins
// =====================================================

let _ownBDRCache = undefined; // undefined=unchecked, null=not found, object=found
let _ownBDRPromise = null;

async function resolveOwnBDR(user) {
    if (_ownBDRCache !== undefined) return _ownBDRCache;
    if (_ownBDRPromise) return _ownBDRPromise;
    if (!user) { _ownBDRCache = null; return null; }

    _ownBDRPromise = (async () => {
        try {
            // Wait up to 3s for CLEmail wrapper to be ready
            let waited = 0;
            while ((!window.clemailFirestore || !window.clemailDb) && waited < 3000) {
                await new Promise(r => setTimeout(r, 200));
                waited += 200;
            }
            if (!window.clemailFirestore || !window.clemailDb) {
                _ownBDRCache = null;
                return null;
            }

            const { collection, getDocs, doc, updateDoc } = window.clemailFirestore;
            const allSnap = await getDocs(collection(window.clemailDb, 'bdr_leaders'));

            let matchedDoc = null;
            let matchedById = false;

            allSnap.forEach(docSnap => {
                const d = docSnap.data();
                // Priority 1: Firebase UID match (guaranteed)
                if (d.loginUID && d.loginUID === user.uid) {
                    matchedDoc = { id: docSnap.id, ...d };
                    matchedById = true;
                }
            });

            // Priority 2: case-insensitive email match
            if (!matchedDoc) {
                const userEmailLower = (user.email || '').toLowerCase();
                allSnap.forEach(docSnap => {
                    const d = docSnap.data();
                    if ((d.primaryEmail || '').toLowerCase() === userEmailLower) {
                        matchedDoc = { id: docSnap.id, ...d };
                    }
                });

                // Auto-save UID so future lookups always use the guaranteed path
                if (matchedDoc && !matchedDoc.loginUID) {
                    try {
                        await updateDoc(doc(window.clemailDb, 'bdr_leaders', matchedDoc.id), {
                            loginUID: user.uid
                        });
                        matchedDoc.loginUID = user.uid;
                        console.log(`🔗 Auto-linked loginUID ${user.uid} → BDR ${matchedDoc.primaryEmail}`);
                    } catch (e) {
                        // Non-critical — log and continue
                        console.warn('⚠️ Could not auto-save loginUID:', e.message);
                    }
                }
            }

            if (matchedDoc) {
                console.log(`✅ BDR resolved for ${user.email} (${matchedById ? 'by UID' : 'by email'}): ${matchedDoc.primaryEmail}`);
            } else {
                console.warn(`⚠️ No BDR record found for ${user.email} (UID: ${user.uid})`);
            }

            _ownBDRCache = matchedDoc;
            window._resolvedBDR = matchedDoc;
            return matchedDoc;
        } catch (error) {
            console.error('❌ Error resolving BDR for user:', error);
            _ownBDRCache = null;
            return null;
        }
    })();

    return _ownBDRPromise;
}

window.resolveOwnBDR = resolveOwnBDR;

// Show a banner below the header indicating viewer mode.
// When the viewer has access to multiple BDR accounts a compact switcher is shown.
function showViewerBanner(viewerBDR) {
    if (document.getElementById('hc-viewer-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'hc-viewer-banner';
    banner.style.cssText = [
        'background: #fef3c7',
        'border-bottom: 2px solid #f59e0b',
        'padding: 0.45rem 2rem',
        'text-align: center',
        'font-size: 0.875rem',
        'font-weight: 600',
        'color: #92400e',
        'display: flex',
        'align-items: center',
        'justify-content: center',
        'gap: 0.5rem',
        'z-index: 999',
        'position: sticky',
        'top: 80px',
        'flex-wrap: wrap'
    ].join(';');

    const options = window.viewerBDROptions || [viewerBDR];

    if (options.length > 1) {
        // Build a styled <select> that lets the viewer switch BDR accounts
        const optionsHTML = options.map(bdr =>
            `<option value="${bdr.id}"${bdr.id === viewerBDR.id ? ' selected' : ''}>${bdr.name}</option>`
        ).join('');

        banner.innerHTML = `
            <i class="fas fa-eye"></i>
            <span>Viewer Mode — viewing as:</span>
            <select
                id="hc-viewer-bdr-select"
                onchange="window.switchViewerBDR(this.value)"
                style="
                    margin-left: 0.25rem;
                    padding: 0.2rem 2rem 0.2rem 0.6rem;
                    border: 1.5px solid #f59e0b;
                    border-radius: 6px;
                    background: #fffbeb url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%226%22 viewBox=%220 0 10 6%22><path d=%22M0 0l5 6 5-6z%22 fill=%22%2392400e%22/></svg>') no-repeat right 0.5rem center / 8px 5px;
                    color: #92400e;
                    font-weight: 700;
                    font-size: 0.875rem;
                    cursor: pointer;
                    appearance: none;
                    -webkit-appearance: none;
                    outline: none;
                    max-width: 220px;
                "
            >${optionsHTML}</select>
            <span style="color: #b45309; font-weight: 400; font-size: 0.8rem;">(click to switch account)</span>
        `;
    } else {
        banner.innerHTML = `<i class="fas fa-eye"></i> Viewer Mode — viewing as <strong style="margin: 0 0.25rem;">${viewerBDR.name}</strong>`;
    }

    const header = document.querySelector('.healthconnect-header');
    if (header && header.parentNode) {
        header.parentNode.insertBefore(banner, header.nextSibling);
    }
}

// Create and inject header styles
function injectHeaderStyles() {
    const styleId = 'healthconnect-header-styles';
    
    // Don't inject if already present
    if (document.getElementById(styleId)) return;
    
    const styles = `
        /* PandoConnect Header Styles — Option 3: solid navy, two greens, gold as metal only */
        .healthconnect-header {
            background: #12314C;
            border-bottom: 1px solid #B9A77E;
            box-shadow: 0 4px 16px rgba(18, 49, 76, 0.28);
            position: sticky;
            top: 0;
            z-index: 1000;
            width: 100%;
        }

        .healthconnect-header-content {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            min-height: 80px;
        }

        .healthconnect-brand {
            display: flex;
            align-items: center;
            gap: 1.5rem;
            flex-shrink: 0;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .healthconnect-brand:hover {
            opacity: 0.9;
            transform: translateY(-1px);
        }

        .healthconnect-logo {
            height: 50px;
            width: auto;
            object-fit: contain;
            border-radius: 6px;
            background: #ffffff;
            padding: 6px 10px;
        }

        .healthconnect-brand-text {
            display: flex;
            flex-direction: column;
        }

        .healthconnect-brand-name {
            font-size: 1.8rem;
            font-weight: 700;
            color: white;
            letter-spacing: -0.5px;
            line-height: 1;
            margin: 0;
        }

        .healthconnect-brand-tagline {
            font-size: 0.85rem;
            color: #94AD82;
            margin-top: 4px;
            letter-spacing: 0.04em;
        }

        .healthconnect-nav {
            display: flex;
            gap: 0.75rem;
            align-items: center;
            flex: 1;
            justify-content: center;
            margin: 0 2rem;
        }

        /* Dropdown Section */
        .healthconnect-nav-section {
            position: relative;
        }

        .healthconnect-nav-section-btn {
            color: white;
            text-decoration: none;
            padding: 0.7rem 1.2rem;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.95rem;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            white-space: nowrap;
            background: rgba(148, 173, 130, 0.12);
            cursor: pointer;
            border: 1px solid transparent;
        }

        .healthconnect-nav-section-btn:hover,
        .healthconnect-nav-section.active .healthconnect-nav-section-btn {
            background: rgba(148, 173, 130, 0.22);
            border-color: rgba(185, 167, 126, 0.45);
            transform: translateY(-1px);
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.18);
        }

        .healthconnect-nav-section-btn i:first-child {
            font-size: 1rem;
        }

        .healthconnect-nav-section-btn .fa-chevron-down {
            font-size: 0.7rem;
            transition: transform 0.3s ease;
        }

        .healthconnect-nav-section.active .healthconnect-nav-section-btn .fa-chevron-down {
            transform: rotate(180deg);
        }

        /* Dropdown Menu */
        .healthconnect-nav-dropdown {
            position: absolute;
            top: calc(100% + 0.5rem);
            left: 0;
            background: white;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            min-width: 220px;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-10px);
            transition: all 0.3s ease;
            z-index: 1001;
            overflow: hidden;
        }

        .healthconnect-nav-section.active .healthconnect-nav-dropdown {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        /* Two-column layout for Admin dropdown with many items */
        .healthconnect-nav-dropdown.admin-dropdown {
            display: grid;
            grid-template-columns: 1fr 1fr;
            min-width: 480px;
            max-height: 600px;
            overflow-y: auto;
        }

        .healthconnect-nav-dropdown.admin-dropdown::-webkit-scrollbar {
            width: 6px;
        }

        .healthconnect-nav-dropdown.admin-dropdown::-webkit-scrollbar-track {
            background: #f1f5f9;
        }

        .healthconnect-nav-dropdown.admin-dropdown::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 3px;
        }

        .healthconnect-nav-dropdown.admin-dropdown .healthconnect-nav-dropdown-item {
            border-right: 1px solid #f1f5f9;
        }

        .healthconnect-nav-dropdown.admin-dropdown .healthconnect-nav-dropdown-item:nth-child(2n) {
            border-right: none;
        }

        .healthconnect-nav-dropdown-item {
            padding: 0.85rem 1.2rem;
            color: var(--secondary, #0f172a);
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            transition: all 0.2s ease;
            border-bottom: 1px solid #f1f5f9;
        }

        .healthconnect-nav-dropdown-item:last-child {
            border-bottom: none;
        }

        .healthconnect-nav-dropdown-item:hover {
            background: #f8fafc;
            padding-left: 1.5rem;
        }

        .healthconnect-nav-dropdown-item.active {
            background: rgba(148, 173, 130, 0.18);
            font-weight: 600;
        }

        .healthconnect-nav-dropdown-item i {
            width: 20px;
            text-align: center;
            color: var(--primary, #4E6E4A);
        }

        /* Dropdown Divider */
        .healthconnect-nav-dropdown-divider {
            height: 1px;
            background: var(--gray-200, #e5e7eb);
            margin: 0.5rem 0;
        }

        .healthconnect-nav-dropdown.admin-dropdown .healthconnect-nav-dropdown-divider {
            grid-column: 1 / -1;
        }

        .healthconnect-auth {
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-shrink: 0;
        }

        .healthconnect-auth-loading {
            color: white;
            font-size: 0.9rem;
            padding: 0.5rem 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .healthconnect-auth-loading i {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }

        .healthconnect-login-btn {
            background: #94AD82;
            color: #12314C;
            padding: 0.65rem 1.5rem;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 0.95rem;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .healthconnect-login-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.22);
            background: #a7bd97;
        }

        .healthconnect-user-menu {
            position: relative;
        }

        .healthconnect-user-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            background: rgba(255, 255, 255, 0.15);
            padding: 0.5rem 1rem;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .healthconnect-user-info:hover {
            background: rgba(255, 255, 255, 0.25);
        }

        .healthconnect-user-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #4E6E4A;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 0.9rem;
            border: 2px solid rgba(185, 167, 126, 0.55);
        }

        .healthconnect-user-name {
            color: white;
            font-weight: 600;
            font-size: 0.95rem;
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .healthconnect-user-dropdown {
            position: absolute;
            top: calc(100% + 0.5rem);
            right: 0;
            background: white;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
            min-width: 220px;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-10px);
            transition: all 0.3s ease;
            z-index: 1001;
        }

        .healthconnect-user-menu.active .healthconnect-user-dropdown {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        .healthconnect-dropdown-item {
            padding: 0.85rem 1.2rem;
            color: var(--secondary, #0f172a);
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 0.75rem;
            transition: all 0.2s ease;
            border-bottom: 1px solid #f1f5f9;
            cursor: pointer;
        }

        .healthconnect-dropdown-item:first-child {
            border-radius: 10px 10px 0 0;
        }

        /* When a profile card precedes the items, the first link no longer needs rounded top */
        #hc-user-profile-card + .healthconnect-dropdown-item {
            border-radius: 0;
        }

        .healthconnect-dropdown-item:last-child {
            border-radius: 0 0 10px 10px;
            border-bottom: none;
        }

        .healthconnect-dropdown-item:hover {
            background: #f8fafc;
            padding-left: 1.5rem;
        }

        .healthconnect-dropdown-item i {
            width: 20px;
            text-align: center;
            color: var(--primary, #12314C);
        }

        .healthconnect-dropdown-item.logout {
            color: #ef4444;
        }

        .healthconnect-dropdown-item.logout i {
            color: #ef4444;
        }

        /* Mobile responsive */
        @media (max-width: 1024px) {
            .healthconnect-nav {
                margin: 0 1rem;
                gap: 0.5rem;
            }

            .healthconnect-nav-section-btn {
                padding: 0.6rem 1rem;
                font-size: 0.85rem;
            }

            .healthconnect-brand-name {
                font-size: 1.5rem;
            }

            .healthconnect-brand-tagline {
                font-size: 0.75rem;
            }
        }

        @media (max-width: 768px) {
            .healthconnect-header-content {
                flex-wrap: wrap;
                padding: 1rem;
                min-height: auto;
            }

            .healthconnect-brand {
                width: 100%;
                justify-content: space-between;
                margin-bottom: 1rem;
            }

            .healthconnect-nav {
                width: 100%;
                justify-content: flex-start;
                margin: 0;
                overflow-x: auto;
                padding-bottom: 0.5rem;
            }

            .healthconnect-nav-section-btn span {
                display: none;
            }

            .healthconnect-nav-section-btn i:first-child {
                font-size: 1.2rem;
            }

            .healthconnect-auth {
                position: absolute;
                top: 1rem;
                right: 1rem;
            }

            .healthconnect-user-name {
                display: none;
            }
        }
    `;

    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
    console.log('✅ Header styles injected');
}

// Get user initials for avatar
function getUserInitials(user) {
    if (user.displayName) {
        const names = user.displayName.split(' ');
        return names.length >= 2 ? 
            (names[0][0] + names[names.length - 1][0]).toUpperCase() : 
            names[0][0].toUpperCase();
    }
    return user.email ? user.email[0].toUpperCase() : 'U';
}

// Get user display name
function getUserDisplayName(user) {
    if (user.displayName) return user.displayName;
    if (user.email) {
        const emailName = user.email.split('@')[0];
        return emailName
            .replace(/([A-Z])/g, ' $1')
            .replace(/[._-]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim();
    }
    return 'User';
}

// Get avatar color
function getAvatarColor(user) {
    const colors = [
        { bg: '#12314C', text: '#ffffff' }, // Navy
        { bg: '#4E6E4A', text: '#ffffff' }, // Grove
        { bg: '#94AD82', text: '#12314C' }, // New leaf
        { bg: '#6B7280', text: '#ffffff' }, // Slate Gray
        { bg: '#8A6B2E', text: '#ffffff' }, // Dark Gold
        { bg: '#3D5A80', text: '#ffffff' }, // Steel Blue
        { bg: '#7A9471', text: '#ffffff' }, // Light Sage
        { bg: '#9C6B4E', text: '#ffffff' }  // Aspen Bark
    ];
    
    const email = user.email || user.displayName || 'default';
    const hash = email.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
    
    return colors[Math.abs(hash) % colors.length];
}

// Create header HTML
function createHeaderHTML(user = null, bdrCount = 1) {
    const currentPage = window.location.pathname.split('/').pop();
    const isAdmin = isAdminUser(user);
    
    // Filter sections based on admin status
    const visibleSections = HEALTHCONNECT_CONFIG.navSections.filter(section => {
        if (section.adminOnly && !isAdmin) return false;
        return true;
    });
    
    const navSectionsHTML = visibleSections.map(section => {
        const hasActivePage = section.items.some(item => {
            if (item.label === 'divider') return false;
            if (item.requiresMultipleBDRs && bdrCount < 2) return false;
            return currentPage === item.href;
        });
        
        const dropdownItemsHTML = section.items.map(item => {
            // Handle dividers
            if (item.label === 'divider') {
                return `<div class="healthconnect-nav-dropdown-divider"></div>`;
            }
            
            // Skip items that require multiple BDRs if user doesn't have them
            if (item.requiresMultipleBDRs && bdrCount < 2) {
                return '';
            }
            
            const isActive = currentPage === item.href ? 'active' : '';
            return `
                <a href="${item.href}" class="healthconnect-nav-dropdown-item ${isActive}">
                    <i class="fas ${item.icon}"></i>
                    <span>${item.label}</span>
                </a>
            `;
        }).filter(html => html !== '').join('');
        
        // Add admin-dropdown class for Admin section
        const dropdownClass = section.label === 'Admin' ? 'healthconnect-nav-dropdown admin-dropdown' : 'healthconnect-nav-dropdown';
        
        return `
            <div class="healthconnect-nav-section">
                <button class="healthconnect-nav-section-btn" type="button">
                    <i class="fas ${section.icon}"></i>
                    <span>${section.label}</span>
                    <i class="fas fa-chevron-down"></i>
                </button>
                <div class="${dropdownClass}">
                    ${dropdownItemsHTML}
                </div>
            </div>
        `;
    }).join('');

    return `
        <header class="healthconnect-header">
            <div class="healthconnect-header-content">
                <a href="index.html" class="healthconnect-brand">
                    <img src="../images/pando_logo_transparent.png" alt="PandoConnect" class="healthconnect-logo">
                    <div class="healthconnect-brand-text">
                        <h1 class="healthconnect-brand-name">${HEALTHCONNECT_CONFIG.brandName}</h1>
                        <div class="healthconnect-brand-tagline">LinkedIn Connection Management</div>
                    </div>
                </a>
                
                <nav class="healthconnect-nav">
                    ${navSectionsHTML}
                </nav>
                
                <div class="healthconnect-auth">
                    <!-- Auth loading state -->
                    <div class="healthconnect-auth-loading" id="hc-auth-loading" style="display: block;">
                        <i class="fas fa-spinner"></i>
                        <span>Loading...</span>
                    </div>
                    
                    <!-- Not logged in state -->
                    <div id="hc-not-logged-in" style="display: none;">
                        <a href="../login.html" class="healthconnect-login-btn">
                            <i class="fas fa-sign-in-alt"></i>
                            <span>Sign In</span>
                        </a>
                    </div>
                    
                    <!-- Logged in state -->
                    <div class="healthconnect-user-menu" id="hc-logged-in" style="display: none;">
                        <div class="healthconnect-user-info" id="hc-user-info">
                            <div class="healthconnect-user-avatar" id="hc-user-avatar">U</div>
                            <div>
                                <div class="healthconnect-user-name" id="hc-user-name">User</div>
                            </div>
                            <i class="fas fa-chevron-down" style="color: white; font-size: 0.8rem; transition: transform 0.3s;"></i>
                        </div>
                        <div class="healthconnect-user-dropdown">
                            <!-- Profile card — populated by updateHeaderAuthState -->
                            <div id="hc-user-profile-card" style="padding: 1rem 1.2rem; border-bottom: 2px solid #f1f5f9; background: #f8fafc; border-radius: 10px 10px 0 0;">
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <div id="hc-dropdown-avatar" style="width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; flex-shrink: 0; border: 2px solid rgba(0,0,0,0.08);">U</div>
                                    <div style="overflow: hidden; min-width: 0;">
                                        <div id="hc-dropdown-name" style="font-weight: 700; font-size: 0.95rem; color: #0f172a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">User</div>
                                        <div id="hc-dropdown-email" style="font-size: 0.8rem; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px;"></div>
                                    </div>
                                </div>
                            </div>
                            <a href="../account.html" class="healthconnect-dropdown-item">
                                <i class="fas fa-user-circle"></i>
                                <span>My Account</span>
                            </a>
                            <a href="../crm/heyreach_inbox.html" class="healthconnect-dropdown-item">
                                <i class="fas fa-inbox"></i>
                                <span>HeyReach Inbox</span>
                            </a>
                            <div class="healthconnect-dropdown-item logout" onclick="window.logout()">
                                <i class="fas fa-sign-out-alt"></i>
                                <span>Sign Out</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    `;
}

// Setup dropdown interactions
function setupDropdownInteractions() {
    const sections = document.querySelectorAll('.healthconnect-nav-section');
    
    console.log(`🎯 Setting up dropdown interactions for ${sections.length} sections`);
    
    if (sections.length === 0) {
        console.warn('⚠️ No navigation sections found to setup dropdowns');
        return;
    }
    
    sections.forEach((section, index) => {
        const btn = section.querySelector('.healthconnect-nav-section-btn');
        
        if (!btn) {
            console.warn(`⚠️ Section ${index} has no button`);
            return;
        }
        
        // Remove any existing listeners by cloning and replacing
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        // Toggle dropdown
        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log(`🖱️ Dropdown clicked: ${newBtn.textContent.trim()}`);
            
            // Close other dropdowns
            sections.forEach(s => {
                if (s !== section) {
                    s.classList.remove('active');
                }
            });
            
            // Toggle this dropdown
            section.classList.toggle('active');
        });
        
        console.log(`✅ Dropdown ${index + 1} setup complete: ${newBtn.textContent.trim()}`);
    });
    
    // Close dropdowns when clicking outside
    // Remove existing listener by using a named function
    if (window.closeDropdownsHandler) {
        document.removeEventListener('click', window.closeDropdownsHandler);
    }
    
    window.closeDropdownsHandler = (e) => {
        if (!e.target.closest('.healthconnect-nav-section')) {
            sections.forEach(section => {
                section.classList.remove('active');
            });
        }
    };
    
    document.addEventListener('click', window.closeDropdownsHandler);
    console.log('✅ Click-outside handler registered');
}

// Setup user menu dropdown interaction.
// Uses the same element-cloning technique as setupDropdownInteractions so that
// re-calling this function (which happens each time auth state updates) never
// stacks duplicate listeners.
function setupUserMenuDropdown() {
    const userMenu = document.querySelector('.healthconnect-user-menu');
    const userInfo = document.getElementById('hc-user-info');

    if (!userMenu || !userInfo) return;

    // Clone the pill element — this wipes all previously attached listeners cleanly
    const freshUserInfo = userInfo.cloneNode(true);
    userInfo.parentNode.replaceChild(freshUserInfo, userInfo);

    const chevron = freshUserInfo.querySelector('.fa-chevron-down');

    // Toggle the dropdown open/closed
    freshUserInfo.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = userMenu.classList.toggle('active');
        if (chevron) chevron.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    });

    // Replace the document-level outside-click handler so we never stack those either
    if (window._userMenuOutsideHandler) {
        document.removeEventListener('click', window._userMenuOutsideHandler);
    }
    window._userMenuOutsideHandler = (e) => {
        if (!userMenu.contains(e.target)) {
            userMenu.classList.remove('active');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        }
    };
    document.addEventListener('click', window._userMenuOutsideHandler);
}

// Update header auth state
function updateHeaderAuthState(authState) {
    console.log('🎨 Updating HealthConnect header with auth state:', authState);
    
    const loading = document.getElementById('hc-auth-loading');
    const notLoggedIn = document.getElementById('hc-not-logged-in');
    const loggedIn = document.getElementById('hc-logged-in');
    
    if (!loading || !notLoggedIn || !loggedIn) {
        console.error('❌ Header auth elements not found!');
        return;
    }
    
    if (authState.isChecking) {
        loading.style.display = 'flex';
        notLoggedIn.style.display = 'none';
        loggedIn.style.display = 'none';
        return;
    }
    
    loading.style.display = 'none';
    
    if (authState.isLoggedIn && authState.isVerified) {
        console.log('👤 Showing logged-in user:', authState.user?.email || 'unknown');
        
        // Update navigation items based on admin status
        const isAdmin = isAdminUser(authState.user);
        console.log('🔑 User is admin:', isAdmin);
        updateNavigationItems(authState.user);
        
        notLoggedIn.style.display = 'none';
        loggedIn.style.display = 'block';
        
        // Update user info — header pill
        const avatar = document.getElementById('hc-user-avatar');
        const name = document.getElementById('hc-user-name');

        if (authState.user) {
            const initials = getUserInitials(authState.user);
            const colors = getAvatarColor(authState.user);
            const displayName = getUserDisplayName(authState.user);

            if (avatar) {
                avatar.textContent = initials;
                avatar.style.background = colors.bg;
                avatar.style.color = colors.text;
            }
            if (name) {
                name.textContent = displayName;
            }

            // Update dropdown profile card
            const dropdownAvatar = document.getElementById('hc-dropdown-avatar');
            const dropdownName   = document.getElementById('hc-dropdown-name');
            const dropdownEmail  = document.getElementById('hc-dropdown-email');

            if (dropdownAvatar) {
                dropdownAvatar.textContent = initials;
                dropdownAvatar.style.background = colors.bg;
                dropdownAvatar.style.color = colors.text;
            }
            if (dropdownName)  dropdownName.textContent  = displayName;
            if (dropdownEmail) dropdownEmail.textContent = authState.user.email || '';
        }

        setupUserMenuDropdown();
        setupDropdownInteractions();

        // Show viewer banner for non-admin viewers
        if (!isAdminUser(authState.user)) {
            resolveViewerBDR(authState.user.email.toLowerCase()).then(viewerBDR => {
                if (viewerBDR) showViewerBanner(viewerBDR);
            });
        }
    } else {
        notLoggedIn.style.display = 'block';
        loggedIn.style.display = 'none';
    }
}

// Update navigation items based on user permissions
let navigationUpdateInProgress = false;

async function updateNavigationItems(user) {
    // Prevent multiple simultaneous updates
    if (navigationUpdateInProgress) {
        console.log('⏭️ Navigation update already in progress, skipping');
        return;
    }
    
    navigationUpdateInProgress = true;
    
    try {
        const currentPage = window.location.pathname.split('/').pop();
        const isAdmin = isAdminUser(user);
        
        // Check company BDR count (will use cached value if available)
        const bdrCount = await checkCompanyBDRCount(user?.email);
        
        console.log(`📊 Navigation update: BDR count = ${bdrCount}, admin = ${isAdmin}`);
        
        // Filter sections based on admin status
        const visibleSections = HEALTHCONNECT_CONFIG.navSections.filter(section => {
            if (section.adminOnly && !isAdmin) return false;
            return true;
        });
        
        const navSectionsHTML = visibleSections.map(section => {
            const dropdownItemsHTML = section.items.map(item => {
                // Handle dividers
                if (item.label === 'divider') {
                    return `<div class="healthconnect-nav-dropdown-divider"></div>`;
                }
                
                // Skip items that require multiple BDRs if user doesn't have them
                if (item.requiresMultipleBDRs && bdrCount < 2) {
                    console.log(`⏭️ Skipping "${item.label}" (requires 2+ BDRs, have ${bdrCount})`);
                    return '';
                }
                
                const isActive = currentPage === item.href ? 'active' : '';
                return `
                    <a href="${item.href}" class="healthconnect-nav-dropdown-item ${isActive}">
                        <i class="fas ${item.icon}"></i>
                        <span>${item.label}</span>
                    </a>
                `;
            }).filter(html => html !== '').join('');
            
            // Add admin-dropdown class for Admin section
            const dropdownClass = section.label === 'Admin' ? 'healthconnect-nav-dropdown admin-dropdown' : 'healthconnect-nav-dropdown';
            
            return `
                <div class="healthconnect-nav-section">
                    <button class="healthconnect-nav-section-btn" type="button">
                        <i class="fas ${section.icon}"></i>
                        <span>${section.label}</span>
                        <i class="fas fa-chevron-down"></i>
                    </button>
                    <div class="${dropdownClass}">
                        ${dropdownItemsHTML}
                    </div>
                </div>
            `;
        }).join('');
        
        const navContainer = document.querySelector('.healthconnect-nav');
        if (navContainer) {
            navContainer.innerHTML = navSectionsHTML;
            console.log(`✅ Navigation updated (admin: ${isAdmin}, sections: ${visibleSections.length})`);
            
            // CRITICAL: Re-setup dropdown interactions after updating DOM
            // The innerHTML replacement destroys previous event listeners
            setTimeout(() => {
                setupDropdownInteractions();
                console.log('✅ Dropdown interactions re-initialized');
            }, 100);
        }
    } finally {
        navigationUpdateInProgress = false;
    }
}

// Initialize header
async function initializeHealthConnectHeader() {
    console.log('🚀 Initializing HealthConnect header...');
    
    try {
        // Inject styles
        injectHeaderStyles();
        
        // Create header element
        const headerContainer = document.createElement('div');
        headerContainer.innerHTML = createHeaderHTML();
        
        // Get the actual header element
        const headerElement = headerContainer.querySelector('.healthconnect-header');
        
        if (!headerElement) {
            console.error('❌ Failed to create header element');
            return;
        }
        
        // Insert at the beginning of body
        if (document.body.firstChild) {
            document.body.insertBefore(headerElement, document.body.firstChild);
        } else {
            document.body.appendChild(headerElement);
        }
        
        console.log('✅ Header HTML injected');
        
        // Setup dropdown interactions
        setupDropdownInteractions();
        
        // Wait a tick for DOM to settle
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Wait for Firebase auth to be ready
        if (window.firebaseReady) {
            await window.firebaseReady;
            
            // Small delay to ensure auth has settled
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Check if we already have a logged-in user
            if (window.auth && window.auth.currentUser) {
                const authState = {
                    isChecking: false,
                    user: window.auth.currentUser,
                    isLoggedIn: true,
                    isVerified: window.auth.currentUser.emailVerified
                };
                updateHeaderAuthState(authState);
            } else {
                // Get current auth state from auth.js
                if (window.getCurrentAuthState) {
                    const authState = window.getCurrentAuthState();
                    
                    // If still checking, wait a bit more
                    if (authState.isChecking) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        const newAuthState = window.getCurrentAuthState();
                        updateHeaderAuthState(newAuthState);
                    } else {
                        updateHeaderAuthState(authState);
                    }
                }
            }
            
            // Listen for auth state changes
            if (window.auth) {
                const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
                
                onAuthStateChanged(window.auth, async (user) => {
                    // FIX: Give auth.js a moment to process its protection logic first.
                    // auth.js's onAuthStateChanged fires before ours (registered first) but is async,
                    // so we need a brief delay to let it update currentAuthState before we read it.
                    // This prevents the header from briefly showing "logged out" during token refreshes
                    // or cross-tab events while auth.js is still evaluating whether to protect the session.
                    if (!user && window.getCurrentAuthState) {
                        // User appears null - wait briefly for auth.js to decide
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                    
                    // Always prefer auth.js's managed state (has ultra-protection logic)
                    const authState = window.getCurrentAuthState ? window.getCurrentAuthState() : {
                        isChecking: false,
                        user: user,
                        isLoggedIn: !!user,
                        isVerified: user ? user.emailVerified : false
                    };
                    
                    updateHeaderAuthState(authState);
                });
            }
        } else {
            console.warn('⚠️ Firebase not available, showing logged-out state');
            updateHeaderAuthState({ isChecking: false, isLoggedIn: false, isVerified: false });
        }
        
        console.log('🎉 HealthConnect header initialized successfully');
        
    } catch (error) {
        console.error('❌ Failed to initialize HealthConnect header:', error);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeHealthConnectHeader);
} else {
    // DOM already loaded, initialize immediately
    initializeHealthConnectHeader();
}

console.log('📋 HealthConnect header script loaded');
