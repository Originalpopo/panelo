import { useEffect, useState } from 'react';
import { Share, X, Download } from 'lucide-react';
import { useStore } from '../store.ts';
import { renderFrame } from '../exporter.ts';
import { frameSize } from '../geometry.ts';

const DONE_MS = 1300;

const SIZES = [
  { side: 2048, label: 'Standard' },
  { side: 3000, label: 'High' },
  { side: 4000, label: 'Max' },
];

export default function ExportSheet({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc)!;
  const photos = useStore((s) => s.photos);
  const [side, setSide] = useState(3000);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setFile(null);
    setUrl(null);
    setErr(null);
    renderFrame(doc, photos, side)
      .then((f) => {
        if (!alive) return;
        made = URL.createObjectURL(f);
        setFile(f);
        setUrl(made);
      })
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [doc, photos, side]);

  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  /** Success tick shown after the share sheet finishes (or the download starts); then the sheet closes. */
  const [done, setDone] = useState(false);
  const finish = () => {
    setDone(true);
    window.setTimeout(onClose, DONE_MS);
  };

  const share = async () => {
    if (!file) return;
    try {
      // Resolves only when the person completed an action in the iPhone share sheet (e.g. Save Image);
      // closing the sheet without choosing rejects with AbortError, so no tick then.
      await navigator.share({ files: [file] });
      finish();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErr('Sharing failed. Long-press the image and choose "Save to Photos" instead.');
    }
  };

  const { W, H } = frameSize(doc.ratio, side);

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet export" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <b>Export</b>
          <button className="icon" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="chips">
          {SIZES.map((s) => (
            <button key={s.side} className={`chip ${s.side === side ? 'on' : ''}`} onClick={() => setSide(s.side)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="preview">{url ? <img src={url} alt="Export preview" /> : <div className="busy">{err ?? 'Rendering…'}</div>}</div>
        <div className="meta">
          {W} × {H} px{file ? ` · ${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}
        </div>
        {err && url && <div className="err">{err}</div>}
        {canShare ? (
          <button className="primary" onClick={share} disabled={!file}>
            <Share size={20} /> Share / Save to Photos
          </button>
        ) : (
          <a className={`primary ${file ? '' : 'disabled'}`} href={url ?? undefined} download={file?.name} onClick={() => file && finish()}>
            <Download size={20} /> Download
          </a>
        )}
        {done && (
          <div className="done" role="status">
            <svg viewBox="0 0 52 52" width="76" height="76" aria-hidden="true">
              <circle className="done-ring" cx="26" cy="26" r="23" />
              <path className="done-tick" d="M15 27 l7 7 l15 -16" />
            </svg>
            <span>Done</span>
          </div>
        )}
      </div>
    </div>
  );
}
