import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

type SplitType = "chars" | "words";

type TweenVars = {
  opacity?: number;
  x?: number;
  y?: number;
  scale?: number;
};

type SplitTextProps = {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
  ease?: string;
  splitType?: SplitType;
  from?: TweenVars;
  to?: TweenVars;
  threshold?: number;
  rootMargin?: string;
  textAlign?: CSSProperties["textAlign"];
  onLetterAnimationComplete?: () => void;
  showCallback?: boolean;
};

function toTokens(text: string, splitType: SplitType) {
  if (splitType === "words") {
    return text
      .split(" ")
      .flatMap((word, index, source) => (index < source.length - 1 ? [word, " "] : [word]));
  }

  return Array.from(text);
}

export default function SplitText({
  text,
  className,
  delay = 24,
  duration = 0.72,
  ease = "power3.out",
  splitType = "chars",
  from,
  to,
  threshold: _threshold,
  rootMargin: _rootMargin,
  textAlign,
  onLetterAnimationComplete,
  showCallback = false,
}: SplitTextProps) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const callbackRef = useRef(onLetterAnimationComplete);
  const tokens = useMemo(() => toTokens(text, splitType), [splitType, text]);
  const fromOpacity = from?.opacity;
  const fromX = from?.x;
  const fromY = from?.y;
  const fromScale = from?.scale;
  const toOpacity = to?.opacity;
  const toX = to?.x;
  const toY = to?.y;
  const toScale = to?.scale;

  useEffect(() => {
    callbackRef.current = onLetterAnimationComplete;
  }, [onLetterAnimationComplete]);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) {
        return;
      }

      const pieces = root.querySelectorAll<HTMLElement>("[data-split-piece='true']");
      if (pieces.length === 0) {
        return;
      }

      const timeline = gsap.timeline({
        defaults: {
          duration,
          ease,
        },
        onComplete: () => {
          if (showCallback) {
            callbackRef.current?.();
          }
        },
      });

      timeline.fromTo(
        pieces,
        {
          opacity: 0,
          y: 18,
          ...(fromOpacity !== undefined ? { opacity: fromOpacity } : {}),
          ...(fromX !== undefined ? { x: fromX } : {}),
          ...(fromY !== undefined ? { y: fromY } : {}),
          ...(fromScale !== undefined ? { scale: fromScale } : {}),
        },
        {
          opacity: 1,
          y: 0,
          x: 0,
          scale: 1,
          ...(toOpacity !== undefined ? { opacity: toOpacity } : {}),
          ...(toX !== undefined ? { x: toX } : {}),
          ...(toY !== undefined ? { y: toY } : {}),
          ...(toScale !== undefined ? { scale: toScale } : {}),
          stagger: Math.max(0, delay) / 1000,
          clearProps: "opacity,transform",
        }
      );
    },
    {
      scope: rootRef,
      dependencies: [
        text,
        delay,
        duration,
        ease,
        splitType,
        fromOpacity,
        fromX,
        fromY,
        fromScale,
        toOpacity,
        toX,
        toY,
        toScale,
        showCallback,
      ],
      revertOnUpdate: true,
    }
  );

  return (
    <span
      ref={rootRef}
      className={className}
      style={{
        textAlign,
      }}
    >
      {tokens.map((token, index) => {
        if (token === " ") {
          return (
            <span key={`${text}-space-${index}`} aria-hidden="true">
              {" "}
            </span>
          );
        }

        return (
          <span
            key={`${token}-${index}`}
            data-split-piece="true"
            style={{
              display: "inline-block",
              willChange: "transform, opacity",
            }}
          >
            {token}
          </span>
        );
      })}
    </span>
  );
}
