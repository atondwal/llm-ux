export interface WikiTaggedText {
  type: 'text' | 'wikiTag';
  content: string;
  originalText?: string; // For wikiTag type, stores the original [[concept]] format
}

/**
 * Parses text containing wiki-style [[concept]] tags and returns an array of text segments
 * and wiki tag objects for rendering.
 */
export function parseWikiTags(text: string): WikiTaggedText[] {
  if (!text) {
    return [];
  }

  const result: WikiTaggedText[] = [];
  const wikiTagRegex = /\[\[([^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*)\]\]/g;
  
  let lastIndex = 0;
  let match;

  while ((match = wikiTagRegex.exec(text)) !== null) {
    // Add text before the wiki tag (if any)
    if (match.index > lastIndex) {
      result.push({
        type: 'text',
        content: text.slice(lastIndex, match.index)
      });
    }

    // Add the wiki tag
    result.push({
      type: 'wikiTag',
      content: match[1], // The content inside [[]]
      originalText: match[0] // The full [[concept]] string
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after the last wiki tag (if any)
  if (lastIndex < text.length) {
    result.push({
      type: 'text',
      content: text.slice(lastIndex)
    });
  }

  return result;
}

/**
 * Extracts all unique wiki concepts from a text string.
 */
export function extractWikiConcepts(text: string): string[] {
  const parsed = parseWikiTags(text);
  const concepts = parsed
    .filter(segment => segment.type === 'wikiTag')
    .map(segment => segment.content);
  
  // Return unique concepts only
  return [...new Set(concepts)];
}