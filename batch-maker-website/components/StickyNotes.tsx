// components/StickyNotes.tsx
// Persistent sticky notes sidebar panel.
// Stores notes in Supabase `sticky_notes` table (run migration_sticky_notes.sql first).
// Drag-to-reorder, click-to-expand modal, colour picker, delete.

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSupabaseClient } from '../lib/supabase';

const supabase = getSupabaseClient();

interface Note {
  id: string;
  user_id: string;
  content: string;
  color: NoteColor;
  position: number;
  created_at: string;
  updated_at: string;
}

type NoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'orange';

const COLORS: Record<NoteColor, { bg: string; border: string; header: string; text: string; dot: string }> = {
  yellow:  { bg: 'bg-yellow-50',  border: 'border-yellow-200',  header: 'bg-yellow-100',  text: 'text-yellow-900',  dot: 'bg-yellow-400' },
  green:   { bg: 'bg-green-50',   border: 'border-green-200',   header: 'bg-green-100',   text: 'text-green-900',   dot: 'bg-green-400' },
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    header: 'bg-blue-100',    text: 'text-blue-900',    dot: 'bg-blue-400' },
  pink:    { bg: 'bg-pink-50',    border: 'border-pink-200',    header: 'bg-pink-100',    text: 'text-pink-900',    dot: 'bg-pink-400' },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-200',  header: 'bg-purple-100',  text: 'text-purple-900',  dot: 'bg-purple-400' },
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-200',  header: 'bg-orange-100',  text: 'text-orange-900',  dot: 'bg-orange-400' },
};

const COLOR_KEYS = Object.keys(COLORS) as NoteColor[];

export default function StickyNotes({ userId }: { userId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNote, setExpandedNote] = useState<Note | null>(null);
  const [expandedContent, setExpandedContent] = useState('');
  const [savingExpanded, setSavingExpanded] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const fetchNotes = useCallback(async () => {
    const { data, error } = await supabase
      .from('sticky_notes')
      .select('*')
      .eq('user_id', userId)
      .order('position', { ascending: true });
    if (!error && data) setNotes(data as Note[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function handleCreate() {
    const maxPos = notes.length > 0 ? Math.max(...notes.map(n => n.position)) + 1 : 0;
    const { data, error } = await supabase
      .from('sticky_notes')
      .insert({ user_id: userId, content: '', color: 'yellow', position: maxPos })
      .select()
      .single();
    if (!error && data) {
      setNotes(prev => [...prev, data as Note]);
      setExpandedNote(data as Note);
      setExpandedContent('');
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from('sticky_notes').delete().eq('id', id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (expandedNote?.id === id) setExpandedNote(null);
  }

  async function handleColorChange(id: string, color: NoteColor, e: React.MouseEvent) {
    e.stopPropagation();
    setNotes(prev => prev.map(n => n.id === id ? { ...n, color } : n));
    if (expandedNote?.id === id) setExpandedNote(prev => prev ? { ...prev, color } : null);
    await supabase
      .from('sticky_notes')
      .update({ color, updated_at: new Date().toISOString() })
      .eq('id', id);
  }

  async function handleSaveExpanded() {
    if (!expandedNote) return;
    setSavingExpanded(true);
    await supabase
      .from('sticky_notes')
      .update({ content: expandedContent, updated_at: new Date().toISOString() })
      .eq('id', expandedNote.id);
    setNotes(prev => prev.map(n => n.id === expandedNote.id ? { ...n, content: expandedContent } : n));
    setSavingExpanded(false);
    setExpandedNote(null);
  }

  function openExpanded(note: Note) {
    setExpandedNote(note);
    setExpandedContent(note.content);
  }

  function onDragStart(index: number) { dragIndex.current = index; }

  function onDragEnter(index: number) {
    if (dragIndex.current === null || dragIndex.current === index) return;
    setNotes(prev => {
      const reordered = [...prev];
      const [moved] = reordered.splice(dragIndex.current!, 1);
      reordered.splice(index, 0, moved);
      dragIndex.current = index;
      return reordered;
    });
  }

  async function onDragEnd() {
    dragIndex.current = null;
    for (let i = 0; i < notes.length; i++) {
      await supabase
        .from('sticky_notes')
        .update({ position: i, updated_at: new Date().toISOString() })
        .eq('id', notes[i].id);
    }
  }

  return (
    <>
      {/* ── Sidebar card ──────────────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-200 p-4 flex flex-col gap-3 overflow-hidden" style={{ height: '100%', minHeight: 0 }}>

        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Notes</span>
          <button
            onClick={handleCreate}
            title="New note"
            className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors text-base font-bold leading-none"
          >
            +
          </button>
        </div>

        <div className="border-t border-gray-100 flex-shrink-0" />

        {/* Note list */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />)}
          </div>
        ) : notes.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-xs text-gray-400 italic leading-relaxed">No notes yet.<br />Click + to add one.</p>
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
            {notes.map((note, index) => {
              const c = COLORS[note.color] || COLORS.yellow;
              return (
                <div
                  key={note.id}
                  draggable
                  onDragStart={() => onDragStart(index)}
                  onDragEnter={() => onDragEnter(index)}
                  onDragEnd={onDragEnd}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => openExpanded(note)}
                  className={`relative rounded-lg border shadow-sm cursor-pointer transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 ${c.bg} ${c.border} select-none`}
                >
                  <div className={`${c.header} rounded-t-lg px-2 py-1 flex items-center justify-between`}>
                    <div className="flex gap-1 items-center">
                      <svg className="w-3 h-3 text-gray-400 cursor-grab" fill="currentColor" viewBox="0 0 16 16">
                        <circle cx="5" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" />
                        <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
                        <circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" />
                      </svg>
                      <div className={`w-2 h-2 rounded-full ${c.dot}`} />
                    </div>
                    <button
                      onClick={e => handleDelete(note.id, e)}
                      className="text-gray-400 hover:text-red-500 transition-colors text-sm leading-none px-0.5"
                      title="Delete note"
                    >
                      ×
                    </button>
                  </div>
                  <div className="px-2.5 py-2">
                    {note.content
                      ? <p className={`text-xs leading-relaxed line-clamp-4 ${c.text} whitespace-pre-wrap break-words`}>{note.content}</p>
                      : <p className="text-xs text-gray-400 italic">Empty — click to edit</p>
                    }
                  </div>
                  <div className="px-2.5 pb-1.5">
                    <span className="text-[10px] text-gray-400">
                      {new Date(note.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Expanded modal ─────────────────────────────────────────────────── */}
      {expandedNote && (() => {
        const c = COLORS[expandedNote.color] || COLORS.yellow;
        return (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={handleSaveExpanded}
          >
            <div
              className={`w-full max-w-lg rounded-xl shadow-2xl border-2 ${c.bg} ${c.border} flex flex-col`}
              style={{ maxHeight: '80vh' }}
              onClick={e => e.stopPropagation()}
            >
              <div className={`${c.header} rounded-t-xl px-4 py-3 flex items-center justify-between flex-shrink-0`}>
                <div className="flex gap-1.5">
                  {COLOR_KEYS.map(col => (
                    <button
                      key={col}
                      onClick={e => handleColorChange(expandedNote.id, col, e)}
                      title={col}
                      className={`w-4 h-4 rounded-full transition-transform hover:scale-125 ${COLORS[col].dot} ${expandedNote.color === col ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : ''}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveExpanded}
                    disabled={savingExpanded}
                    className="px-3 py-1 bg-gray-700 text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {savingExpanded ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setExpandedNote(null)}
                    className="text-gray-500 hover:text-gray-700 text-xl leading-none font-medium transition-colors"
                  >
                    ×
                  </button>
                </div>
              </div>
              <textarea
                autoFocus
                value={expandedContent}
                onChange={e => setExpandedContent(e.target.value)}
                placeholder="Write your note..."
                className={`flex-1 w-full px-4 py-3 bg-transparent resize-none outline-none text-sm leading-relaxed ${c.text} placeholder-gray-400`}
                style={{ minHeight: '300px' }}
              />
              <div className={`${c.header} rounded-b-xl px-4 py-2 flex-shrink-0`}>
                <span className="text-xs text-gray-400">
                  {new Date(expandedNote.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  &nbsp;·&nbsp;{expandedContent.length} chars
                </span>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}