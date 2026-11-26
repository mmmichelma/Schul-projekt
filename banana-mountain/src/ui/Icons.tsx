/* Eigene SVG-Symbole für die Oberfläche */
import type { ReactElement } from 'react';

const S = (path: ReactElement, vb = '0 0 24 24') => (props: { size?: number }) => (
  <svg width={props.size || 18} height={props.size || 18} viewBox={vb} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{path}</svg>
);

export const IconCoin = S(<><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5.8-2.5 2s1 1.7 2.5 2 2.5.8 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8m0 8v1.5" /></>);
export const IconBanana = S(<path d="M4 13c3 5 11 6 16-6-1-1-2-1-2.5 0C15 12 9 14 5 11.5 4.3 11 3.6 12.3 4 13z" />);
export const IconGauge = S(<><path d="M4 18a9 9 0 1 1 16 0" /><path d="M12 13l4-4" /></>);
export const IconBolt = S(<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />);
export const IconChart = S(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>);
export const IconMenu = S(<><path d="M4 6h16M4 12h16M4 18h16" /></>);
export const IconCursor = S(<path d="M5 3l14 7-6 2-2 6z" />);
export const IconBox = S(<><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3 3" /></>);
export const IconTrash = S(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>);
export const IconRotate = S(<><path d="M20 12a8 8 0 1 1-3-6.2" /><path d="M20 4v5h-5" /></>);
export const IconMove = S(<><path d="M12 2v20M2 12h20M12 2l-3 3m3-3l3 3M12 22l-3-3m3 3l3-3M2 12l3-3m-3 3l3 3M22 12l-3-3m3 3l-3 3" /></>);
export const IconPower = S(<><path d="M12 3v9" /><path d="M6.3 7.5a8 8 0 1 0 11.4 0" /></>);
export const IconCopy = S(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>);
export const IconUp = S(<><path d="M12 19V5M5 12l7-7 7 7" /></>);
export const IconHand = S(<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v8c0 4-3 7-7 7-3 0-4.5-1.5-6-4l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L8 13" />);
export const IconClose = S(<path d="M6 6l12 12M18 6L6 18" />);
export const IconClock = S(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const IconFactory = S(<path d="M3 21V11l6 4v-4l6 4V5h4v16z" />);
export const IconCrate = S(<><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M3 7l9 4 9-4M12 11v10" /></>);
export const IconSound = S(<><path d="M5 9v6h4l5 4V5L9 9z" /><path d="M17 9a4 4 0 0 1 0 6" /></>);
export const IconMute = S(<><path d="M5 9v6h4l5 4V5L9 9z" /><path d="M17 9l4 6M21 9l-4 6" /></>);
