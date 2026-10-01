export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  const norm: string[] = [];
  const map: number[] = [];
  
  let i = 0;
  let inWhitespace = false;

  while (i < text.length) {
    let char = text[i];
    const origIndex = i;

    // 1. Check for hyphenated line break: termi- \n nation
    // Hyphen followed by optional spaces, then a newline, then optional spaces.
    if (char === '-' || char === '\u2010' || char === '\u2013' || char === '\u2014' || char === '\u00AD') {
      let j = i + 1;
      let hasNewline = false;
      while (j < text.length) {
        const nextChar = text[j];
        if (nextChar === '\n' || nextChar === '\r') {
          hasNewline = true;
          j++;
        } else if (nextChar === ' ' || nextChar === '\t' || nextChar === '\u00A0') {
          j++;
        } else {
          break;
        }
      }
      if (hasNewline) {
        // It's a hyphenated word broken across a line. 
        // We drop the hyphen and the whitespace!
        i = j;
        continue;
      }
    }

    // 2. Remove soft hyphens and zero width
    if (char === '\u00AD' || char === '\u200B' || char === '\u200C' || char === '\u200D' || char === '\uFEFF') {
      i++;
      continue;
    }

    // 3. Curly/smart quotes
    if (char === '“' || char === '”' || char === '«' || char === '»' || char === '„') {
      char = '"';
    } else if (char === '‘' || char === '’' || char === '‚' || char === '`') {
      char = "'";
    }

    // 4. Hyphens/minus
    if (char === '\u2010' || char === '\u2011' || char === '\u2012' || char === '\u2013' || char === '\u2014' || char === '\u2015' || char === '\u2212') {
      char = '-';
    }

    // 5. Ligatures (basic ASCII ones often found in PDFs)
    let isLigature = true;
    let ligStr = char;
    if (char === 'ﬁ') ligStr = 'fi';
    else if (char === 'ﬂ') ligStr = 'fl';
    else if (char === 'ﬀ') ligStr = 'ff';
    else if (char === 'ﬃ') ligStr = 'ffi';
    else if (char === 'ﬄ') ligStr = 'ffl';
    else if (char === 'ﬅ') ligStr = 'st';
    else if (char === 'ﬆ') ligStr = 'st';
    else if (char === 'æ') ligStr = 'ae';
    else if (char === 'œ') ligStr = 'oe';
    else isLigature = false;

    if (isLigature) {
      for (const c of ligStr) {
        norm.push(c);
        map.push(origIndex);
      }
      inWhitespace = false;
      i++;
      continue;
    }

    // 6. Whitespace
    // Note: includes spaces, tabs, newlines, NBSP
    if (/\s/.test(char) || char === '\u00A0') {
      if (!inWhitespace) {
        norm.push(' ');
        map.push(origIndex);
        inWhitespace = true;
      }
      i++;
      continue;
    }

    inWhitespace = false;
    
    // Normalise via NFKC for other chars, then lowercase
    const nfkc = char.normalize('NFKC').toLowerCase();
    for (const c of nfkc) {
      norm.push(c);
      map.push(origIndex);
    }
    
    i++;
  }

  // Trim start/end. Since we built arrays, we can just slice them.
  let start = 0;
  while (start < norm.length && norm[start] === ' ') start++;
  
  let end = norm.length;
  while (end > start && norm[end - 1] === ' ') end--;

  return {
    norm: norm.slice(start, end).join(''),
    map: map.slice(start, end)
  };
}

export function normalizeQuery(text: string): string {
  return normalizeWithMap(text).norm;
}
