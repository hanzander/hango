/** Minimal Discord-like markdown → React-safe HTML-ish segments */

export type TextSeg =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "spoiler"; value: string }
  | { type: "mention"; value: string };

export function parseDiscordMarkdown(input: string): TextSeg[] {
  const segs: TextSeg[] = [];
  const re =
    /(\|\|([\s\S]+?)\|\|)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(@\w+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) {
      segs.push({ type: "text", value: input.slice(last, m.index) });
    }
    if (m[1]) segs.push({ type: "spoiler", value: m[2] });
    else if (m[3]) segs.push({ type: "bold", value: m[4] });
    else if (m[5]) segs.push({ type: "italic", value: m[6] });
    else if (m[7]) segs.push({ type: "code", value: m[8] });
    else if (m[9]) segs.push({ type: "mention", value: m[9] });
    last = m.index + m[0].length;
  }
  if (last < input.length) {
    segs.push({ type: "text", value: input.slice(last) });
  }
  return segs.length ? segs : [{ type: "text", value: input }];
}
