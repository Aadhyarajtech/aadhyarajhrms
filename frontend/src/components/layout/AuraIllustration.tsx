export function AuraIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 480" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ringGrad1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8B7BEE" />
          <stop offset="100%" stopColor="#4338CA" />
        </linearGradient>
        <linearGradient id="ringGrad2" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#E2C386" />
          <stop offset="100%" stopColor="#C9A14A" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#A99DF3" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#A99DF3" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="240" cy="240" r="220" fill="url(#glow)" />

      {/* Concentric aura rings */}
      <circle cx="240" cy="240" r="170" fill="none" stroke="#E7E5E0" strokeWidth="1.5" />
      <circle cx="240" cy="240" r="170" fill="none" stroke="url(#ringGrad1)" strokeWidth="6" strokeLinecap="round" strokeDasharray="210 1100" transform="rotate(-90 240 240)" />
      <circle cx="240" cy="240" r="130" fill="none" stroke="#E7E5E0" strokeWidth="1.5" />
      <circle cx="240" cy="240" r="130" fill="none" stroke="url(#ringGrad2)" strokeWidth="6" strokeLinecap="round" strokeDasharray="160 820" transform="rotate(40 240 240)" />

      {/* Floating cards representing modules */}
      <g transform="translate(95 120) rotate(-6)">
        <rect width="150" height="92" rx="18" fill="#FFFFFF" stroke="#E7E5E0" />
        <rect x="18" y="20" width="60" height="8" rx="4" fill="#5B4FE5" />
        <rect x="18" y="38" width="100" height="6" rx="3" fill="#E7E5E0" />
        <rect x="18" y="52" width="80" height="6" rx="3" fill="#E7E5E0" />
        <circle cx="125" cy="24" r="10" fill="#E3DFFC" />
      </g>

      <g transform="translate(250 90) rotate(5)">
        <rect width="132" height="78" rx="16" fill="#FFFFFF" stroke="#E7E5E0" />
        <circle cx="28" cy="26" r="13" fill="#F5E9CB" />
        <rect x="50" y="18" width="64" height="7" rx="3.5" fill="#1A1D29" opacity="0.8" />
        <rect x="50" y="32" width="44" height="6" rx="3" fill="#E7E5E0" />
        <rect x="16" y="52" width="100" height="14" rx="7" fill="#E8F7F0" />
      </g>

      <g transform="translate(120 250) rotate(4)">
        <rect width="170" height="100" rx="18" fill="#FFFFFF" stroke="#E7E5E0" />
        <rect x="18" y="18" width="50" height="50" rx="12" fill="#EEF0FF" />
        <path d="M30 48 L40 36 L48 44 L58 28" stroke="#5B4FE5" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="84" y="24" width="70" height="7" rx="3.5" fill="#1A1D29" opacity="0.8" />
        <rect x="84" y="40" width="50" height="6" rx="3" fill="#E7E5E0" />
        <rect x="84" y="54" width="60" height="6" rx="3" fill="#E7E5E0" />
      </g>

      <g transform="translate(270 270) rotate(-4)">
        <rect width="120" height="86" rx="16" fill="#FFFFFF" stroke="#E7E5E0" />
        <rect x="16" y="16" width="88" height="20" rx="10" fill="#FBF6EA" />
        <rect x="24" y="22" width="40" height="7" rx="3.5" fill="#A07D33" />
        <circle cx="40" cy="62" r="12" fill="#E3DFFC" />
        <circle cx="64" cy="62" r="12" fill="#F5E9CB" />
        <circle cx="88" cy="62" r="12" fill="#E8F7F0" />
      </g>
    </svg>
  );
}
