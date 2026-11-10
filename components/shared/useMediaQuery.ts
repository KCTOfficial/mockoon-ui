import { useEffect, useState } from 'react';

/** Below Tailwind's `md` breakpoint (768px): phones and narrow windows get the single-pane layout. */
export const NARROW_QUERY = '(max-width: 767px)';

/** Whether a CSS media query matches, kept up to date as the window changes. */
export function useMediaQuery(query: string): boolean {
    const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
    const [matches, setMatches] = useState(get);

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const list = window.matchMedia(query);
        const onChange = () => setMatches(list.matches);
        onChange();
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
    }, [query]);

    return matches;
}
