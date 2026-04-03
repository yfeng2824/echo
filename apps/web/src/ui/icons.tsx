import type { SVGProps } from "react";
export {
  Volume2 as SoundOnIcon,
  VolumeX as SoundOffIcon,
  Info as InfoIcon,
  ChevronRight as ChevronRightIcon,
  ChevronLeft as ChevronLeftIcon,
  Play as PlayIcon,
  Square as StopIcon,
  ArrowLeft as BackIcon,
  Menu as MenuIcon,
  Check as CheckmarkIcon,
  ChevronUp as CaretUpIcon,
  ChevronDown as CaretDownIcon,
  X as CloseIcon,
  Copy as CopyIcon,
} from "lucide-react";

export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 1.5a10.5 10.5 0 0 0-3.32 20.46c.53.1.72-.23.72-.51v-1.8c-2.94.64-3.56-1.25-3.56-1.25-.48-1.22-1.18-1.55-1.18-1.55-.96-.66.07-.65.07-.65 1.06.07 1.62 1.09 1.62 1.09.94 1.61 2.47 1.15 3.07.88.1-.68.37-1.15.67-1.41-2.35-.27-4.82-1.17-4.82-5.23 0-1.16.42-2.1 1.09-2.84-.1-.27-.47-1.36.12-2.84 0 0 .9-.29 2.95 1.08a10.2 10.2 0 0 1 5.38 0c2.05-1.37 2.95-1.08 2.95-1.08.59 1.48.22 2.57.12 2.84.68.74 1.09 1.68 1.09 2.84 0 4.07-2.47 4.95-4.83 5.22.38.33.72.98.72 1.99v2.95c0 .28.19.61.73.5A10.5 10.5 0 0 0 12 1.5Z" />
    </svg>
  );
}
