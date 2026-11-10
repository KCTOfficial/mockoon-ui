// Primer-like avatar tints, picked deterministically from the environment name
const AVATAR_TINTS = [
    'bg-accent-subtle text-accent',
    'bg-success-subtle text-success',
    'bg-attention-subtle text-attention',
    'bg-danger-subtle text-danger',
    'bg-[var(--done-subtle)] text-done',
];

export function avatarTint(name: string) {
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
    return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

/** Square avatar with the first two letters of an environment name, as in the sidebar. */
export default function EnvAvatar({ name, className = '' }: { name: string; className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={`relative w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center text-[10px] font-semibold select-none ${avatarTint(name)} ${className}`}
        >
            {name.slice(0, 2).toUpperCase()}
        </span>
    );
}
