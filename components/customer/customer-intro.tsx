export function CustomerIntro() {
  return (
    <div className="courista-intro" role="status" aria-label="Opening Courista menu">
      <div className="courista-intro-mark" aria-hidden="true">
        <span className="courista-intro-c">C</span><span className="courista-intro-rest">ourista</span>
        <span className="courista-intro-tag">EAT · PLAY · CONNECT</span>
      </div>
      <span className="sr-only">Opening Courista menu…</span>
    </div>
  );
}
