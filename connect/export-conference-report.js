// Conference Scheduling — Branded Client PDF Report
// Pando navy/gold visual language, tailored for a client-facing
// "who we're meeting at the conference" leave-behind.
//
// v1.2 highlights:
//   - Cover logo now sits on a white card (the logo art is navy-on-transparent,
//     so drawing it straight onto the navy cover made it nearly invisible) and
//     is drawn at its TRUE aspect ratio (1393×418 px ≈ 3.33:1 — the old
//     40×13.5 / 70×23.6 boxes visibly squashed the wordmark).
//   - Full redesign: cover stats row, serif conference title, per-page header
//     band with gold rule, summary stat boxes, refined meeting cards.
//   - New appendix: full LinkedIn conversation transcripts for every contact
//     in the report, rendered two-up in compact type to keep page count down.

window.exportConferenceReportPdf = async function (context) {
    const {
        conference,          // { name, location, startDate, endDate, notes }
        scheduledMeetings,   // [{ date, startTime, endTime, bdrName, contactName, contactTitle, contactCompany, email, phone, notes, transcript }]
        heldMeetings = [],   // same shape, but tentative/unconfirmed
        openInterest,        // [{ bdrName, contactName, contactTitle, contactCompany, email, phone, notes, transcript }]
        preparedFor          // optional client name string
    } = context;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = pageWidth - 2 * margin;

    // True pixel dimensions of pando_logo_transparent.png are 1393 × 418.
    const LOGO_RATIO = 1393 / 418;

    const colors = {
        navy: [15, 45, 77],
        navyDark: [10, 32, 55],
        gold: [201, 151, 61],
        goldSoft: [233, 217, 184],
        grove: [78, 110, 74],
        cream: [250, 247, 240],
        cardFill: [252, 251, 248],
        warning: [180, 83, 9],
        text: [35, 40, 48],
        textLight: [110, 116, 125],
        line: [223, 226, 230]
    };

    let logoDataUrl = null;
    try {
        const resp = await fetch('../images/pando_logo_transparent.png');
        const blob = await resp.blob();
        logoDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('Could not load logo for conference report PDF:', e);
    }

    // ── shared helpers ───────────────────────────────────────────────────
    function sanitizeText(text) {
        if (!text) return '';
        let str = String(text);
        try {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = str;
            str = textarea.value;
        } catch (e) { /* ignore */ }
        str = str
            .replace(/\r\n?/g, '\n')
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
            .replace(/[\u{2600}-\u{26FF}]/gu, '')
            .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/[\u2013\u2014]/g, '-')
            // Keep \n (so transcript paragraphs survive) plus printable latin-1.
            .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, '');
        return str.trim();
    }

    function formatDateLong(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T00:00:00');
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    function formatTime12(hhmm) {
        if (!hhmm) return '';
        const [h, m] = hhmm.split(':').map(Number);
        const period = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${String(m).padStart(2, '0')} ${period}`;
    }

    // Letter-spaced centered label — getTextWidth() doesn't account for
    // charSpace, so compute the tracked width manually.
    function textSpacedCentered(str, y, charSpace) {
        const w = doc.getTextWidth(str) + charSpace * Math.max(0, str.length - 1);
        doc.text(str, (pageWidth - w) / 2, y, { charSpace });
    }

    // ── page furniture ──────────────────────────────────────────────────
    let pageNum = 1;
    function addFooter() {
        doc.setDrawColor(...colors.line);
        doc.setLineWidth(0.3);
        doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...colors.textLight);
        doc.text('Prepared by Pando Executive Networking  ·  Confidential', margin, pageHeight - 8.5);
        doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 8.5, { align: 'right' });
        doc.setTextColor(...colors.text);
        pageNum++;
    }

    const CONTENT_TOP = 30;
    const CONTENT_BOTTOM = pageHeight - 18;
    let yPos = margin;

    function addInnerHeader() {
        if (logoDataUrl) {
            const w = 34, h = w / LOGO_RATIO;
            try { doc.addImage(logoDataUrl, 'PNG', pageWidth - margin - w, 8, w, h); } catch (e) { /* ignore */ }
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...colors.navy);
        doc.text(sanitizeText(conference.name || 'Conference'), margin, 13);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(...colors.textLight);
        doc.text('CONFERENCE MEETING SCHEDULE', margin, 17.8, { charSpace: 0.6 });
        doc.setDrawColor(...colors.gold);
        doc.setLineWidth(0.5);
        doc.line(margin, 22, pageWidth - margin, 22);
        doc.setTextColor(...colors.text);
        yPos = CONTENT_TOP;
    }

    function checkPageBreak(neededSpace = 20) {
        if (yPos + neededSpace > CONTENT_BOTTOM) {
            addFooter();
            doc.addPage();
            addInnerHeader();
            return true;
        }
        return false;
    }

    function addSectionHeader(title, subtitle) {
        checkPageBreak(subtitle ? 30 : 24);
        const bandH = subtitle ? 14.5 : 10.5;
        doc.setFillColor(...colors.navy);
        doc.rect(margin, yPos, contentW, bandH, 'F');
        doc.setFillColor(...colors.gold);
        doc.rect(margin, yPos, 2.2, bandH, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12.5);
        doc.text(title, margin + 6, yPos + 7);
        if (subtitle) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(200, 211, 225);
            doc.text(subtitle, margin + 6, yPos + 11.8);
        }
        doc.setTextColor(...colors.text);
        doc.setFont('helvetica', 'normal');
        yPos += bandH + 6;
    }

    // === COVER PAGE ======================================================
    doc.setFillColor(...colors.navy);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setFillColor(...colors.navyDark);
    doc.rect(0, pageHeight - 34, pageWidth, 34, 'F');
    doc.setFillColor(...colors.gold);
    doc.rect(0, pageHeight - 3, pageWidth, 3, 'F');
    doc.rect(0, 0, pageWidth, 1.6, 'F');

    // The logo art is navy-on-transparent — on the navy cover it disappears.
    // Give it a white card, drawn at the logo's true aspect ratio.
    const cardW = 122, cardPad = 9;
    const coverLogoW = cardW - 2 * cardPad;
    const coverLogoH = coverLogoW / LOGO_RATIO;
    const cardH = coverLogoH + 2 * cardPad;
    const cardX = (pageWidth - cardW) / 2;
    const cardY = 34;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cardX, cardY, cardW, cardH, 3, 3, 'F');
    if (logoDataUrl) {
        try { doc.addImage(logoDataUrl, 'PNG', cardX + cardPad, cardY + cardPad, coverLogoW, coverLogoH); } catch (e) { /* ignore */ }
    } else {
        doc.setTextColor(...colors.navy);
        doc.setFont('times', 'bold');
        doc.setFontSize(30);
        doc.text('PANDO', pageWidth / 2, cardY + cardH / 2 + 4, { align: 'center' });
    }

    let cy = cardY + cardH + 26;
    doc.setTextColor(...colors.gold);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    textSpacedCentered('CONFERENCE MEETING SCHEDULE', cy, 1.6);

    cy += 14;
    doc.setTextColor(255, 255, 255);
    doc.setFont('times', 'bold');
    doc.setFontSize(27);
    const confNameLines = doc.splitTextToSize(sanitizeText(conference.name || 'Conference'), contentW - 10);
    confNameLines.forEach(line => {
        doc.text(line, pageWidth / 2, cy, { align: 'center' });
        cy += 11.5;
    });

    cy += 1;
    doc.setDrawColor(...colors.gold);
    doc.setLineWidth(0.8);
    doc.line(pageWidth / 2 - 22, cy, pageWidth / 2 + 22, cy);
    cy += 9;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12.5);
    doc.setTextColor(...colors.goldSoft);
    const dateRange = conference.startDate
        ? (conference.endDate && conference.endDate !== conference.startDate
            ? `${formatDateLong(conference.startDate)} – ${formatDateLong(conference.endDate)}`
            : formatDateLong(conference.startDate))
        : '';
    if (dateRange) { doc.text(dateRange, pageWidth / 2, cy, { align: 'center' }); cy += 8; }
    if (conference.location) {
        doc.setFontSize(11);
        doc.setTextColor(205, 214, 226);
        doc.text(sanitizeText(conference.location), pageWidth / 2, cy, { align: 'center' });
    }

    // Stats row
    const coverStats = [
        { n: scheduledMeetings.length, label: 'CONFIRMED MEETINGS' },
        ...(heldMeetings.length > 0 ? [{ n: heldMeetings.length, label: 'TENTATIVELY HELD' }] : []),
        { n: openInterest.length, label: 'TO BE SCHEDULED' }
    ];
    const statY = 202;
    const statW = 54;
    let sx = (pageWidth - coverStats.length * statW) / 2;
    coverStats.forEach((s, i) => {
        const cxs = sx + statW / 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(24);
        doc.setTextColor(...colors.gold);
        doc.text(String(s.n), cxs, statY, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(210, 219, 230);
        doc.text(s.label, cxs, statY + 7, { align: 'center' });
        if (i < coverStats.length - 1) {
            doc.setDrawColor(...colors.gold);
            doc.setLineWidth(0.3);
            doc.line(sx + statW, statY - 7, sx + statW, statY + 6);
        }
        sx += statW;
    });

    // Bottom band: prepared-for + byline
    if (preparedFor) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...colors.gold);
        textSpacedCentered('PREPARED FOR', pageHeight - 25, 1.4);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(255, 255, 255);
        doc.text(sanitizeText(preparedFor), pageWidth / 2, pageHeight - 17.5, { align: 'center' });
        doc.setFont('helvetica', 'normal');
    }
    doc.setFontSize(8);
    doc.setTextColor(170, 182, 197);
    doc.text(
        `Prepared by Pando Executive Networking  ·  ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`,
        pageWidth / 2, pageHeight - 8, { align: 'center' }
    );

    // === PAGE 2: EXECUTIVE SUMMARY =======================================
    doc.addPage();
    addInnerHeader();
    addSectionHeader('Executive Summary');

    const boxGap = 6;
    const boxW = (contentW - boxGap * 2) / 3;
    const boxH = 25;
    [
        { n: scheduledMeetings.length, label: 'Confirmed Meetings' },
        { n: heldMeetings.length, label: 'Tentatively Held' },
        { n: openInterest.length, label: 'Interested — To Schedule' }
    ].forEach((b, i) => {
        const bx = margin + i * (boxW + boxGap);
        doc.setFillColor(...colors.cream);
        doc.roundedRect(bx, yPos, boxW, boxH, 2, 2, 'F');
        doc.setFillColor(...colors.gold);
        doc.rect(bx + 2, yPos, boxW - 4, 1.1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(21);
        doc.setTextColor(...colors.navy);
        doc.text(String(b.n), bx + boxW / 2, yPos + 14, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...colors.textLight);
        doc.text(b.label, bx + boxW / 2, yPos + 20.5, { align: 'center' });
    });
    doc.setTextColor(...colors.text);
    yPos += boxH + 10;

    const bdrSet = new Set([...scheduledMeetings, ...heldMeetings, ...openInterest]
        .map(m => m.bdrName || m.bdrEmail).filter(Boolean));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...colors.navy);
    const repLabel = 'Pando representatives attending:';
    doc.text(repLabel, margin + 1, yPos);
    const repLabelW = doc.getTextWidth(repLabel) + 3;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.text);
    const repLines = doc.splitTextToSize([...bdrSet].join(', ') || '—', contentW - repLabelW - 2);
    doc.text(repLines, margin + 1 + repLabelW, yPos);
    yPos += repLines.length * 4.6 + 5;

    if (conference.notes) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.8);
        const noteLines = doc.splitTextToSize(sanitizeText(conference.notes), contentW - 14);
        const noteH = noteLines.length * 4.4 + 7;
        checkPageBreak(noteH + 4);
        doc.setFont('helvetica', 'italic'); // page break resets the font via the header
        doc.setFontSize(8.8);
        doc.setFillColor(...colors.cream);
        doc.roundedRect(margin, yPos, contentW, noteH, 1.5, 1.5, 'F');
        doc.setFillColor(...colors.gold);
        doc.rect(margin + 1, yPos + 1.5, 1.2, noteH - 3, 'F');
        doc.setTextColor(...colors.textLight);
        let ny = yPos + 5.6;
        noteLines.forEach(l => { doc.text(l, margin + 7, ny); ny += 4.4; });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...colors.text);
        yPos += noteH + 8;
    } else {
        yPos += 3;
    }

    // === MEETINGS GROUPED BY DAY =========================================
    // `isHeld` switches the day band + accent color and stamps a HELD tag.
    function renderMeetingsByDay(meetings, isHeld) {
        const byDay = new Map();
        meetings
            .slice()
            .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
            .forEach(m => {
                const key = m.date || 'Unscheduled';
                if (!byDay.has(key)) byDay.set(key, []);
                byDay.get(key).push(m);
            });

        [...byDay.keys()].sort().forEach(dayKey => {
            checkPageBreak(36); // day band + at least one card

            doc.setFillColor(...(isHeld ? colors.warning : colors.gold));
            doc.roundedRect(margin, yPos, contentW, 8, 1, 1, 'F');
            doc.setTextColor(...(isHeld ? [255, 255, 255] : colors.navy));
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9.5);
            doc.text(formatDateLong(dayKey), margin + 4, yPos + 5.4);
            const dayCount = byDay.get(dayKey).length;
            doc.setFontSize(8);
            doc.text(`${dayCount} meeting${dayCount !== 1 ? 's' : ''}`, pageWidth - margin - 4, yPos + 5.4, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            yPos += 11.5;

            byDay.get(dayKey).forEach(m => {
                const titleCo = [sanitizeText(m.contactTitle), sanitizeText(m.contactCompany)].filter(Boolean).join(' · ');
                const boxH2 = titleCo ? 24 : 19.5;
                checkPageBreak(boxH2 + 4);
                const boxY = yPos;

                doc.setFillColor(...colors.cardFill);
                doc.setDrawColor(...colors.line);
                doc.setLineWidth(0.25);
                doc.roundedRect(margin, boxY, contentW, boxH2, 1.5, 1.5, 'FD');
                doc.setFillColor(...(isHeld ? colors.warning : colors.gold));
                doc.rect(margin + 0.7, boxY + 1.4, 1.3, boxH2 - 2.8, 'F');

                // Time column
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...colors.navy);
                doc.text(`${formatTime12(m.startTime)} – ${formatTime12(m.endTime)}`, margin + 6, boxY + 6.5);
                if (isHeld) {
                    doc.setFillColor(...colors.warning);
                    doc.roundedRect(margin + 6, boxY + 9, 13, 4.4, 1, 1, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(6.5);
                    doc.text('HELD', margin + 12.5, boxY + 12.1, { align: 'center' });
                }

                // Contact column
                const cx = margin + 48;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...colors.text);
                doc.text(sanitizeText(m.contactName || 'Unknown'), cx, boxY + 6.5);

                doc.setFont('helvetica', 'normal');
                let rowY = boxY + 6.5;
                if (titleCo) {
                    rowY += 4.8;
                    doc.setFontSize(8.3);
                    doc.setTextColor(...colors.textLight);
                    doc.text(doc.splitTextToSize(titleCo, contentW - 54)[0] || '', cx, rowY);
                }
                rowY += 4.8;
                doc.setFontSize(8);
                const contactBits = [];
                if (m.email) contactBits.push(sanitizeText(m.email));
                if (m.phone) contactBits.push(sanitizeText(m.phone));
                if (contactBits.length) {
                    doc.setTextColor(...colors.textLight);
                    doc.text(contactBits.join('   ·   '), cx, rowY);
                } else {
                    doc.setTextColor(...colors.warning);
                    doc.text('No email/phone on file', cx, rowY);
                }
                rowY += 4.6;
                doc.setTextColor(...colors.grove);
                doc.text(`Pando representative: ${sanitizeText(m.bdrName || m.bdrEmail || '—')}`, cx, rowY);

                doc.setTextColor(...colors.text);
                yPos = boxY + boxH2 + 3.5;
            });
            yPos += 3;
        });
    }

    // === CONFIRMED MEETINGS ==============================================
    addSectionHeader('Confirmed Meeting Times', 'Sorted by day and time');
    if (scheduledMeetings.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(...colors.textLight);
        doc.text('No confirmed meeting times yet.', margin + 2, yPos);
        doc.setTextColor(...colors.text);
        yPos += 10;
    } else {
        renderMeetingsByDay(scheduledMeetings, false);
    }

    // === TENTATIVELY HELD ================================================
    if (heldMeetings.length > 0) {
        checkPageBreak(30);
        addSectionHeader('Tentatively Held — Awaiting Confirmation', 'Time mentioned to the contact but not yet locked in');
        renderMeetingsByDay(heldMeetings, true);
    }

    // === WANTS TO MEET — NO TIME SET =====================================
    addFooter();
    doc.addPage();
    addInnerHeader();
    addSectionHeader('Wants to Meet — Time to Be Confirmed', 'Reach out on-site or in advance to lock in a time');

    if (openInterest.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(...colors.textLight);
        doc.text('None at this time.', margin + 2, yPos);
        doc.setTextColor(...colors.text);
        yPos += 10;
    } else {
        openInterest
            .slice()
            .sort((a, b) => (a.contactCompany || '').localeCompare(b.contactCompany || ''))
            .forEach(m => {
                const titleCo = [sanitizeText(m.contactTitle), sanitizeText(m.contactCompany)].filter(Boolean).join(' · ');
                const boxH2 = titleCo ? 21.5 : 17;
                checkPageBreak(boxH2 + 4);
                const boxY = yPos;

                doc.setFillColor(...colors.cardFill);
                doc.setDrawColor(...colors.line);
                doc.setLineWidth(0.25);
                doc.roundedRect(margin, boxY, contentW, boxH2, 1.5, 1.5, 'FD');
                doc.setFillColor(...colors.grove);
                doc.rect(margin + 0.7, boxY + 1.4, 1.3, boxH2 - 2.8, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...colors.text);
                doc.text(sanitizeText(m.contactName || 'Unknown'), margin + 6, boxY + 6.5);

                doc.setFont('helvetica', 'normal');
                let rowY = boxY + 6.5;
                if (titleCo) {
                    rowY += 4.8;
                    doc.setFontSize(8.3);
                    doc.setTextColor(...colors.textLight);
                    doc.text(doc.splitTextToSize(titleCo, contentW - 14)[0] || '', margin + 6, rowY);
                }
                rowY += 4.8;
                doc.setFontSize(8);
                const contactBits = [];
                if (m.email) contactBits.push(sanitizeText(m.email));
                if (m.phone) contactBits.push(sanitizeText(m.phone));
                if (contactBits.length) {
                    doc.setTextColor(...colors.textLight);
                    doc.text(contactBits.join('   ·   '), margin + 6, rowY);
                } else {
                    doc.setTextColor(...colors.warning);
                    doc.text('No email/phone on file', margin + 6, rowY);
                }
                doc.setTextColor(...colors.grove);
                doc.text(`Point of contact: ${sanitizeText(m.bdrName || m.bdrEmail || '—')}`,
                    pageWidth - margin - 5, rowY, { align: 'right' });

                doc.setTextColor(...colors.text);
                yPos = boxY + boxH2 + 3.5;
            });
    }

    // === APPENDIX: CONVERSATION TRANSCRIPTS ==============================
    // Full back-and-forth LinkedIn threads for every contact in the report,
    // rendered two-up in compact type so the appendix stays short.
    const seenContacts = new Set();
    const withTranscripts = [...scheduledMeetings, ...heldMeetings, ...openInterest]
        .filter(m => {
            if (!Array.isArray(m.transcript) || m.transcript.length === 0) return false;
            const k = `${(m.contactName || '').toLowerCase()}|${(m.contactCompany || '').toLowerCase()}`;
            if (seenContacts.has(k)) return false;
            seenContacts.add(k);
            return true;
        })
        .sort((a, b) => (a.contactName || '').localeCompare(b.contactName || ''));

    if (withTranscripts.length > 0) {
        addFooter();
        doc.addPage();
        addInnerHeader();
        addSectionHeader('Appendix — Conversation Transcripts',
            'Full LinkedIn message history for each contact in this report, condensed for reference');

        const gutter = 8;
        const colW = (contentW - gutter) / 2;
        const colX = [margin, margin + colW + gutter];
        const colBottom = CONTENT_BOTTOM;
        let colTop = yPos;
        let col = 0;
        let colY = colTop;

        function nextColumn() {
            if (col === 0) {
                doc.setDrawColor(...colors.line);
                doc.setLineWidth(0.2);
                doc.line(margin + colW + gutter / 2, colTop, margin + colW + gutter / 2, colBottom);
                col = 1;
                colY = colTop;
            } else {
                addFooter();
                doc.addPage();
                addInnerHeader();
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.setTextColor(...colors.textLight);
                doc.text('APPENDIX — CONVERSATION TRANSCRIPTS (CONTINUED)', margin, yPos, { charSpace: 0.4 });
                doc.setFont('helvetica', 'normal');
                yPos += 6;
                colTop = yPos;
                col = 0;
                colY = colTop;
            }
        }

        const MSG_FONT = 7, MSG_LH = 2.9, META_LH = 3.2;

        withTranscripts.forEach(m => {
            const name = sanitizeText(m.contactName || 'Unknown');
            const sub = [sanitizeText(m.contactTitle), sanitizeText(m.contactCompany)].filter(Boolean).join(' · ');
            const rep = sanitizeText(m.bdrName || m.bdrEmail || '');
            const contactFirst = sanitizeText(m.contactFirstName || (m.contactName || '').split(' ')[0] || 'Contact');

            // Never leave a contact header orphaned at the bottom of a column.
            if (colY + 18 > colBottom) nextColumn();
            let x = colX[col];

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.6);
            doc.setTextColor(...colors.navy);
            doc.text(doc.splitTextToSize(name, colW)[0] || '', x, colY);
            colY += 3.6;
            if (sub) {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(6.8);
                doc.setTextColor(...colors.textLight);
                doc.splitTextToSize(sub, colW).forEach(l => { doc.text(l, x, colY); colY += 2.9; });
            }
            doc.setDrawColor(...colors.gold);
            doc.setLineWidth(0.4);
            doc.line(x, colY, x + colW, colY);
            colY += 3.6;

            m.transcript.forEach(msg => {
                const who = msg.sender === 'bdr'
                    ? ((rep.split(' ')[0] || 'Pando').toUpperCase() + ' (PANDO)')
                    : contactFirst.toUpperCase();
                const dateStr = msg.at
                    ? msg.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '';

                doc.setFontSize(MSG_FONT);
                const lines = doc.splitTextToSize(sanitizeText(msg.text), colW - 3);

                // Keep the sender line attached to at least one line of text.
                if (colY + META_LH + MSG_LH > colBottom) nextColumn();
                x = colX[col];

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.4);
                doc.setTextColor(...(msg.sender === 'bdr' ? colors.navy : colors.grove));
                doc.text(who + (dateStr ? `  ·  ${dateStr}` : ''), x, colY);
                colY += META_LH;

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(MSG_FONT);
                doc.setTextColor(...colors.text);
                lines.forEach(line => {
                    if (colY + MSG_LH > colBottom) {
                        nextColumn();
                        x = colX[col];
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(MSG_FONT);
                        doc.setTextColor(...colors.text);
                    }
                    doc.text(line, x + 2.5, colY);
                    colY += MSG_LH;
                });
                colY += 1.6;
            });
            colY += 4.5;
        });
    }

    addFooter();

    const fileNameSafe = sanitizeText(conference.name || 'Conference').replace(/[^a-z0-9]/gi, '_');
    const fileName = `Conference_Schedule_${fileNameSafe}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    return { success: true, fileName };
};
