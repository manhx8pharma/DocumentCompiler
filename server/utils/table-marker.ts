/**
 * XML-safe marker parsing for <<TABLE_NAME:col1,col2,...>> placeholders.
 *
 * CRITICAL: Inside word/document.xml, angle brackets are stored as XML entities.
 * A marker typed as <<NAME:col1,col2>> in Word is stored as:
 *   &lt;&lt;NAME:col1,col2&gt;&gt;
 *
 * All detection/replacement must search for &lt;&lt; / &gt;&gt;, NOT literal << / >>.
 */

export interface ParsedTableMarker {
  name: string;
  columns: Array<{ name: string; label: string }>;
}

/**
 * Fast no-op guard: returns true only if the XML contains table markers.
 * Checks for the XML-encoded form &lt;&lt; so it works on raw document.xml content.
 */
export function hasTableMarkers(xml: string): boolean {
  return xml.includes('&lt;&lt;');
}

/**
 * Join all <w:t> text content within a single <w:p> paragraph XML string.
 * Word often splits text across multiple <w:r><w:t> runs.
 * This reconstructs the logical text so markers can be found even when split.
 */
export function joinRunText(paragraphXml: string): string {
  const parts: string[] = [];
  // Match <w:t> and <w:t xml:space="preserve"> variants
  const wtRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let match;
  while ((match = wtRegex.exec(paragraphXml)) !== null) {
    parts.push(match[1]);
  }
  return parts.join('');
}

/**
 * Parse a single reconstructed paragraph text for a table marker.
 * The text may contain XML entities (e.g. &lt;&lt;NAME:col1,col2&gt;&gt;).
 * Returns null if no marker found.
 *
 * Supported formats (after XML entity decoding):
 *   <<TABLE_NAME:col1,col2,col3>>   — columns specified in marker
 *   <<TABLE_NAME>>                  — no columns (columns defined separately in UI)
 */
export function parseTableMarkerFromText(text: string): ParsedTableMarker | null {
  // The raw text captured from <w:t> nodes in DOCX XML still contains XML entities.
  // Word stores literal << as &lt;&lt; and >> as &gt;&gt; in the file.
  // We must decode entities before regex-matching for literal << and >>.
  const decoded = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();

  const match = decoded.match(/^<<([A-Z][A-Z0-9_]*)(?::([^>]*))?>>$/);
  if (!match) return null;

  const name = match[1];
  const colPart = match[2] || '';
  const columns = colPart
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(colName => ({ name: colName, label: colName }));

  return { name, columns };
}

/**
 * Parse all table markers from raw document.xml content.
 * Iterates over each <w:p> paragraph, joins runs, then checks for a marker.
 *
 * Returns array of { name, columns } for each unique marker found.
 * Duplicate names are deduplicated (first occurrence wins).
 */
export function parseTableMarkersFromXml(xml: string): ParsedTableMarker[] {
  if (!hasTableMarkers(xml)) return [];

  const results: ParsedTableMarker[] = [];
  const seenNames = new Set<string>();

  // Split XML into individual paragraphs
  const paragraphRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let pMatch;

  while ((pMatch = paragraphRegex.exec(xml)) !== null) {
    const paragraphXml = pMatch[0];

    // Quick check: skip paragraphs that don't contain &lt;&lt;
    if (!paragraphXml.includes('&lt;&lt;')) continue;

    // Join all <w:t> content to reconstruct logical text
    const text = joinRunText(paragraphXml).trim();

    // Parse the marker from the joined text
    const marker = parseTableMarkerFromText(text);
    if (marker && !seenNames.has(marker.name)) {
      seenNames.add(marker.name);
      results.push(marker);
    }
  }

  return results;
}

/**
 * Find the full <w:p>...</w:p> XML string for a given table marker name.
 * Returns null if not found. Used by the injector to locate the paragraph to replace.
 */
export function findMarkerParagraphXml(xml: string, tableName: string): string | null {
  const paragraphRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let pMatch;

  while ((pMatch = paragraphRegex.exec(xml)) !== null) {
    const paragraphXml = pMatch[0];
    if (!paragraphXml.includes('&lt;&lt;')) continue;

    const text = joinRunText(paragraphXml).trim();
    const marker = parseTableMarkerFromText(text);
    if (marker && marker.name === tableName) {
      return paragraphXml;
    }
  }

  return null;
}
