#!/usr/bin/env node
/**
 * build-sop-page-index.js
 * =======================
 * Builds connect/sop_page_index.json — the "what is on every page" knowledge base
 * that the SOP Builder (connect/sop_builder.html) hands to Claude Opus so the SOPs
 * it writes link to real pages and use the real button / tab / heading names.
 *
 * Two sources are merged:
 *   1. PAGE_CATALOG in connect/index_admin.html — the hand-written title, section,
 *      description and keywords for each page (what the page is FOR).
 *   2. The page source itself — <title>, headings, buttons and field labels
 *      (what is actually ON the page), scraped from each connect/*.html file.
 *
 * Re-run whenever pages are added or their UI changes:
 *
 *     node scripts/build-sop-page-index.js
 *
 * It only reads connect/*.html and writes connect/sop_page_index.json.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CONNECT_DIR = path.join(__dirname, '..', 'connect');
const OUT_FILE = path.join(CONNECT_DIR, 'sop_page_index.json');

// Uncatalogued pages matching these are scratch / legacy / test pages — keep them out.
const JUNK_PAGE = /^(test_|temp_|debug_|demo_|header-demo)|_old\.html$|_NEW\.html$|_standalone\.html$|^index_temp|\d\.html$|_test\.html$|^johns_/i;

const MAX_HEADINGS = 14;
const MAX_BUTTONS = 30;
const MAX_FIELDS = 16;

// ── Read PAGE_CATALOG out of index_admin.html ───────────────────────────────
function readCatalog() {
    const html = fs.readFileSync(path.join(CONNECT_DIR, 'index_admin.html'), 'utf8');
    const marker = 'const PAGE_CATALOG = [';
    const start = html.indexOf(marker);
    if (start < 0) throw new Error('PAGE_CATALOG not found in index_admin.html');
    // Walk the bracket depth (string-aware) to find the end of the array literal.
    let i = start + marker.length - 1;
    let depth = 0;
    let quote = null;
    for (; i < html.length; i++) {
        const c = html[i];
        if (quote) {
            if (c === '\\') { i++; continue; }
            if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
        if (c === '[') depth++;
        else if (c === ']') { depth--; if (depth === 0) break; }
    }
    const literal = html.slice(start + marker.length - 1, i + 1);
    return vm.runInNewContext('(' + literal + ')');
}

// ── Text helpers ────────────────────────────────────────────────────────────
function decode(s) {
    return s
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function clean(s) {
    return decode(String(s).replace(/<[^>]*>/g, ' '))
        // Some pages contain double-encoded dashes ("â€“"); normalize, then drop emoji /
        // other non-ASCII so labels are plain text the model can quote.
        .replace(/â€[“”"\u2013\u2014]|[\u2013\u2014]/g, '-')
        .replace(/[^\x20-\x7E]/g, ' ')
        // Live counters rendered into buttons: "Overdue 0", "Show Hidden ( 3 )".
        .replace(/\(\s*\d+\s*\)/g, ' ')
        .replace(/\s+\d+\s*$/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[^A-Za-z0-9"']+/, '')
        .trim();
}

// Drop strings that are really JS template fragments rather than visible UI text.
function isUiText(s) {
    if (!s || s.length < 2 || s.length > 60) return false;
    if (/\$\{|\{\{|\}\}|\\n|=>|function\s*\(|[{};]|\+\s*['"`]|['"`]\s*\+/.test(s)) return false;
    if (!/[A-Za-z]/.test(s)) return false;
    return true;
}

function collect(html, regex, group, limit, filter = isUiText) {
    const seen = new Set();
    const out = [];
    let m;
    while ((m = regex.exec(html)) !== null) {
        const text = clean(m[group]);
        const key = text.toLowerCase();
        if (!filter(text) || seen.has(key)) continue;
        seen.add(key);
        out.push(text);
        if (out.length >= limit) break;
    }
    return out;
}

function extractPage(file) {
    let html = fs.readFileSync(path.join(CONNECT_DIR, file), 'utf8');
    html = html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ');

    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    const title = titleMatch ? clean(titleMatch[1]).replace(/\s*[-|–]\s*PandoConnect\s*$/i, '') : '';

    return {
        pageTitle: title,
        headings: collect(html, /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi, 2, MAX_HEADINGS),
        buttons: collect(html, /<button\b[^>]*>([\s\S]*?)<\/button>/gi, 1, MAX_BUTTONS),
        fields: [
            ...collect(html, /<label\b[^>]*>([\s\S]*?)<\/label>/gi, 1, MAX_FIELDS),
            ...collect(html, /placeholder="([^"]{3,80})"/gi, 1, 8),
        ].filter((v, i, a) => a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i).slice(0, MAX_FIELDS),
    };
}

// ── Build ───────────────────────────────────────────────────────────────────
function main() {
    const catalog = readCatalog();
    const byFile = new Map();
    catalog.forEach(p => byFile.set(String(p.href).split(/[?#]/)[0], p));

    const files = fs.readdirSync(CONNECT_DIR).filter(f => f.toLowerCase().endsWith('.html')).sort();
    const pages = [];
    const skipped = [];

    for (const file of files) {
        const cat = byFile.get(file);
        if (!cat && JUNK_PAGE.test(file)) { skipped.push(file); continue; }

        const ui = extractPage(file);
        pages.push({
            href: file,
            title: (cat && cat.title) || ui.pageTitle || file.replace(/\.html$/, '').replace(/[_-]+/g, ' '),
            section: (cat && cat.section) || 'Other',
            description: (cat && cat.description) || '',
            keywords: (cat && cat.keywords) || [],
            headings: ui.headings,
            buttons: ui.buttons,
            fields: ui.fields,
            catalogued: !!cat,
        });
    }

    const stale = catalog.filter(p => !files.includes(String(p.href).split(/[?#]/)[0]));
    const out = {
        generatedAt: new Date().toISOString(),
        pageCount: pages.length,
        pages,
    };
    fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 1) + '\n');

    console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)}`);
    console.log(`  ${pages.length} pages (${pages.filter(p => p.catalogued).length} from PAGE_CATALOG, ${pages.filter(p => !p.catalogued).length} uncatalogued)`);
    console.log(`  ${skipped.length} scratch/legacy pages skipped`);
    if (stale.length) console.log(`  WARNING: PAGE_CATALOG links to missing files: ${stale.map(p => p.href).join(', ')}`);
    console.log(`  ${(fs.statSync(OUT_FILE).size / 1024).toFixed(0)} KB`);
}

main();
