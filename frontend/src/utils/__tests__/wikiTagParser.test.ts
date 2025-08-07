import { parseWikiTags, WikiTaggedText, extractWikiConcepts } from '../wikiTagParser';

describe('Wiki Tag Parser', () => {
  it('should parse simple wiki tags', () => {
    const text = 'This is about [[machine learning]] and AI.';
    const result = parseWikiTags(text);
    
    expect(result).toEqual([
      { type: 'text', content: 'This is about ' },
      { type: 'wikiTag', content: 'machine learning', originalText: '[[machine learning]]' },
      { type: 'text', content: ' and AI.' }
    ]);
  });

  it('should parse multiple wiki tags', () => {
    const text = '[[React]] is great for [[frontend development]] projects.';
    const result = parseWikiTags(text);
    
    expect(result).toEqual([
      { type: 'wikiTag', content: 'React', originalText: '[[React]]' },
      { type: 'text', content: ' is great for ' },
      { type: 'wikiTag', content: 'frontend development', originalText: '[[frontend development]]' },
      { type: 'text', content: ' projects.' }
    ]);
  });

  it('should handle text with no wiki tags', () => {
    const text = 'This is just regular text without any tags.';
    const result = parseWikiTags(text);
    
    expect(result).toEqual([
      { type: 'text', content: 'This is just regular text without any tags.' }
    ]);
  });

  it('should handle empty text', () => {
    const text = '';
    const result = parseWikiTags(text);
    
    expect(result).toEqual([]);
  });

  it('should handle wiki tags at start and end', () => {
    const text = '[[TypeScript]] is used in [[React Native]]';
    const result = parseWikiTags(text);
    
    expect(result).toEqual([
      { type: 'wikiTag', content: 'TypeScript', originalText: '[[TypeScript]]' },
      { type: 'text', content: ' is used in ' },
      { type: 'wikiTag', content: 'React Native', originalText: '[[React Native]]' }
    ]);
  });

  it('should handle nested brackets correctly', () => {
    const text = 'This [[has [nested] brackets]] inside.';
    const result = parseWikiTags(text);
    
    expect(result).toEqual([
      { type: 'text', content: 'This ' },
      { type: 'wikiTag', content: 'has [nested] brackets', originalText: '[[has [nested] brackets]]' },
      { type: 'text', content: ' inside.' }
    ]);
  });

  it('should ignore incomplete wiki tags', () => {
    const text = 'This has [[incomplete and [single] brackets.';
    const result = parseWikiTags(text);
    
    expect(result).toEqual([
      { type: 'text', content: 'This has [[incomplete and [single] brackets.' }
    ]);
  });

  it('should handle adjacent wiki tags', () => {
    const text = '[[React]][[TypeScript]] combination';
    const result = parseWikiTags(text);
    
    expect(result).toEqual([
      { type: 'wikiTag', content: 'React', originalText: '[[React]]' },
      { type: 'wikiTag', content: 'TypeScript', originalText: '[[TypeScript]]' },
      { type: 'text', content: ' combination' }
    ]);
  });

  it('should handle wiki tags with special characters', () => {
    const text = 'Learn about [[C++]] and [[Node.js]] frameworks.';
    const result = parseWikiTags(text);
    
    expect(result).toEqual([
      { type: 'text', content: 'Learn about ' },
      { type: 'wikiTag', content: 'C++', originalText: '[[C++]]' },
      { type: 'text', content: ' and ' },
      { type: 'wikiTag', content: 'Node.js', originalText: '[[Node.js]]' },
      { type: 'text', content: ' frameworks.' }
    ]);
  });
});

describe('Extract Wiki Concepts', () => {
  it('should extract unique concepts from text', () => {
    const text = 'Learn [[React]] and [[TypeScript]] for [[React]] development.';
    const concepts = extractWikiConcepts(text);
    
    expect(concepts).toEqual(['React', 'TypeScript']);
  });

  it('should return empty array for text with no concepts', () => {
    const text = 'This has no wiki tags at all.';
    const concepts = extractWikiConcepts(text);
    
    expect(concepts).toEqual([]);
  });

  it('should handle empty text', () => {
    const text = '';
    const concepts = extractWikiConcepts(text);
    
    expect(concepts).toEqual([]);
  });
});