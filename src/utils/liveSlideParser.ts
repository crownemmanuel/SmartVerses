import { LiveSlide } from "../types/liveSlides";

// Slide colors palette - matches Rust backend
const SLIDE_COLORS = [
  "#3B82F6", // Blue
  "#F59E0B", // Yellow/Amber
  "#EC4899", // Pink
  "#10B981", // Green
  "#8B5CF6", // Purple
  "#EF4444", // Red
  "#06B6D4", // Cyan
  "#F97316", // Orange
];

/**
 * Strip bullet character from text when importing
 * The bullet (•) is just for visual display in the notepad
 */
export function stripBulletPrefix(text: string): string {
  // Remove bullet character and any surrounding whitespace at the start
  // Handle both "• text" and just "•" patterns
  return text.replace(/^•\s*/, "").trim();
}

/**
 * Parse notepad text into slides
 *
 * Parsing Rules:
 * - Empty line = New slide boundary
 * - Consecutive non-empty, non-indented lines = One slide with multiple items
 * - Tab or 4 spaces at start = Indented child item
 *
 * When a parent line has indented children:
 * - First slide: Parent only
 * - Then: One slide per child, each with parent + that child
 *
 * Example:
 * "Line A\nLine B" → Slide 1: [Line A, Line B] (same slide, consecutive lines)
 * "Line A\n\nLine B" → Slide 1: [Line A], Slide 2: [Line B] (different slides, separated by empty line)
 * "Parent\n\tChild1\n\tChild2" → Slide 1: [Parent], Slide 2: [Parent, ↳Child1], Slide 3: [Parent, ↳Child2]
 */
export function parseNotepadText(text: string): LiveSlide[] {
  const slides: LiveSlide[] = [];
  let colorIndex = 0;

  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      // Empty line = new slide boundary
      i++;
      continue;
    }

    if (line.startsWith("\t") || line.startsWith("    ")) {
      // Orphaned indented line (no parent) - treat as regular line
      const trimmed = stripBulletPrefix(line.replace(/^(\t|    )/, "").trimStart());
      slides.push({
        items: [
          {
            text: trimmed,
            is_sub_item: false,
          },
        ],
        color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
      });
      colorIndex++;
      i++;
    } else {
      // Regular line - check what follows
      const parentText = line;

      // First, check for indented children
      const children: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (nextLine.trim() === "") {
          break; // Empty line stops the group
        }
        if (nextLine.startsWith("\t") || nextLine.startsWith("    ")) {
          const trimmed = stripBulletPrefix(nextLine.replace(/^(\t|    )/, "").trimStart());
          children.push(trimmed);
          j++;
        } else {
          break; // Non-indented line stops collecting children
        }
      }

      if (children.length > 0) {
        // Has indented children - create parent-only slide first, then one slide per child
        // First: parent-only slide
        slides.push({
          items: [
            {
              text: parentText,
              is_sub_item: false,
            },
          ],
          color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
        });
        colorIndex++;

        // Then: one slide per child (parent + child)
        for (const child of children) {
          slides.push({
            items: [
              {
                text: parentText,
                is_sub_item: false,
              },
              {
                text: child,
                is_sub_item: true,
              },
            ],
            color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
          });
          colorIndex++;
        }
        
        i = j; // Move past all processed lines
      } else {
        // No indented children - collect consecutive non-indented lines as ONE slide
        const slideItems: { text: string; is_sub_item: boolean }[] = [
          { text: parentText, is_sub_item: false },
        ];
        
        j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          if (nextLine.trim() === "") {
            break; // Empty line stops the group
          }
          if (nextLine.startsWith("\t") || nextLine.startsWith("    ")) {
            break; // Indented line stops this group
          }
          // Non-indented, non-empty line - part of same slide
          slideItems.push({ text: nextLine, is_sub_item: false });
          j++;
        }
        
        slides.push({
          items: slideItems,
          color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
        });
        colorIndex++;
        
        i = j; // Move past all processed lines
      }
    }
  }

  return slides;
}

/**
 * Calculate slide boundaries with line numbers for visual indicators
 * Returns an array of { startLine, endLine, color } for each slide
 */
export interface SlideBoundary {
  startLine: number;
  endLine: number;
  color: string;
  slideIndex: number;
}

export function calculateSlideBoundaries(text: string): SlideBoundary[] {
  const boundaries: SlideBoundary[] = [];
  const lines = text.split("\n");

  let colorIndex = 0;
  let slideIndex = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      // Empty line - skip
      i++;
      continue;
    }

    if (line.startsWith("\t") || line.startsWith("    ")) {
      // Orphaned indented line - single line slide
      boundaries.push({
        startLine: i,
        endLine: i,
        color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
        slideIndex: slideIndex,
      });
      colorIndex++;
      slideIndex++;
      i++;
    } else {
      // Regular line - check what follows
      // Collect all immediately following lines (both indented and non-indented)
      let j = i + 1;
      let hasIndentedChildren = false;
      
      // First, check if there are any indented children immediately after
      while (j < lines.length) {
        const nextLine = lines[j];
        if (nextLine.trim() === "") {
          break; // Empty line stops the group
        }
        if (nextLine.startsWith("\t") || nextLine.startsWith("    ")) {
          hasIndentedChildren = true;
          j++;
        } else {
          break; // Non-indented line stops collecting children
        }
      }

      if (hasIndentedChildren) {
        // Has indented children - parent-only slide first
        const lastChildLine = j - 1;
        
        boundaries.push({
          startLine: i,
          endLine: i,
          color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
          slideIndex: slideIndex,
        });
        colorIndex++;
        slideIndex++;

        // Then one slide per child (each spans parent + that child line)
        for (let childIdx = i + 1; childIdx <= lastChildLine; childIdx++) {
          boundaries.push({
            startLine: i, // Start at parent
            endLine: childIdx, // End at this child
            color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
            slideIndex: slideIndex,
          });
          colorIndex++;
          slideIndex++;
        }
        
        i = j; // Move past all processed lines
      } else {
        // No indented children - collect consecutive non-indented, non-empty lines as ONE slide
        j = i + 1;
        while (j < lines.length) {
          const nextLine = lines[j];
          if (nextLine.trim() === "") {
            break; // Empty line stops the group
          }
          if (nextLine.startsWith("\t") || nextLine.startsWith("    ")) {
            break; // Indented line stops this group (will be handled as orphan or next parent's child)
          }
          // Non-indented, non-empty line - part of same slide
          j++;
        }
        
        // All lines from i to j-1 are one slide
        boundaries.push({
          startLine: i,
          endLine: j - 1,
          color: SLIDE_COLORS[colorIndex % SLIDE_COLORS.length],
          slideIndex: slideIndex,
        });
        colorIndex++;
        slideIndex++;
        
        i = j; // Move past all processed lines
      }
    }
  }

  return boundaries;
}

/**
 * Get the color for a specific line number based on which slide it belongs to
 */
export function getLineColor(
  lineNumber: number,
  boundaries: SlideBoundary[]
): string | null {
  for (const boundary of boundaries) {
    if (lineNumber >= boundary.startLine && lineNumber <= boundary.endLine) {
      return boundary.color;
    }
  }
  return null;
}

/**
 * Format slides as text for display or export
 */
export function formatSlidesAsText(slides: LiveSlide[]): string {
  return slides
    .map((slide) => slide.items.map((item) => item.text).join("\n"))
    .join("\n\n");
}

// Regexes to detect bullet/numbered list lines (match notepad format)
const BULLET_LINE_REGEX = /^\s*•\s*/;
const NUMBERED_LINE_REGEX = /^\s*(\d+)\.\s*/;

export interface ParsedSlideListMeta {
  listStyle: "bullet" | "numbered" | null;
  items: { isSubItem: boolean; listNumber?: number }[];
}

/**
 * Parse raw notepad text to get list-style metadata per slide (same structure as parseNotepadText).
 * Used when converting LiveSlide[] to Slide[] so we can restore bullet/numbered format when building raw text back.
 */
export function parseRawTextListStyle(rawText: string): ParsedSlideListMeta[] {
  const result: ParsedSlideListMeta[] = [];
  const lines = rawText.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.startsWith("\t") || line.startsWith("    ")) {
      const isSubItem = true;
      const bullet = BULLET_LINE_REGEX.test(line);
      const numMatch = line.match(NUMBERED_LINE_REGEX);
      const listStyle: "bullet" | "numbered" | null = bullet ? "bullet" : numMatch ? "numbered" : null;
      const listNumber = numMatch ? parseInt(numMatch[1], 10) : undefined;
      result.push({
        listStyle,
        items: [{ isSubItem, listNumber }],
      });
      i++;
      continue;
    }

    // Non-indented line: check for indented children (same structure as parseNotepadText)
    const children: { isSubItem: boolean; listNumber?: number }[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (nextLine.trim() === "") break;
      if (nextLine.startsWith("\t") || nextLine.startsWith("    ")) {
        const numMatch = nextLine.match(NUMBERED_LINE_REGEX);
        children.push({
          isSubItem: true,
          listNumber: numMatch ? parseInt(numMatch[1], 10) : undefined,
        });
        j++;
      } else break;
    }

    const parentBullet = BULLET_LINE_REGEX.test(line);
    const parentNumMatch = line.match(NUMBERED_LINE_REGEX);
    const parentListStyle: "bullet" | "numbered" | null = parentBullet ? "bullet" : parentNumMatch ? "numbered" : null;
    const parentListNumber = parentNumMatch ? parseInt(parentNumMatch[1], 10) : undefined;

    if (children.length > 0) {
      result.push({
        listStyle: parentListStyle || (children.some((c) => c.listNumber != null) ? "numbered" : null) || (parentListStyle ? parentListStyle : "bullet"),
        items: [{ isSubItem: false, listNumber: parentListNumber }],
      });
      for (const _ of children) {
        result.push({
          listStyle: parentListStyle || (children.some((c) => c.listNumber != null) ? "numbered" : null) || "bullet",
          items: [
            { isSubItem: false, listNumber: parentListNumber },
            { isSubItem: true, listNumber: _.listNumber },
          ],
        });
      }
      i = j;
    } else {
      // Consecutive non-indented lines = one slide with multiple items
      const slideItems: { isSubItem: boolean; listNumber?: number }[] = [];
      slideItems.push({ isSubItem: false, listNumber: parentListNumber });
      let anyBullet = parentBullet;
      let anyNumbered = !!parentNumMatch;
      j = i + 1;
      while (j < lines.length) {
        const nextLine = lines[j];
        if (nextLine.trim() === "") break;
        if (nextLine.startsWith("\t") || nextLine.startsWith("    ")) break;
        const bullet = BULLET_LINE_REGEX.test(nextLine);
        const numMatch = nextLine.match(NUMBERED_LINE_REGEX);
        if (bullet) anyBullet = true;
        if (numMatch) anyNumbered = true;
        slideItems.push({
          isSubItem: false,
          listNumber: numMatch ? parseInt(numMatch[1], 10) : undefined,
        });
        j++;
      }
      const listStyle: "bullet" | "numbered" | null = anyBullet
        ? "bullet"
        : anyNumbered
          ? "numbered"
          : null;
      result.push({
        listStyle,
        items: slideItems,
      });
      i = j;
    }
  }

  return result;
}
