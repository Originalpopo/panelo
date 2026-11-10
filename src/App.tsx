import { useRef, useState } from 'react';
import { ChevronLeft, Undo2, Redo2, Share, ImagePlus } from 'lucide-react';
import { useStore } from './store.ts';
import { importFiles } from './photos.ts';
import Frame from './components/Frame.tsx';
import LayoutControls, { LAYOUT_SUBS, type LayoutSub } from './components/LayoutPanel.tsx';
import BorderControls, { BORDER_SUBS, type BorderSub } from './components/BorderPanel.tsx';
import ExportSheet from './components/ExportSheet.tsx';
import StartPicker from './components/StartPicker.tsx';
import { TextControls, TextEditor } from './components/TextPanel.tsx';

type Menu = 'layout' | 'border' | 'text' | null;

export default function App() {
  const doc = useStore((s) => s.doc);
  const choosing = useStore((s) => s.choosing);
  const textEdit = useStore((s) => s.textEdit);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const [menu, setMenu] = useState<Menu>(null);
  const [layoutSub, setLayoutSub] = useState<LayoutSub | null>(null);
  const [borderSub, setBorderSub] = useState<BorderSub | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** What the next picked photos are for: one cell, any empty cells, or a re-picked layout with more photos. */
  const pickFor = useRef<{ cell: string | null; relayout: boolean }>({ cell: null, relayout: false });

  const pick = (cell: string | null, relayout = false) => {
    pickFor.current = { cell, relayout };
    fileRef.current?.click();
  };

  const onFiles = async (list: FileList | null) => {
    const files = list ? [...list] : [];
    if (fileRef.current) fileRef.current.value = '';
    if (files.length === 0) return;
    setBusy(true);
    try {
      const photos = await importFiles(files);
      if (!photos.length) return;
      const { cell, relayout } = pickFor.current;
      if (relayout) useStore.getState().addPhotosRelayout(photos);
      else useStore.getState().addPhotos(photos, cell);
    } finally {
      setBusy(false);
    }
  };

  const openMenu = (m: Menu) => {
    setMenu(m);
    setLayoutSub(null);
    setBorderSub(null);
    useStore.getState().select(null);
    useStore.getState().pickText(null);
  };

  const startOver = () => {
    if (confirm('Start over? Your current frame will be lost.')) {
      useStore.getState().reset();
      openMenu(null);
    }
  };

  const input = <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />;

  if (!doc) {
    return (
      <div className="home">
        {input}
        <div className="brand">
          <img src="./icon.svg" alt="" width={72} height={72} />
          <h1>Panelo</h1>
          <p>Many photos, one frame.</p>
        </div>
        <button className="primary big" onClick={() => pick(null)} disabled={busy}>
          <ImagePlus size={22} /> {busy ? 'Loading photos…' : 'Choose photos'}
        </button>
      </div>
    );
  }

  if (choosing) return <StartPicker onBack={() => useStore.getState().reset()} />;

  return (
    <div className="editor">
      {input}
      <header className="top">
        <button className="icon" onClick={startOver} aria-label="Start over">
          <ChevronLeft size={24} />
        </button>
        <div className="undo">
          <button className="icon" onClick={() => useStore.getState().undo()} disabled={!canUndo} aria-label="Undo">
            <Undo2 size={22} />
          </button>
          <button className="icon" onClick={() => useStore.getState().redo()} disabled={!canRedo} aria-label="Redo">
            <Redo2 size={22} />
          </button>
        </div>
        <button className="icon accent" onClick={() => setExporting(true)} aria-label="Export">
          <Share size={22} />
        </button>
      </header>

      <Frame showHandles={menu === 'border' && borderSub === 'adjust'}
        mergeMode={menu === 'layout' && layoutSub === 'merge'}
        photoTools={menu === null || (menu === 'layout' && layoutSub === 'add')} textMode={menu === 'text'} onPickForCell={(id) => pick(id)} />
      {busy && <div className="toast">Loading photos…</div>}

      <section className="tools">
        {menu === 'layout' && layoutSub && <LayoutControls sub={layoutSub} onAddMore={() => pick(null, true)} />}
        {menu === 'border' && borderSub && <BorderControls sub={borderSub} />}
        {menu === 'text' && <TextControls />}
      </section>

      {/* Main menu. Opening one item slides it to the left edge, pushes the others off screen, and shows its sub-menu. */}
      <nav className={`menu ${menu ? `open-${menu}` : ''}`}>
        <button className="main m-layout" onClick={() => openMenu(menu === 'layout' ? null : 'layout')}>
          LAYOUT
        </button>
        <button className="main m-border" onClick={() => openMenu(menu === 'border' ? null : 'border')}>
          BORDER
        </button>
        <button className="main m-text" onClick={() => openMenu(menu === 'text' ? null : 'text')}>
          TEXT
        </button>
        <div className="subs s-layout" aria-hidden={menu !== 'layout'}>
          {LAYOUT_SUBS.map((s) => (
            <button key={s.id} className={layoutSub === s.id ? 'on' : ''} tabIndex={menu === 'layout' ? 0 : -1} onClick={() => {
                setLayoutSub(layoutSub === s.id ? null : s.id);
                useStore.getState().select(null);
              }}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="subs s-border" aria-hidden={menu !== 'border'}>
          {BORDER_SUBS.map((s) => (
            <button key={s.id} className={borderSub === s.id ? 'on' : ''} tabIndex={menu === 'border' ? 0 : -1} onClick={() => setBorderSub(borderSub === s.id ? null : s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="subs s-text" aria-hidden={menu !== 'text'}>
          <button tabIndex={menu === 'text' ? 0 : -1} onClick={() => useStore.getState().editText('new')}>
            add
          </button>
        </div>
      </nav>

      {textEdit && <TextEditor />}
      {exporting && <ExportSheet onClose={() => setExporting(false)} />}
    </div>
  );
}
