import { useEffect, useState } from "react";
import type { DependencyList, RefObject } from "react";

type AutoFontSizeOptions = {
  minFontSize?: number;
  maxFontSize?: number;
};

export function useAutoFontSize(
  containerRef: RefObject<HTMLElement>,
  contentRef: RefObject<HTMLElement>,
  deps: DependencyList,
  options: AutoFontSizeOptions = {}
) {
  const { minFontSize = 12, maxFontSize = 160 } = options;
  const [fontSize, setFontSize] = useState<number>(minFontSize);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const compute = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width <= 0 || height <= 0) return;

      let low = minFontSize;
      let high = maxFontSize;
      let best = minFontSize;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        content.style.fontSize = `${mid}px`;

        const fits =
          content.scrollWidth <= width && content.scrollHeight <= height;
        if (fits) {
          best = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      if (best !== fontSize) {
        setFontSize(best);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      compute();
    });

    resizeObserver.observe(container);
    compute();

    return () => {
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return fontSize;
}
