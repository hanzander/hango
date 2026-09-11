/** Minimal Discord-like markdown → React-safe segments */

export type TextSeg =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "spoiler"; value: string }
  | { type: "mention"; value: string };

const SPECIAL = /@(?:everyone|here)\b/i;
const SINGLE = /@[A-Za-z0-9_.-]+/;

/**
 * Prefer exact known display names (longest first) so
 * "@Han Zander gawin" only highlights "@Han Zander".
 */
export function parseDiscordMarkdown(
  input: string,
  knownNames: string[] = [],
): TextSeg[] {
  const names = [...new Set(knownNames.filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );

  const segs: TextSeg[] = [];
  // Spoilers / bold / italic / code — mentions handled separately after
  const re =
    /(\|\|([\s\S]+?)\|\|)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(@)/g;

  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    if (m.index > last) {
      segs.push({ type: "text", value: input.slice(last, m.index) });
    }

    if (m[1]) {
      segs.push({ type: "spoiler", value: m[2] });
      last = m.index + m[0].length;
      continue;
    }
    if (m[3]) {
      segs.push({ type: "bold", value: m[4] });
      last = m.index + m[0].length;
      continue;
    }
    if (m[5]) {
      segs.push({ type: "italic", value: m[6] });
      last = m.index + m[0].length;
      continue;
    }
    if (m[7]) {
      segs.push({ type: "code", value: m[8] });
      last = m.index + m[0].length;
      continue;
    }

    // Mentions start at "@"
    const from = m.index;
    const rest = input.slice(from);
    let matched: string | null = null;

    const special = rest.match(SPECIAL);
    if (special && special.index === 0) {
      matched = special[0];
    } else {
      for (const name of names) {
        const candidate = `@${name}`;
        if (rest.toLowerCase().startsWith(candidate.toLowerCase())) {
          const after = rest[candidate.length];
          // Boundary: end, whitespace, or punctuation — not more name chars
          if (
            after == null ||
            /[\s.,!?;:'")\]\}<>]/.test(after)
          ) {
            matched = rest.slice(0, candidate.length);
            break;
          }
        }
      }
      if (!matched) {
        const single = rest.match(SINGLE);
        if (single && single.index === 0) matched = single[0];
      }
    }

    if (matched) {
      segs.push({ type: "mention", value: matched });
      last = from + matched.length;
      re.lastIndex = last;
    } else {
      segs.push({ type: "text", value: "@" });
      last = from + 1;
      re.lastIndex = last;
    }
  }

  if (last < input.length) {
    segs.push({ type: "text", value: input.slice(last) });
  }
  return segs.length ? segs : [{ type: "text", value: input }];
}
