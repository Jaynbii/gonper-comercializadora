export default function LogoRequisa({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <g transform="translate(3 0)">
        <path d="M32 14 A18 18 0 1 1 16.4 23" strokeWidth={7} />
        <polygon points="16.4,23 16.2,34.4 6.6,28.9" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}
