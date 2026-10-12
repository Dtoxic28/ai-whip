export function PixelEmployee({ boss = false, size = 80 }: { boss?: boolean; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 36" role="img" aria-label={boss ? "Pixel-art office boss; cosmetic illustration" : "Pixel-art AI employee; cosmetic illustration"} shapeRendering="crispEdges">
    <path fill={boss ? "#754236" : "#685b98"} d="M7 3h17v3h3v8H5V6h2z"/><path fill="#e5b99a" d="M7 9h18v13H7zM10 22h12v4H10z"/><path fill="#b87962" d="M5 13h2v6H5zM25 13h2v6h-2zM9 21h14v2H9z"/>
    <path fill="#24262b" d={boss ? "M8 11h7v5H8zM18 11h7v5h-7zM15 12h3v2h-3z" : "M10 12h3v3h-3zM20 12h3v3h-3z"}/><path fill="#f5dac6" d="M12 18h9v2h-9z"/><path fill={boss ? "#34313b" : "#7c78bb"} d="M7 26h19v10H4v-7h3z"/><path fill="#e9ddd3" d="M13 25h7v11h-7z"/><path fill={boss ? "#fa6545" : "#454161"} d="M15 27h3v9h-3z"/>
    {boss && <path fill="#ece5db" d="M24 27h7v5h-7z"/>}
  </svg>;
}
export function OfficeScene() {
  return <div className="office-scene" aria-label="Cosmetic retro-office illustration"><div className="scene-window"><i/><i/><i/></div><div className="scene-poster">SHIP<br/>HAPPENS.</div><div className="scene-boss"><PixelEmployee boss size={126}/></div><div className="scene-desk"><div className="scene-monitor"><span>&gt; prove_it<span className="cursor">_</span></span></div><div className="scene-mug">W</div><div className="scene-paper"/></div><div className="scene-floor"/><span className="scene-caption">CHARACTERS COSMETIC / VERDICTS REAL</span></div>;
}
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const shapes: Record<string, React.ReactNode> = {
    office: <><path d="M3 10 12 3l9 7M5 9v12h14V9M9 21v-7h6v7"/></>,
    queue: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
    detector: <><path d="M12 3 3 7v6c0 4 9 8 9 8s9-4 9-8V7z"/><path d="m8 12 3 3 5-6"/></>,
    agents: <><rect x="4" y="6" width="16" height="14" rx="3"/><path d="M12 2v4M8 11v2M16 11v2M8 16h8M1 11v4M23 11v4"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-7M3 3v6h6M12 7v6l4 2"/></>,
    review: <><path d="M12 3 15 9l7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></>,
    settings: <><path d="M4 6h16M4 12h16M4 18h16"/><path strokeWidth="4" d="M8 4v4M16 10v4M10 16v4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    close: <path d="m6 6 12 12M6 18 18 6"/>,
    proof: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h5"/></>,
    bolt: <path d="m13 2-9 12h7l-1 8 10-12h-7z"/>,
    flame: <path d="M12 2c2 6-2 7 2 10 1-3 3-4 3-4 7 8 3 14-5 14C1 22 3 11 6 8c0 4 3 5 3 5-2-5 3-7 3-11Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    stop: <rect x="5" y="5" width="14" height="14" rx="1"/>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
    external: <><path d="M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name] || shapes.office}</svg>;
}
