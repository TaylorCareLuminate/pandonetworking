// Enhanced PDF Export for Engagement Report
// This file contains the comprehensive report generation logic

window.exportEngagementReportEnhanced = async function(context) {
    const {
        allConversations,
        viewingBdrEmail,
        currentUserEmail,
        timeWindowDays,
        linkedInEmailAssociations,
        loadOutreachStats,
        emailDB,
        collection,
        getDocs,
        query,
        where
    } = context;
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    // Logo dimensions: original is 939x318, display at 40x13.5mm
    const LOGO_W = 40;
    const LOGO_H = 13.5;
    const LOGO_X = pageWidth - LOGO_W - 3;
    const LOGO_Y = 1.5;
    let yPos = margin;
    
    // Load logo from server at runtime
    let logoDataUrl = null;
    try {
        const resp = await fetch('../images/HealthLuminate-Bright.png');
        const blob = await resp.blob();
        logoDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch(e) {
        console.warn('Could not load logo for PDF:', e);
    }

    // Draw logo in top-right corner of current page
    function addLogoToPage() {
        if (!logoDataUrl) return;
        try {
            doc.addImage(logoDataUrl, 'PNG', LOGO_X, LOGO_Y, LOGO_W, LOGO_H);
        } catch(e) {
            console.warn('Could not add logo to page:', e);
        }
    }

    // Color palette - HealthLuminate brand colors
    const colors = {
        primary: [13, 59, 102],      // Dark blue (from logo)
        secondary: [219, 122, 60],   // Orange (from logo)
        accent: [16, 185, 129],      // Green accent
        warning: [245, 158, 11],     // Warning orange
        text: [0, 0, 0],
        textLight: [100, 100, 100],
        link: [37, 99, 235]
    };
    
    // Helper function to add new page if needed
    function checkPageBreak(neededSpace = 20) {
        if (yPos + neededSpace > pageHeight - margin - 10) {
            doc.addPage();
            addLogoToPage();
            yPos = margin;
            return true;
        }
        return false;
    }
    
    // Helper to sanitize text (remove emojis, fix encoding artifacts, and clean special chars)
    function sanitizeText(text) {
        if (!text) return '';
        let str = String(text);

        // Decode HTML entities using DOM
        try {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = str;
            str = textarea.value;
        } catch(e) {}

        // Detect LinkedIn-style char-encoding artifact: &XX& pattern where each
        // character is wrapped in ampersands (e.g. &C6&.& &E&r&i&c&)
        // Detect by high ratio of & characters in the string
        const ampCount = (str.match(/&/g) || []).length;
        if (ampCount > 5 && ampCount / str.length > 0.2) {
            let decoded = '';
            str.split('&').filter(t => t !== '').forEach(token => {
                // Strip trailing +X emoji-encoding patterns from each token
                token = token.replace(/(\+[A-Z0-9])+$/, '');
                if (/^[0-9A-Fa-f]{2,4}$/.test(token.trim())) {
                    // Hex-encoded character — only keep printable ASCII (0x20–0x7E)
                    const code = parseInt(token.trim(), 16);
                    if (code >= 0x20 && code <= 0x7E) {
                        decoded += String.fromCharCode(code);
                    }
                    // Skip non-printable/non-ASCII codes (like C6 = Æ formatting prefix)
                } else {
                    decoded += token;
                }
            });
            str = decoded;
        }

        // Remove trailing +X+X patterns (LinkedIn emoji-encoding artifacts, e.g. +P+P+P)
        str = str.replace(/(\s*\+[A-Z0-9])+\s*$/, '');

        // Remove emoji Unicode ranges
        str = str
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
            .replace(/[\u{2600}-\u{26FF}]/gu, '')
            .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
            .replace(/[\u{E000}-\u{F8FF}]/gu, '');

        // Remove characters jsPDF's default font can't render (non-Latin-1)
        str = str.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

        // Strip leading non-alphanumeric characters that are encoding artifacts
        // (e.g. ". Eric Strautman" → "Eric Strautman")
        str = str.replace(/^[\s.]+/, '');

        return str.trim();
    }
    
    // Helper to add section header
    function addSectionHeader(title) {
        checkPageBreak(20);
        doc.setFillColor(...colors.primary);
        doc.rect(margin - 5, yPos - 2, pageWidth - 2 * margin + 10, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(title, margin, yPos + 5);
        doc.setTextColor(...colors.text);
        doc.setFont(undefined, 'normal');
        yPos += 15;
    }
    
    // Get BDR name
    const bdrName = viewingBdrEmail ? 
        (document.getElementById('bdrSelect')?.selectedOptions[0]?.textContent || viewingBdrEmail) :
        currentUserEmail;
    
    // Calculate time range text
    let timeRangeText = 'All Time';
    if (timeWindowDays < 9999) {
        if (timeWindowDays <= 31) {
            const months = Math.round(timeWindowDays / 30);
            timeRangeText = `Past ${months} Month${months !== 1 ? 's' : ''}`;
        } else if (timeWindowDays <= 365) {
            const months = Math.round(timeWindowDays / 30);
            timeRangeText = `Past ${months} Months`;
        } else {
            const years = Math.round(timeWindowDays / 365);
            timeRangeText = `Past ${years} Year${years !== 1 ? 's' : ''}`;
        }
    }
    
    // === TITLE PAGE ===
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, pageWidth, 60, 'F');

    // Add logo to title page (top-right corner, on top of blue header)
    addLogoToPage();
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont(undefined, 'bold');
    doc.text('LinkedIn Engagement Report', pageWidth / 2, 25, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont(undefined, 'normal');
    doc.text(sanitizeText(bdrName), pageWidth / 2, 38, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Reporting Period: ${timeRangeText}`, pageWidth / 2, 48, { align: 'center' });
    
    yPos = 75;
    doc.setTextColor(...colors.text);
    
    // Add decorative line
    doc.setDrawColor(...colors.accent);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;
    
    // Link to live dashboard
    doc.setFontSize(10);
    doc.setTextColor(...colors.link);
    const linkUrl = 'https://healthluminate.com/connect/review_replies.html';
    doc.textWithLink('View Live Dashboard', margin, yPos, { url: linkUrl });
    doc.setTextColor(...colors.text);
    yPos += 8;
    
    doc.setFontSize(9);
    doc.setTextColor(...colors.textLight);
    doc.text(`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`, margin, yPos);
    doc.setTextColor(...colors.text);
    yPos += 15;
    
    // === EXECUTIVE SUMMARY ===
    addSectionHeader('Executive Summary');
    
    const totalProspects = allConversations.filter(c => 
        c.followUpCategory !== 'Qualified Wrong Contact' && 
        !c.isCurrentlyIgnored
    ).length;
    const flaggedCount = allConversations.filter(c => 
        c.flaggedForClientReview === true && 
        !c.isCurrentlyIgnored
    ).length;
    
    doc.setFontSize(11);
    doc.text(`Total Prospects Engaged: ${totalProspects}`, margin + 3, yPos);
    yPos += 7;
    doc.text(`Reporting Period: ${timeRangeText}`, margin + 3, yPos);
    yPos += 7;
    doc.text(`Conversations Flagged for Review: ${flaggedCount}`, margin + 3, yPos);
    yPos += 15;
    
    // === OUTREACH STATISTICS ===
    if (timeWindowDays === 30) {
        const stats = await loadOutreachStats(viewingBdrEmail || currentUserEmail);
        
        addSectionHeader('Outreach Activity (Past 30 Days)');
        
        doc.setFontSize(10);
        const statsData = [
            ['Connection Requests Sent:', stats.connectionRequests],
            ['New Connections:', stats.newConnections],
            ['Messages Sent:', stats.messagesSent],
            ['Replies Received:', stats.repliesReceived],
            ['InMails Sent:', stats.inmailsSent],
            ['Profile Views:', stats.profileViews],
            ['Posts Liked:', stats.postLikes],
            ['Total Outreach Actions:', stats.totalActions]
        ];
        
        const col1X = margin + 5;
        const col2X = margin + 100;
        
        statsData.forEach(([label, value]) => {
            doc.setFont(undefined, 'normal');
            doc.text(label, col1X, yPos);
            doc.setFont(undefined, 'bold');
            doc.text(String(value), col2X, yPos);
            yPos += 6;
        });
        
        yPos += 10;
    }
    
    // === CATEGORY BREAKDOWN GRID ===
    addSectionHeader('Engagement Category Breakdown');
    
    // Build category grid data
    const categories = {
        'Response': { 'No Follow Up': 0, 'Followed Up No Invite': 0, 'Followed Up Soft Invite': 0, 'Followed Up Calendar Link': 0 },
        'Response Engaged': { 'No Follow Up': 0, 'Followed Up No Invite': 0, 'Followed Up Soft Invite': 0, 'Followed Up Calendar Link': 0 },
        'Response Willing to Meet': { 'No Follow Up': 0, 'Followed Up No Invite': 0, 'Followed Up Soft Invite': 0, 'Followed Up Calendar Link': 0 },
        'Scheduled': { 'No Follow Up': 0, 'Followed Up No Invite': 0, 'Followed Up Soft Invite': 0, 'Followed Up Calendar Link': 0 },
        'Declined to Meet': { 'No Follow Up': 0, 'Followed Up No Invite': 0, 'Followed Up Soft Invite': 0, 'Followed Up Calendar Link': 0 }
    };
    
    allConversations.filter(conv => !conv.isCurrentlyIgnored).forEach(conv => {
        const response = conv.responseCategory || 'Response';
        const followUp = conv.followUpCategory || 'No Follow Up';
        if (categories[response] && categories[response][followUp] !== undefined) {
            categories[response][followUp]++;
        }
    });
    
    // Draw enhanced grid table
    const cellWidth = 32;
    const cellHeight = 7;
    const headerCellHeight = 14;
    const startX = margin + 3;
    const headerFontSize = 7;
    const headerLineH = 4.2; // approx line height at font size 7

    // Top-left blank cell (gray)
    doc.setFillColor(220, 220, 220);
    doc.rect(startX, yPos, cellWidth, headerCellHeight, 'F');

    // Header row: draw each orange cell with text explicitly
    const headers = ['No Follow Up', 'Follow-No Inv', 'Follow-Soft Inv', 'Follow-Cal Link'];
    doc.setFontSize(headerFontSize);
    doc.setFont(undefined, 'bold');

    headers.forEach((header, i) => {
        const cellX = startX + cellWidth * (i + 1);

        // Fill orange cell
        doc.setFillColor(...colors.secondary);
        doc.rect(cellX, yPos, cellWidth, headerCellHeight, 'F');

        // White text, vertically centered
        doc.setTextColor(255, 255, 255);
        const lines = doc.splitTextToSize(header, cellWidth - 2);
        const totalTextH = lines.length * headerLineH;
        const textStartY = yPos + (headerCellHeight - totalTextH) / 2 + headerLineH * 0.85;

        lines.forEach((line, li) => {
            doc.text(line, cellX + cellWidth / 2, textStartY + li * headerLineH, { align: 'center' });
        });
    });
    
    yPos += headerCellHeight;
    doc.setTextColor(...colors.text);
    
    // Data rows with alternating colors
    Object.keys(categories).forEach((responseCategory, rowIndex) => {
        checkPageBreak(cellHeight + 5);
        const rowData = categories[responseCategory];
        
        // Row label cell
        const isEven = rowIndex % 2 === 0;
        doc.setFillColor(isEven ? 240 : 250, isEven ? 240 : 250, isEven ? 240 : 250);
        doc.rect(startX, yPos, cellWidth, cellHeight, 'F');
        
        doc.setFont(undefined, 'bold');
        doc.setFontSize(7);
        const shortLabel = responseCategory.replace('Response ', 'R-').replace('Declined to Meet', 'Declined');
        doc.setTextColor(...colors.text);
        doc.text(shortLabel, startX + 2, yPos + 4.5);
        
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        // Data cells
        Object.keys(rowData).forEach((followUpCategory, colIndex) => {
            const count = rowData[followUpCategory];
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.2);
            doc.rect(startX + cellWidth * (colIndex + 1), yPos, cellWidth, cellHeight);
            doc.setTextColor(...colors.text);
            doc.text(String(count), startX + cellWidth * (colIndex + 1) + cellWidth/2, yPos + 4.5, { align: 'center' });
        });
        
        yPos += cellHeight;
    });
    
    yPos += 15;
    
    // === DETAILED CONVERSATIONS BY CATEGORY ===
    doc.addPage();
    addLogoToPage();
    yPos = margin;
    
    addSectionHeader('Detailed Conversations by Category');
    
    doc.setFontSize(8);
    doc.setTextColor(...colors.textLight);
    doc.text('Each conversation includes: Name, Title, Company, LinkedIn URL, and conversation excerpts', margin, yPos);
    yPos += 10;
    doc.setTextColor(...colors.text);
    
    // Process each category combination
    Object.keys(categories).forEach((responseCategory) => {
        Object.keys(categories[responseCategory]).forEach((followUpCategory) => {
            const matchingConvs = allConversations.filter(c => 
                (c.responseCategory || 'Response') === responseCategory &&
                (c.followUpCategory || 'No Follow Up') === followUpCategory &&
                !c.isCurrentlyIgnored
            );
            
            if (matchingConvs.length > 0) {
                checkPageBreak(25);
                
                // Category header with background
                doc.setFillColor(...colors.secondary);
                doc.rect(margin - 3, yPos - 2, pageWidth - 2 * margin + 6, 8, 'F');
                doc.setFontSize(11);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text(`${responseCategory} + ${followUpCategory}`, margin, yPos + 4);
                doc.setTextColor(...colors.text);
                doc.setFont(undefined, 'normal');
                yPos += 12;
                
                doc.setFontSize(8);
                doc.setTextColor(...colors.textLight);
                doc.text(`${matchingConvs.length} conversation${matchingConvs.length !== 1 ? 's' : ''}`, margin, yPos);
                yPos += 10;
                doc.setTextColor(...colors.text);
                
                // Show each conversation with full details
                matchingConvs.forEach((conv, idx) => {
                    const leadName = sanitizeText(conv.leadFirstName && conv.leadLastName 
                        ? `${conv.leadFirstName} ${conv.leadLastName}`
                        : (conv.lead_name || 'Unknown'));
                    const company = sanitizeText(conv.companyName || conv.leadCompany || '');
                    const title = sanitizeText(conv.leadPosition || conv.lead_position || '');
                    const linkedInUrl = conv.leadProfileUrl || conv.linkedin_url || conv.leadLinkedInUrl || '';
                    
                    // Calculate exact space needed
                    let spaceNeeded = 12; // Name
                    if (title) spaceNeeded += 5;
                    if (company) spaceNeeded += 5;
                    if (linkedInUrl) spaceNeeded += 6;
                    
                    // Add space for messages
                    if (conv.messages && conv.messages.length > 0) {
                        spaceNeeded += 8; // "Recent messages:" header
                        const recentMessages = conv.messages.slice(-3);
                        recentMessages.forEach(msg => {
                            const messageText = sanitizeText(msg.body || msg.text || msg.message || '');
                            if (messageText) {
                                const lines = doc.splitTextToSize(messageText.substring(0, 120), pageWidth - margin * 2 - 20);
                                spaceNeeded += lines.length * 5;
                            }
                        });
                    }
                    
                    // Add space for notes
                    if (conv.crmNotesHistory && conv.crmNotesHistory.length > 0) {
                        spaceNeeded += 8; // "Notes:" header
                        const recentNotes = conv.crmNotesHistory.slice(-2);
                        recentNotes.forEach(note => {
                            const noteText = sanitizeText(note.notes || '');
                            if (noteText) {
                                const lines = doc.splitTextToSize(noteText.substring(0, 150), pageWidth - margin * 2 - 20);
                                spaceNeeded += lines.length * 5;
                            }
                        });
                    }
                    
                    spaceNeeded += 8; // Box padding
                    
                    checkPageBreak(spaceNeeded);
                    
                    const boxStartY = yPos - 1;
                    yPos += 3;
                    
                    // Name and number
                    doc.setFontSize(10);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(...colors.text);
                    doc.text(`${idx + 1}. ${leadName}`, margin + 4, yPos);
                    yPos += 8;
                    
                    // Title
                    if (title) {
                        doc.setFontSize(9);
                        doc.setFont(undefined, 'normal');
                        doc.setTextColor(...colors.textLight);
                        doc.text(title, margin + 7, yPos);
                        yPos += 6;
                    }
                    
                    // Company
                    if (company) {
                        doc.setFontSize(9);
                        doc.setFont(undefined, 'normal');
                        doc.setTextColor(...colors.textLight);
                        doc.text(company, margin + 7, yPos);
                        yPos += 6;
                    }
                    
                    // LinkedIn URL
                    if (linkedInUrl) {
                        doc.setTextColor(...colors.link);
                        doc.setFontSize(8);
                        const shortUrl = linkedInUrl.length > 55 ? linkedInUrl.substring(0, 55) + '...' : linkedInUrl;
                        doc.textWithLink(`LinkedIn: ${shortUrl}`, margin + 7, yPos, { url: linkedInUrl });
                        yPos += 7;
                    }
                    
                    doc.setTextColor(...colors.text);
                    
                    // Conversation excerpt
                    if (conv.messages && conv.messages.length > 0) {
                        yPos += 3;
                        doc.setFontSize(8);
                        doc.setFont(undefined, 'bold');
                        doc.setTextColor(...colors.textLight);
                        doc.text('Recent conversation:', margin + 7, yPos);
                        yPos += 6;
                        
                        doc.setFont(undefined, 'normal');
                        const recentMessages = conv.messages.slice(-3);
                        recentMessages.forEach(msg => {
                            const sender = msg.sender === 'ME' || msg.sender === 'account' ? 'You' : leadName;
                            const messageText = sanitizeText(msg.body || msg.text || msg.message || '');
                            if (messageText) {
                                const truncated = messageText.substring(0, 120);
                                const displayText = `${sender}: ${truncated}${messageText.length > 120 ? '...' : ''}`;
                                doc.setFontSize(8);
                                const lines = doc.splitTextToSize(displayText, pageWidth - margin * 2 - 20);
                                lines.forEach(line => {
                                    doc.text(`- ${line}`, margin + 9, yPos);
                                    yPos += 5;
                                });
                                yPos += 1;
                            }
                        });
                    }
                    
                    // CRM Notes
                    if (conv.crmNotesHistory && conv.crmNotesHistory.length > 0) {
                        yPos += 3;
                        doc.setFontSize(8);
                        doc.setFont(undefined, 'bold');
                        doc.setTextColor(...colors.warning);
                        doc.text('CRM Notes:', margin + 7, yPos);
                        yPos += 6;
                        
                        doc.setFont(undefined, 'normal');
                        doc.setTextColor(...colors.text);
                        
                        const recentNotes = conv.crmNotesHistory.slice(-2);
                        recentNotes.forEach(note => {
                            const noteText = sanitizeText(note.notes || '');
                            if (noteText) {
                                const truncated = noteText.substring(0, 150);
                                doc.setFontSize(8);
                                const lines = doc.splitTextToSize(truncated, pageWidth - margin * 2 - 20);
                                lines.forEach(line => {
                                    doc.text(`- ${line}`, margin + 9, yPos);
                                    yPos += 5;
                                });
                                yPos += 2;
                            }
                        });
                    }
                    
                    yPos += 4;
                    
                    // Draw box around this contact
                    const boxHeight = yPos - boxStartY;
                    doc.setDrawColor(200, 200, 200);
                    doc.setLineWidth(0.3);
                    doc.rect(margin + 1, boxStartY, pageWidth - 2 * margin - 2, boxHeight);
                    
                    yPos += 6;
                });
                
                yPos += 10;
            }
        });
    });
    
    // === FLAGGED FOR CLIENT REVIEW ===
    const flaggedConvs = allConversations.filter(c => 
        c.flaggedForClientReview === true && 
        !c.isCurrentlyIgnored
    );
    if (flaggedConvs.length > 0) {
        doc.addPage();
        addLogoToPage();
        yPos = margin;
        
        addSectionHeader('Flagged for Client Review');
        
        doc.setFontSize(9);
        doc.setTextColor(...colors.textLight);
        doc.text(`${flaggedConvs.length} conversation${flaggedConvs.length !== 1 ? 's' : ''} require your attention`, margin, yPos);
        yPos += 12;
        doc.setTextColor(...colors.text);
        
        flaggedConvs.forEach((conv, idx) => {
            const leadName = sanitizeText(conv.leadFirstName && conv.leadLastName 
                ? `${conv.leadFirstName} ${conv.leadLastName}`
                : (conv.lead_name || 'Unknown'));
            const company = sanitizeText(conv.companyName || conv.leadCompany || '');
            const title = sanitizeText(conv.leadPosition || conv.lead_position || '');
            const linkedInUrl = conv.leadProfileUrl || conv.linkedin_url || conv.leadLinkedInUrl || '';
            const response = conv.responseCategory || 'Response';
            const followUp = conv.followUpCategory || 'No Follow Up';
            
            let spaceNeeded = 12;
            if (title) spaceNeeded += 5;
            if (company) spaceNeeded += 5;
            if (linkedInUrl) spaceNeeded += 6;
            if (conv.messages && conv.messages.length > 0) spaceNeeded += 12;
            spaceNeeded += 8;
            
            checkPageBreak(spaceNeeded);
            
            const boxStartY = yPos - 1;
            yPos += 3;
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...colors.warning);
            doc.text(`${idx + 1}. ${leadName}`, margin + 4, yPos);
            yPos += 8;
            
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...colors.text);
            if (title) {
                doc.text(title, margin + 7, yPos);
                yPos += 6;
            }
            if (company) {
                doc.text(company, margin + 7, yPos);
                yPos += 6;
            }
            if (linkedInUrl) {
                doc.setTextColor(...colors.link);
                doc.setFontSize(8);
                const shortUrl = linkedInUrl.length > 55 ? linkedInUrl.substring(0, 55) + '...' : linkedInUrl;
                doc.textWithLink(`LinkedIn: ${shortUrl}`, margin + 7, yPos, { url: linkedInUrl });
                yPos += 7;
            }
            
            doc.setTextColor(...colors.text);
            doc.setFont(undefined, 'italic');
            doc.setFontSize(8);
            doc.text(`Category: ${response} + ${followUp}`, margin + 7, yPos);
            yPos += 6;
            
            // Last message
            if (conv.messages && conv.messages.length > 0) {
                const lastMsg = conv.messages[conv.messages.length - 1];
                const sender = lastMsg.sender === 'ME' || lastMsg.sender === 'account' ? 'You' : leadName;
                const msgText = sanitizeText(lastMsg.body || lastMsg.text || lastMsg.message || '').substring(0, 120);
                if (msgText) {
                    doc.setFont(undefined, 'normal');
                    doc.setFontSize(8);
                    doc.setTextColor(...colors.textLight);
                    const displayText = `Last: ${sender}: ${msgText}...`;
                    const lines = doc.splitTextToSize(displayText, pageWidth - margin * 2 - 15);
                    lines.forEach(line => {
                        doc.text(line, margin + 7, yPos);
                        yPos += 5;
                    });
                    yPos += 2;
                }
            }
            
            yPos += 4;
            
            // Draw box with yellow background
            const boxHeight = yPos - boxStartY;
            doc.setFillColor(255, 251, 235);
            doc.rect(margin + 1, boxStartY, pageWidth - 2 * margin - 2, boxHeight, 'F');
            doc.setDrawColor(...colors.warning);
            doc.setLineWidth(0.5);
            doc.rect(margin + 1, boxStartY, pageWidth - 2 * margin - 2, boxHeight);
            
            doc.setTextColor(...colors.text);
            yPos += 6;
        });
    }
    
    // === FOOTER ON LAST PAGE ===
    doc.setFontSize(8);
    doc.setTextColor(...colors.textLight);
    doc.text('End of Report', pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    // Save PDF
    const fileName = `Engagement_Report_${sanitizeText(bdrName).replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    
    return { success: true, fileName };
};
