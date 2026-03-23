// Expand placeholder BibTeX entries using Crossref/OpenAlex metadata lookups.
//
// Expected input:
//   - poster/references_input.bib (raw entries; keys must match your \cite{...} usage)
//
// Output:
//   - poster/references.bib (expanded entries with placeholders removed where possible)
//
// Run:
//   node scripts/expand-bibtex.mjs

import fs from 'node:fs/promises';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const INPUT_PATH = path.join(REPO_ROOT, 'poster', 'references_input.bib');
const OUTPUT_PATH = path.join(REPO_ROOT, 'poster', 'references.bib');

const CROSSREF_WORKS_URL = 'https://api.crossref.org/works';
const OPENALEX_WORKS_URL = 'https://api.openalex.org/works';

const SLEEP_MS_BETWEEN_QUERIES = 250;
const MAX_CANDIDATES = 5;

function normalizeWhitespace(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeTitleForMatch(s) {
  return normalizeWhitespace(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function jaccardSimilarity(a, b) {
  const as = new Set(a.split(' ').filter(Boolean));
  const bs = new Set(b.split(' ').filter(Boolean));
  if (as.size === 0 || bs.size === 0) return 0;
  let intersection = 0;
  for (const x of as) if (bs.has(x)) intersection++;
  return intersection / (as.size + bs.size - intersection);
}

function pickBestByTitleSimilarity(queryTitle, candidates) {
  const nq = normalizeTitleForMatch(queryTitle);
  let best = null;
  let bestScore = -1;
  for (const c of candidates) {
    const title = c?.title ?? '';
    const nt = normalizeTitleForMatch(title);
    const score = jaccardSimilarity(nq, nt);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

function stripOuterBraces(s) {
  const t = normalizeWhitespace(s);
  if (t.startsWith('{') && t.endsWith('}')) return t.slice(1, -1).trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).trim();
  return t;
}

function parseYear(s) {
  if (!s) return undefined;
  const t = stripOuterBraces(s);
  const m = t.match(/(\d{4})/);
  if (!m) return undefined;
  return Number(m[1]);
}

function shouldExpandAuthors(authorValue) {
  if (!authorValue) return false;
  const t = authorValue.toLowerCase();
  // Common placeholder patterns used in your pasted block.
  return t.includes('others') || t.includes('and others');
}

function bibtexSplitTopLevelCommas(s) {
  // Split on commas not nested in {...} (and not inside quoted strings).
  const parts = [];
  let depth = 0;
  let inQuotes = false;
  let current = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && s[i - 1] !== '\\') inQuotes = !inQuotes;
    if (!inQuotes) {
      if (ch === '{') depth++;
      if (ch === '}') depth = Math.max(0, depth - 1);
    }
    if (!inQuotes && depth === 0 && ch === ',') {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function extractEntryBlocks(bibText) {
  const blocks = [];
  let i = 0;
  while (i < bibText.length) {
    const at = bibText.indexOf('@', i);
    if (at === -1) break;
    // Scan from first "{" for matching "}" at brace depth.
    const braceStart = bibText.indexOf('{', at);
    if (braceStart === -1) break;
    let level = 0;
    let end = -1;
    for (let j = braceStart; j < bibText.length; j++) {
      const ch = bibText[j];
      if (ch === '{') level++;
      if (ch === '}') {
        level--;
        if (level === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) break;
    blocks.push(bibText.slice(at, end + 1));
    i = end + 1;
  }
  return blocks;
}

function parseBibtexEntryBlock(block) {
  const header = block.match(/^@(\w+)\s*{\s*([^,]+)\s*,/s);
  if (!header) return null;
  const type = header[1];
  const key = header[2].trim();

  const bodyStart = header.index + header[0].length;
  const bodyEnd = block.lastIndexOf('}');
  const body = block.slice(bodyStart, bodyEnd);
  const fieldParts = bibtexSplitTopLevelCommas(body);

  const fields = {};
  for (const part of fieldParts) {
    const line = part.trim();
    if (!line) continue;
    const m = line.match(/^([a-zA-Z]+)\s*=\s*(.+)$/s);
    if (!m) continue;
    const name = m[1].trim();
    let value = m[2].trim();
    // Drop trailing commas if any slipped through.
    value = value.replace(/,\s*$/, '').trim();
    fields[name] = value;
  }

  return { type, key, fields };
}

function formatBibtexValue(value) {
  // Preserve braces/quotes if the value already has them.
  const t = value.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('"') && t.endsWith('"'))) return t;
  // Otherwise wrap.
  return `{${t}}`;
}

function formatBibtexEntry(entry, fieldOrder) {
  const keys = Object.keys(entry.fields);
  const ordered = [];
  for (const f of fieldOrder) if (entry.fields[f] !== undefined) ordered.push(f);
  for (const k of keys) if (!ordered.includes(k)) ordered.push(k);

  const lines = [];
  lines.push(`@${entry.type}{${entry.key},`);
  for (let idx = 0; idx < ordered.length; idx++) {
    const f = ordered[idx];
    const v = entry.fields[f];
    if (v === undefined) continue;
    const comma = idx === ordered.length - 1 ? '' : ',';
    lines.push(`  ${f} = ${v}${comma}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function isPlaceholderNote(noteValue) {
  if (!noteValue) return false;
  const t = noteValue.toLowerCase();
  return t.includes('placeholder');
}

function formatCrossrefAuthors(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return undefined;
  const parts = [];
  for (const a of authors) {
    const family = a.family ?? '';
    const given = a.given ?? '';
    if (family && given) parts.push(`${family}, ${given}`.trim());
    else if (family) parts.push(family);
    else if (a.name) parts.push(a.name);
  }
  if (parts.length === 0) return undefined;
  return parts.join(' and ');
}

function formatOpenAlexAuthors(work) {
  const auths = work?.authorships ?? [];
  if (!Array.isArray(auths) || auths.length === 0) return undefined;
  const names = auths
    .map((a) => a?.author?.display_name)
    .filter(Boolean)
    .map((n) => n.replace(/\s+/g, ' ').trim());
  if (names.length === 0) return undefined;
  return names.join(' and ');
}

async function crossrefLookup(title, year) {
  const params = new URLSearchParams({
    'query.title': title,
    rows: String(MAX_CANDIDATES),
  });

  if (year) {
    params.set(
      'filter',
      `from-pub-date:${year}-01-01,until-pub-date:${year}-12-31`
    );
  }

  const url = `${CROSSREF_WORKS_URL}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'gaiol-bib-expander/1.0 (local)' },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const items = json?.message?.items ?? [];
  return items.map((it) => ({
    raw: it,
    title: it?.title?.[0] ?? '',
    year: Array.isArray(it?.issued?.['date-parts']) ? it.issued['date-parts']?.[0]?.[0] : undefined,
    doi: it?.DOI ?? undefined,
    url: it?.URL ?? undefined,
    publisher: it?.publisher ?? undefined,
    volume: it?.volume ?? undefined,
    issue: it?.issue ?? undefined,
    pages: it?.page ?? undefined,
    journalOrBooktitle:
      it?.['container-title']?.[0] ??
      it?.event ??
      undefined,
    authors: it?.author ?? undefined,
  }));
}

async function openAlexLookup(title, year) {
  const url = new URL(OPENALEX_WORKS_URL);
  url.searchParams.set('search', title);
  url.searchParams.set('per-page', String(MAX_CANDIDATES));
  // Avoid huge responses; keep it small.
  url.searchParams.set('page', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'gaiol-bib-expander/1.0 (local)' },
  });
  if (!res.ok) return null;
  const json = await res.json();
  const works = json?.results ?? [];
  return works.map((w) => ({
    raw: w,
    title: w?.title ?? '',
    year: w?.publication_year ?? undefined,
    doi: w?.doi ?? undefined,
    url:
      w?.primary_location?.landing_page_url ??
      w?.best_oa_location?.landing_page_url ??
      undefined,
    // Prefer the most specific venue name if present.
    journalOrBooktitle: w?.primary_location?.source?.display_name ?? w?.host_venue?.display_name ?? undefined,
    publisher: w?.publisher ?? undefined,
    volume: undefined,
    issue: undefined,
    pages: undefined,
    authors: w ?? undefined,
  }));
}

async function enrichEntry(entry) {
  const titleRaw = entry.fields.title;
  const yearRaw = entry.fields.year;
  if (!titleRaw) return null;
  const title = stripOuterBraces(titleRaw);
  const year = parseYear(yearRaw);

  const placeholderNote = entry.fields.note && isPlaceholderNote(entry.fields.note);

  // Query Crossref first (often best for DOI-rich items).
  let candidates = await crossrefLookup(title, year);
  if (!candidates || candidates.length === 0) {
    candidates = await openAlexLookup(title, year);
  }
  if (!candidates || candidates.length === 0) return null;

  // Prefer exact-ish year matches when possible.
  const yearMatches = year ? candidates.filter((c) => c.year === year) : candidates;
  const bestPool = yearMatches.length > 0 ? yearMatches : candidates;
  const best = pickBestByTitleSimilarity(title, bestPool);
  if (!best) return null;

  // Map to BibTeX/BibLaTeX fields.
  const updates = {};
  const raw = best.raw;

  if (best.journalOrBooktitle) {
    if (entry.type === 'article' || entry.type === 'inarticle') updates.journal = formatBibtexValue(best.journalOrBooktitle);
    if (entry.type === 'inproceedings') updates.booktitle = formatBibtexValue(best.journalOrBooktitle);
    // For @misc, we can still put it in `journal` (biblatex prints it either way).
    if (entry.type === 'misc' && updates.journal === undefined) updates.journal = formatBibtexValue(best.journalOrBooktitle);
    if (entry.type === 'techreport' && entry.fields.institution === undefined) {
      updates.institution = formatBibtexValue(best.publisher ?? 'Unknown');
    }
  }

  if (best.volume) updates.volume = formatBibtexValue(best.volume);
  if (best.issue) updates.number = formatBibtexValue(best.issue);
  if (best.pages) updates.pages = formatBibtexValue(best.pages);
  if (best.publisher && entry.fields.publisher === undefined) updates.publisher = formatBibtexValue(best.publisher);

  if (best.doi) {
    updates.doi = formatBibtexValue(best.doi.toString());
    if (!updates.url && best.url) updates.url = formatBibtexValue(best.url);
  } else if (best.url && entry.fields.url === undefined) {
    updates.url = formatBibtexValue(best.url);
  }

  if (placeholderNote) {
    // Remove the placeholder note entirely once we have better fields.
    delete entry.fields.note;
  }

  // Expand authors if the input uses placeholder authors (e.g. "others").
  if (shouldExpandAuthors(entry.fields.author)) {
    // Prefer the candidate author list from Crossref/OpenAlex.
    // Crossref provides `raw.author`; OpenAlex provides `raw.authorships`.
    if (raw?.author && Array.isArray(raw.author)) {
      const s = formatCrossrefAuthors(raw.author);
      if (s) updates.author = `{${s}}`;
    } else if (raw?.authorships) {
      const s = formatOpenAlexAuthors(raw);
      if (s) updates.author = `{${s}}`;
    }
  }

  // Ensure year is set (keep original if present).
  if (entry.fields.year === undefined && year) updates.year = formatBibtexValue(String(year));

  for (const [k, v] of Object.entries(updates)) {
    entry.fields[k] = v;
  }

  return entry;
}

async function main() {
  const inputExists = await fs
    .access(INPUT_PATH)
    .then(() => true)
    .catch(() => false);

  if (!inputExists) {
    throw new Error(`Missing input file: ${INPUT_PATH}`);
  }

  const rawBib = await fs.readFile(INPUT_PATH, 'utf8');
  const blocks = extractEntryBlocks(rawBib);
  const entries = blocks.map(parseBibtexEntryBlock).filter(Boolean);

  if (entries.length === 0) {
    throw new Error('No BibTeX entries found in input.');
  }

  // Strip nonstandard fields like `key = {...}` if present.
  for (const e of entries) {
    if (e.fields.key !== undefined) delete e.fields.key;
  }

  // Enrichment.
  for (let idx = 0; idx < entries.length; idx++) {
    const e = entries[idx];
    // Basic debug: only log entry keys to keep output readable.
    // eslint-disable-next-line no-console
    console.log(`[${idx + 1}/${entries.length}] Enriching ${e.key} (${e.type})`);
    try {
      await enrichEntry(e);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`  - Lookup failed for ${e.key}: ${err?.message ?? err}`);
    }
    await new Promise((r) => setTimeout(r, SLEEP_MS_BETWEEN_QUERIES));
  }

  const fieldOrder = [
    'author',
    'title',
    'journal',
    'booktitle',
    'publisher',
    'institution',
    'volume',
    'number',
    'pages',
    'year',
    'doi',
    'url',
    'eprint',
    'howpublished',
  ];

  const outputParts = entries.map((e) => formatBibtexEntry(e, fieldOrder));
  const output = outputParts.join('\n\n') + '\n';

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, output, 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote expanded BibTeX to ${OUTPUT_PATH}`);
}

await main();

