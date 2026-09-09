// ─────────────────────────────────────────────────────────────────────────
// Branded PDF Export — Research Hypothesis Documentation "Targets"
//
// Generates a polished, logo-branded PDF report documenting one or more
// hypothesis groups (presented externally as "Targets"): the hypothesis
// statement, contact source, source prompts, review instructions, and
// message variations for each one.
//
// Usage:
//   window.generateTargetsPdfReport(targets, { companyName })
//
// `targets` is an array of plain objects shaped like:
//   {
//     name, color, description, bdrNames: [], workspaceName, createdAt,
//     contactCount, batchCount, contactSource, sourcePrompts: [{label,prompt}],
//     targetContactInstructions, messageReviewInstructions,
//     messageVariations: [{label,color,prompt,exampleMessage,sharePercent,aiCriteria}]
//   }
// ─────────────────────────────────────────────────────────────────────────

window.generateTargetsPdfReport = async function(targets, meta = {}) {
    if (!Array.isArray(targets) || !targets.length) {
        throw new Error('No targets provided to export.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;

    // Logo dimensions: original is 939x318, display at 38x12.85mm
    const LOGO_W = 38;
    const LOGO_H = 12.85;
    const LOGO_X = pageWidth - LOGO_W - 3;
    const LOGO_Y = 2;

    let yPos = margin;
    let pageNum = 1;

    // ── Load logo from server at runtime ──
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
    } catch(e) {
        console.warn('Could not load logo for Targets PDF:', e);
    }

    function addLogoToPage(onDark) {
        if (!logoDataUrl) return;
        try {
            doc.addImage(logoDataUrl, 'PNG', LOGO_X, LOGO_Y, LOGO_W, LOGO_H);
        } catch(e) {
            console.warn('Could not add logo to page:', e);
        }
    }

    // ── Brand palette (Pando Networking) ──
    const colors = {
        primary:   [15, 45, 77],       // Deep Navy (from logo)
        secondary: [201, 151, 61],     // Aspen Gold (from logo)
        accent:    [16, 185, 129],     // Green accent
        warning:   [180, 83, 9],       // Amber/brown (readable on light bg)
        danger:    [185, 28, 28],
        text:      [33, 37, 41],
        textLight: [110, 118, 128],
        link:      [37, 99, 235],
        cardBg:    [247, 249, 251],
        border:    [222, 228, 236]
    };

    function hexToRgb(hex) {
        const h = String(hex || '#0F2D4D').replace('#', '');
        const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const num = parseInt(full, 16) || 0x0F2D4D;
        return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    }

    function luminance(rgb) {
        const [r, g, b] = rgb.map(v => v / 255);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    // Returns black or white — whichever is readable — for text drawn on top of `rgb`
    function contrastText(rgb) {
        return luminance(rgb) > 0.62 ? [30, 30, 30] : [255, 255, 255];
    }

    // Darkens/normalizes a custom color if it's too light to read as accent text on a light card
    function safeAccent(rgb) {
        return luminance(rgb) > 0.75 ? colors.primary : rgb;
    }

    // Strip characters jsPDF's default font can't render, emojis, and decode HTML entities
    function sanitizeText(text) {
        if (!text) return '';
        let str = String(text);
        try {
            const ta = document.createElement('textarea');
            ta.innerHTML = str;
            str = ta.value;
        } catch(e) {}
        str = str
            .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
            .replace(/[\u{2600}-\u{26FF}]/gu, '')
            .replace(/[\u{FE00}-\u{FE0F}]/gu, '')
            .replace(/[\u{E000}-\u{F8FF}]/gu, '');
        str = str.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
        return str.trim();
    }

    function addFooter() {
        doc.setDrawColor(...colors.border);
        doc.setLineWidth(0.2);
        doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13);
        doc.setFontSize(7.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...colors.textLight);
        doc.text('PandoConnect — Target Strategy Report', margin, pageHeight - 8);
        doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
        doc.setTextColor(...colors.text);
    }

    function newPage() {
        addFooter();
        doc.addPage();
        pageNum++;
        addLogoToPage();
        yPos = margin;
    }

    function checkPageBreak(needed = 20) {
        if (yPos + needed > pageHeight - margin - 14) {
            newPage();
            return true;
        }
        return false;
    }

    function addSectionHeader(title, rgb = colors.primary) {
        checkPageBreak(16);
        const textRgb = contrastText(rgb);
        doc.setFillColor(...rgb);
        doc.rect(margin - 4, yPos - 3, pageWidth - 2 * margin + 8, 9, 'F');
        doc.setTextColor(...textRgb);
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(title, margin, yPos + 3.3);
        doc.setTextColor(...colors.text);
        doc.setFont(undefined, 'normal');
        yPos += 13;
    }

    function addLabel(label, rgb = colors.primary, fontSize = 9) {
        checkPageBreak(9);
        doc.setFontSize(fontSize);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...rgb);
        doc.text(sanitizeText(label), margin, yPos);
        doc.setTextColor(...colors.text);
        doc.setFont(undefined, 'normal');
        yPos += 5.5;
    }

    function addParagraph(text, opts = {}) {
        const {
            fontSize = 9.5,
            color = colors.text,
            indent = 0,
            lineGap = 4.6,
            bold = false,
            italic = false
        } = opts;
        const cleaned = sanitizeText(text);
        if (!cleaned) return;
        doc.setFontSize(fontSize);
        doc.setFont(undefined, bold ? 'bold' : (italic ? 'italic' : 'normal'));
        doc.setTextColor(...color);
        const lines = doc.splitTextToSize(cleaned, pageWidth - 2 * margin - indent);
        lines.forEach(line => {
            checkPageBreak(lineGap + 3);
            doc.text(line, margin + indent, yPos);
            yPos += lineGap;
        });
        doc.setTextColor(...colors.text);
        doc.setFont(undefined, 'normal');
    }

    // ═══════════════════════════ TITLE PAGE ═══════════════════════════
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, pageWidth, 66, 'F');
    // Thin gold accent stripe under the header band
    doc.setFillColor(...colors.secondary);
    doc.rect(0, 66, pageWidth, 2.2, 'F');

    addLogoToPage();

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(25);
    doc.setFont(undefined, 'bold');
    doc.text('Target Strategy Report', pageWidth / 2, 28, { align: 'center' });

    doc.setFontSize(13);
    doc.setFont(undefined, 'normal');
    const companyLabel = meta.companyName ? sanitizeText(meta.companyName) : 'Research Hypothesis Documentation';
    doc.text(companyLabel, pageWidth / 2, 40, { align: 'center' });

    doc.setFontSize(10.5);
    doc.setTextColor(230, 230, 230);
    doc.text(`${targets.length} Target${targets.length !== 1 ? 's' : ''} Included`, pageWidth / 2, 49, { align: 'center' });

    yPos = 80;
    doc.setTextColor(...colors.text);

    doc.setFontSize(9);
    doc.setTextColor(...colors.textLight);
    doc.text(`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`, margin, yPos);
    yPos += 12;
    doc.setTextColor(...colors.text);

    // Table of contents
    doc.setFontSize(12.5);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...colors.primary);
    doc.text('Included Targets', margin, yPos);
    doc.setFont(undefined, 'normal');
    yPos += 3;
    doc.setDrawColor(...colors.secondary);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    targets.forEach((t, i) => {
        checkPageBreak(11);
        const rgb = hexToRgb(t.color);
        doc.setFillColor(...safeAccent(rgb));
        doc.circle(margin + 1.6, yPos - 1.4, 1.7, 'F');

        doc.setFontSize(10.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...colors.text);
        const nameLines = doc.splitTextToSize(sanitizeText(t.name) || 'Unnamed Target', pageWidth - 2 * margin - 45);
        doc.text(`${i + 1}. ${nameLines[0]}`, margin + 7, yPos);

        if (typeof t.contactCount === 'number') {
            doc.setFontSize(8.5);
            doc.setTextColor(...colors.textLight);
            doc.text(`${t.contactCount.toLocaleString()} contact${t.contactCount !== 1 ? 's' : ''}`, pageWidth - margin, yPos, { align: 'right' });
            doc.setTextColor(...colors.text);
        }
        yPos += 8.5;
    });

    // ═══════════════════════════ PER-TARGET SECTIONS ═══════════════════════════
    targets.forEach((t) => {
        newPage();
        const rgb = safeAccent(hexToRgb(t.color));
        const headerTextRgb = contrastText(rgb);

        // Target name header band
        doc.setFillColor(...rgb);
        doc.rect(margin - 4, yPos - 5, pageWidth - 2 * margin + 8, 17, 'F');
        doc.setTextColor(...headerTextRgb);
        doc.setFontSize(15);
        doc.setFont(undefined, 'bold');
        const titleLines = doc.splitTextToSize(sanitizeText(t.name) || 'Unnamed Target', pageWidth - 2 * margin - 8);
        doc.text(titleLines[0], margin, yPos + 5.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...colors.text);
        yPos += 21;

        // Meta line: BDR(s), workspace, created date
        const metaParts = [];
        if (t.bdrNames?.length) metaParts.push(`BDR: ${t.bdrNames.join(', ')}`);
        if (t.workspaceName) metaParts.push(`Workspace: ${t.workspaceName}`);
        if (t.createdAt) metaParts.push(`Created: ${t.createdAt.toLocaleDateString()}`);
        if (metaParts.length) {
            doc.setFontSize(9);
            doc.setFont(undefined, 'italic');
            doc.setTextColor(...colors.textLight);
            const metaLines = doc.splitTextToSize(sanitizeText(metaParts.join('   •   ')), pageWidth - 2 * margin);
            metaLines.forEach(line => { doc.text(line, margin, yPos); yPos += 5; });
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...colors.text);
            yPos += 3;
        }

        // ── Stats row ──
        const stats = [
            ['Contacts', t.contactCount || 0],
            ['Batches', t.batchCount || 0],
            ['Prompts', (t.sourcePrompts || []).length],
            ['Variations', (t.messageVariations || []).length]
        ];
        checkPageBreak(24);
        const gap = 3;
        const statBoxW = (pageWidth - 2 * margin - gap * (stats.length - 1)) / stats.length;
        stats.forEach(([label, val], i) => {
            const x = margin + i * (statBoxW + gap);
            doc.setFillColor(...colors.cardBg);
            doc.setDrawColor(...colors.border);
            doc.setLineWidth(0.3);
            doc.roundedRect(x, yPos, statBoxW, 18, 2, 2, 'FD');
            doc.setFontSize(13.5);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(...rgb);
            doc.text(String(val), x + statBoxW / 2, yPos + 9, { align: 'center' });
            doc.setFontSize(7);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...colors.textLight);
            doc.text(label.toUpperCase(), x + statBoxW / 2, yPos + 14.5, { align: 'center' });
        });
        doc.setTextColor(...colors.text);
        yPos += 27;

        // ── Hypothesis Statement ──
        if (t.description) {
            addSectionHeader('Hypothesis Statement', rgb);
            addParagraph(t.description);
            yPos += 4;
        }

        // ── Contact Source ──
        if (t.contactSource) {
            addSectionHeader('Contact Source', colors.primary);
            addParagraph(t.contactSource);
            yPos += 4;
        }

        // ── Source Prompts ──
        const prompts = (t.sourcePrompts || []).filter(p => p && (p.label || p.prompt));
        if (prompts.length) {
            addSectionHeader('Source Prompts', colors.primary);
            prompts.forEach((p, i) => {
                checkPageBreak(14);
                if (p.label) addLabel(`${i + 1}. ${p.label}`, colors.primary);
                if (p.prompt) addParagraph(p.prompt, { indent: 4, italic: true, color: colors.textLight });
                yPos += 2;
            });
            yPos += 2;
        }

        // ── Review Instructions ──
        if (t.targetContactInstructions || t.messageReviewInstructions) {
            addSectionHeader('Review Instructions', colors.secondary);
            if (t.targetContactInstructions) {
                addLabel('Target Contact / Title Instructions');
                addParagraph(t.targetContactInstructions, { indent: 4 });
                yPos += 3;
            }
            if (t.messageReviewInstructions) {
                addLabel('Message Review Instructions');
                addParagraph(t.messageReviewInstructions, { indent: 4 });
                yPos += 3;
            }
        }

        // ── Message Variations ──
        const variations = (t.messageVariations || []).filter(v => v && (v.label || v.prompt || v.exampleMessage));
        if (variations.length) {
            addSectionHeader('Message Variations', colors.accent);
            variations.forEach((v, i) => {
                checkPageBreak(18);
                const vRgb = safeAccent(hexToRgb(v.color || '#0F2D4D'));
                doc.setFillColor(...vRgb);
                doc.circle(margin + 1.4, yPos - 1.3, 1.6, 'F');
                doc.setFontSize(10.5);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(...colors.text);
                doc.text(sanitizeText(v.label) || `Variation ${i + 1}`, margin + 6, yPos);
                if (v.sharePercent) {
                    doc.setFontSize(8.5);
                    doc.setFont(undefined, 'normal');
                    doc.setTextColor(...colors.textLight);
                    doc.text(`${v.sharePercent}% share`, pageWidth - margin, yPos, { align: 'right' });
                }
                doc.setTextColor(...colors.text);
                doc.setFont(undefined, 'normal');
                yPos += 6;

                if (v.prompt) {
                    addLabel('Writing Prompt', colors.textLight, 8.5);
                    addParagraph(v.prompt, { indent: 4, fontSize: 9 });
                }
                if (v.exampleMessage) {
                    addLabel('Example Message', colors.textLight, 8.5);
                    addParagraph(v.exampleMessage, { indent: 4, fontSize: 9, italic: true });
                }
                if (v.aiCriteria) {
                    addLabel('AI Selection Criteria', colors.textLight, 8.5);
                    addParagraph(v.aiCriteria, { indent: 4, fontSize: 9 });
                }
                yPos += 4;
            });
        }

        // Friendly note if a target has no documentation at all
        if (!t.description && !t.contactSource && !prompts.length &&
            !t.targetContactInstructions && !t.messageReviewInstructions && !variations.length) {
            doc.setFontSize(9.5);
            doc.setFont(undefined, 'italic');
            doc.setTextColor(...colors.textLight);
            doc.text('No additional documentation has been added for this target yet.', margin, yPos);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(...colors.text);
            yPos += 8;
        }
    });

    addFooter();

    // ── File name ──
    const fileNameBase = targets.length === 1
        ? (sanitizeText(targets[0].name).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Target')
        : `Targets_x${targets.length}`;
    const companyPart = meta.companyName
        ? sanitizeText(meta.companyName).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') + '_'
        : '';
    const fileName = `${companyPart}${fileNameBase}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    return { success: true, fileName };
};
