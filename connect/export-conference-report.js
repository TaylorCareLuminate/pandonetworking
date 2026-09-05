// Conference Scheduling — Branded Client PDF Report
// Mirrors the visual language of export-engagement-report.js (Pando navy/gold,
// logo top-right on every page) but tailored for a client-facing "who we're
// meeting at the conference" leave-behind.

window.exportConferenceReportPdf = async function (context) {
    const {
        conference,          // { name, location, startDate, endDate, notes }
        scheduledMeetings,   // [{ date, startTime, endTime, bdrName, contactName, contactTitle, contactCompany, email, phone, notes }]
        openInterest,        // [{ bdrName, contactName, contactTitle, contactCompany, email, phone, notes }]
        preparedFor          // optional client name string
    } = context;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const LOGO_W = 40;
    const LOGO_H = 13.5;
    const LOGO_X = pageWidth - LOGO_W - 3;
    const LOGO_Y = 1.5;
    let yPos = margin;

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

    function addLogoToPage() {
        if (!logoDataUrl) return;
        try { doc.addImage(logoDataUrl, 'PNG', LOGO_X, LOGO_Y, LOGO_W, LOGO_H); } catch (e) { /* ignore */ }
    }

    const colors = {
        primary: [15, 45, 77],       // Deep Navy
        secondary: [201, 151, 61],   // Aspen Gold
        accent: [16, 185, 129],
        warning: [180, 83, 9],
        text: [30, 30, 30],
        textLight: [100, 100, 100],
        link: [37, 99, 235],
        rowAlt: [250, 247, 240]
    };

    function checkPageBreak(neededSpace = 20) {
        if (yPos + neededSpace > pageHeight - margin - 12) {
            addFooter();
            doc.addPage();
            addLogoToPage();
            yPos = margin;
            return true;
        }
        return false;
    }

    function sanitizeText(text) {
        if (!text) return '';
        let str = String(text);
        try {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = str;
            str = textarea.value;
        } catch (e) { /* ignore */ }
        str = str
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
            .replace(/[\u{2600}-\u{26FF}]/gu, '')
            .replace(/[\u{FE00}-\u{FE0F}]/gu, '');
        str = str.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
        return str.trim();
    }

    function addSectionHeader(title, subtitle) {
        checkPageBreak(subtitle ? 24 : 18);
        doc.setFillColor(...colors.primary);
        doc.rect(margin - 5, yPos - 2, pageWidth - 2 * margin + 10, subtitle ? 15 : 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(title, margin, yPos + 5);
        if (subtitle) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.text(subtitle, margin, yPos + 11);
        }
        doc.setTextColor(...colors.text);
        doc.setFont(undefined, 'normal');
        yPos += subtitle ? 20 : 15;
    }

    let pageNum = 1;
    function addFooter() {
        doc.setFontSize(8);
        doc.setTextColor(...colors.textLight);
        doc.text('Prepared by Pando Networking · Confidential', margin, pageHeight - 8);
        doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
        doc.setTextColor(...colors.text);
        pageNum++;
    }

    // === COVER PAGE ===
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Gold accent band
    doc.setFillColor(...colors.secondary);
    doc.rect(0, pageHeight / 2 - 32, pageWidth, 2.2, 'F');
    doc.rect(0, pageHeight / 2 + 34, pageWidth, 2.2, 'F');

    if (logoDataUrl) {
        try {
            const bigW = 70, bigH = 23.6;
            doc.addImage(logoDataUrl, 'PNG', (pageWidth - bigW) / 2, pageHeight / 2 - 80, bigW, bigH);
        } catch (e) { /* ignore */ }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text('CONFERENCE MEETING SCHEDULE', pageWidth / 2, pageHeight / 2 - 42, { align: 'center' });

    doc.setFontSize(26);
    doc.setFont(undefined, 'bold');
    const confNameLines = doc.splitTextToSize(sanitizeText(conference.name || 'Conference'), pageWidth - 2 * margin - 20);
    let coverY = pageHeight / 2 - 20;
    confNameLines.forEach(line => {
        doc.text(line, pageWidth / 2, coverY, { align: 'center' });
        coverY += 10;
    });

    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...colors.secondary);
    const dateRange = conference.startDate
        ? (conference.endDate && conference.endDate !== conference.startDate
            ? `${formatDateLong(conference.startDate)} – ${formatDateLong(conference.endDate)}`
            : formatDateLong(conference.startDate))
        : '';
    if (dateRange) doc.text(dateRange, pageWidth / 2, coverY + 4, { align: 'center' });
    if (conference.location) doc.text(sanitizeText(conference.location), pageWidth / 2, coverY + 12, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    if (preparedFor) doc.text(`Prepared for: ${sanitizeText(preparedFor)}`, pageWidth / 2, pageHeight / 2 + 50, { align: 'center' });
    doc.setFontSize(9);
    doc.setTextColor(220, 220, 220);
    doc.text(`Generated ${new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}`, pageWidth / 2, pageHeight / 2 + 58, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    doc.text('Pando Networking', pageWidth / 2, pageHeight - 15, { align: 'center' });

    // === PAGE 2: Executive Summary ===
    doc.addPage();
    addLogoToPage();
    yPos = margin;
    doc.setTextColor(...colors.text);

    addSectionHeader('Meeting Summary');
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    const scheduledCount = scheduledMeetings.length;
    const openCount = openInterest.length;
    doc.text(`Confirmed meeting times: ${scheduledCount}`, margin + 2, yPos);
    yPos += 7;
    doc.text(`Additional contacts wanting to meet (time to be confirmed): ${openCount}`, margin + 2, yPos);
    yPos += 7;
    const bdrSet = new Set([...scheduledMeetings, ...openInterest].map(m => m.bdrName || m.bdrEmail).filter(Boolean));
    doc.text(`Representatives attending: ${[...bdrSet].join(', ') || '—'}`, margin + 2, yPos);
    yPos += 12;

    if (conference.notes) {
        doc.setFontSize(9);
        doc.setTextColor(...colors.textLight);
        const lines = doc.splitTextToSize(sanitizeText(conference.notes), pageWidth - 2 * margin - 4);
        lines.forEach(line => { doc.text(line, margin + 2, yPos); yPos += 5; });
        doc.setTextColor(...colors.text);
        yPos += 6;
    }

    // === CONFIRMED MEETINGS (grouped by day) ===
    addSectionHeader('Confirmed Meeting Times', 'Sorted by day and time');

    if (scheduledMeetings.length === 0) {
        doc.setFontSize(10);
        doc.setTextColor(...colors.textLight);
        doc.text('No confirmed meeting times yet.', margin + 2, yPos);
        doc.setTextColor(...colors.text);
        yPos += 10;
    } else {
        const byDay = new Map();
        scheduledMeetings
            .slice()
            .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
            .forEach(m => {
                const key = m.date || 'Unscheduled';
                if (!byDay.has(key)) byDay.set(key, []);
                byDay.get(key).push(m);
            });

        [...byDay.keys()].sort().forEach(dayKey => {
            checkPageBreak(16);
            doc.setFillColor(...colors.secondary);
            doc.rect(margin - 3, yPos - 2, pageWidth - 2 * margin + 6, 8, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(formatDateLong(dayKey), margin, yPos + 4);
            doc.setTextColor(...colors.text);
            doc.setFont(undefined, 'normal');
            yPos += 12;

            byDay.get(dayKey).forEach((m, idx) => {
                checkPageBreak(26);
                const boxStartY = yPos - 1;
                const isEven = idx % 2 === 0;
                doc.setFillColor(...(isEven ? [255, 255, 255] : colors.rowAlt));
                // draw box after we know height; placeholder rect drawn later

                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(...colors.primary);
                const timeStr = `${formatTime12(m.startTime)} – ${formatTime12(m.endTime)}`;
                doc.text(timeStr, margin + 3, yPos + 4);

                doc.setFont(undefined, 'bold');
                doc.setTextColor(...colors.text);
                doc.text(sanitizeText(m.contactName || 'Unknown'), margin + 42, yPos + 4);

                doc.setFont(undefined, 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...colors.textLight);
                const titleCo = [sanitizeText(m.contactTitle), sanitizeText(m.contactCompany)].filter(Boolean).join(' · ');
                if (titleCo) doc.text(titleCo, margin + 42, yPos + 9.5);

                doc.setFontSize(8.5);
                let contactLineY = titleCo ? yPos + 14.5 : yPos + 9.5;
                const contactBits = [];
                if (m.email) contactBits.push(`Email: ${sanitizeText(m.email)}`);
                if (m.phone) contactBits.push(`Phone: ${sanitizeText(m.phone)}`);
                if (contactBits.length) {
                    doc.text(contactBits.join('   |   '), margin + 42, contactLineY);
                } else {
                    doc.setTextColor(...colors.warning);
                    doc.text('No email/phone on file', margin + 42, contactLineY);
                    doc.setTextColor(...colors.textLight);
                }

                doc.setFontSize(8.5);
                doc.setTextColor(...colors.textLight);
                doc.text(`Meeting with: ${sanitizeText(m.bdrName || m.bdrEmail || '—')}`, margin + 42, contactLineY + 5);

                const boxHeight = (contactLineY + 5) - boxStartY + 4;
                doc.setDrawColor(220, 220, 220);
                doc.setLineWidth(0.2);
                doc.rect(margin, boxStartY, pageWidth - 2 * margin, boxHeight);

                doc.setTextColor(...colors.text);
                yPos = boxStartY + boxHeight + 3;
            });
            yPos += 4;
        });
    }

    // === WANTS TO MEET — NO TIME SET ===
    doc.addPage();
    addLogoToPage();
    yPos = margin;
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
            .forEach((m) => {
                checkPageBreak(22);
                const boxStartY = yPos - 1;

                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(...colors.text);
                doc.text(sanitizeText(m.contactName || 'Unknown'), margin + 3, yPos + 4);

                doc.setFont(undefined, 'normal');
                doc.setFontSize(9);
                doc.setTextColor(...colors.textLight);
                const titleCo = [sanitizeText(m.contactTitle), sanitizeText(m.contactCompany)].filter(Boolean).join(' · ');
                let ny = yPos + 4;
                if (titleCo) { ny += 5.5; doc.text(titleCo, margin + 3, ny); }

                doc.setFontSize(8.5);
                const contactBits = [];
                if (m.email) contactBits.push(`Email: ${sanitizeText(m.email)}`);
                if (m.phone) contactBits.push(`Phone: ${sanitizeText(m.phone)}`);
                ny += 5.5;
                if (contactBits.length) {
                    doc.text(contactBits.join('   |   '), margin + 3, ny);
                } else {
                    doc.setTextColor(...colors.warning);
                    doc.text('No email/phone on file', margin + 3, ny);
                    doc.setTextColor(...colors.textLight);
                }
                ny += 5;
                doc.text(`Point of contact: ${sanitizeText(m.bdrName || m.bdrEmail || '—')}`, margin + 3, ny);

                const boxHeight = ny - boxStartY + 4;
                doc.setDrawColor(...colors.secondary);
                doc.setLineWidth(0.3);
                doc.rect(margin, boxStartY, pageWidth - 2 * margin, boxHeight);

                doc.setTextColor(...colors.text);
                yPos = boxStartY + boxHeight + 3;
            });
    }

    addFooter();

    const fileNameSafe = sanitizeText(conference.name || 'Conference').replace(/[^a-z0-9]/gi, '_');
    const fileName = `Conference_Schedule_${fileNameSafe}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    return { success: true, fileName };

    // ── local helpers ────────────────────────────────────────────────
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
};
