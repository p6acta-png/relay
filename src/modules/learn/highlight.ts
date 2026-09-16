/**
 * A deliberately small syntax highlighter for the excerpts in /learn.
 *
 * It recognises comments, strings, numbers and keywords — enough to make code readable without
 * shipping a full grammar engine. Output is plain tokens; React escapes the text when rendering,
 * so no HTML is ever built from source code.
 */
export type TokenKind = 'plain' | 'comment' | 'string' | 'keyword' | 'number' | 'type' | 'fn';
export interface Token {
  kind: TokenKind;
  text: string;
}

const TS_KEYWORDS = new Set(
  'import export from as const let var function async await return if else for of in while switch case break continue default throw try catch finally new typeof instanceof interface type extends implements class private public readonly static void null undefined true false this satisfies keyof declare unique symbol'.split(
    ' ',
  ),
);
const SQL_KEYWORDS = new Set(
  'select from where and or not null is in as on create alter table add constraint check using with policy enable row level security function returns language stable exclude gist extension if exists between insert into values conflict do update set returning count filter group order by within type value before'.split(
    ' ',
  ),
);

// Alternatives, in priority order: closed block comment | unclosed block comment | line comment |
// string | number | word | anything else.
const TS_PATTERN =
  /(\/\*.*?\*\/)|(\/\*.*$)|(\/\/.*$)|(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d[\d_.]*\b)|([A-Za-z_$][\w$]*)|(\s+|.)/g;
const SQL_PATTERN = /((?!))|((?!))|(--.*$)|('(?:[^']|'')*'|"[^"]*")|(\b\d+\b)|([A-Za-z_]\w*)|(\s+|.)/g;

export function highlight(lines: string[], language: 'ts' | 'sql'): Token[][] {
  let inBlockComment = false;
  return lines.map((line) => {
    const tokens: Token[] = [];
    const push = (kind: TokenKind, text: string) => {
      const last = tokens.at(-1);
      if (last && last.kind === kind) last.text += text;
      else if (text) tokens.push({ kind, text });
    };

    let rest = line;
    if (inBlockComment) {
      const end = line.indexOf('*/');
      if (end === -1) return [{ kind: 'comment', text: line }];
      push('comment', line.slice(0, end + 2));
      rest = line.slice(end + 2);
      inBlockComment = false;
    }

    const pattern = new RegExp(language === 'sql' ? SQL_PATTERN : TS_PATTERN);
    const keywords = language === 'sql' ? SQL_KEYWORDS : TS_KEYWORDS;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(rest)) !== null) {
      const [text, closedBlock, openBlock, lineComment, string, number, word] = match;
      if (text === '') break;
      if (closedBlock || lineComment) push('comment', text);
      else if (openBlock) {
        push('comment', text);
        inBlockComment = true;
      } else if (string) push('string', text);
      else if (number) push('number', text);
      else if (word) {
        if (keywords.has(language === 'sql' ? word.toLowerCase() : word)) push('keyword', text);
        else if (language === 'ts' && rest.slice(pattern.lastIndex).startsWith('(')) push('fn', text);
        else if (language === 'ts' && /^[A-Z]/.test(word)) push('type', text);
        else push('plain', text);
      } else push('plain', text);
    }
    return tokens;
  });
}
