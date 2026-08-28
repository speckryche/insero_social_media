"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  NotebookPen,
  Loader2,
  Edit3,
  Trash2,
  Check,
  X,
} from "lucide-react";
import {
  NOTE_SCOPE_LABELS,
  NOTE_SCOPE_STYLES,
  todayISO,
  type NoteScope,
} from "@/lib/notes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Note = any;

type Filter = "all" | "unused" | "used";

const SCOPES: NoteScope[] = ["personal", "company"];

/** "Thursday, Aug 28" — the date headings the list groups under. */
function dateHeading(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- the capture form -----------------------------------------------------
  const [content, setContent] = useState("");
  // Personal by default: most of what Speck jots down is his own material.
  const [scope, setScope] = useState<NoteScope>("personal");
  const [noteDate, setNoteDate] = useState(todayISO);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [filter, setFilter] = useState<Filter>("unused");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchNotes();
    // Autofocus on load so a note can be typed the moment the page appears.
    textareaRef.current?.focus();
  }, []);

  async function fetchNotes() {
    setLoading(true);
    try {
      const res = await fetch("/api/notes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load notes");
      setNotes(Array.isArray(data) ? data : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load notes");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const text = content.trim();
    if (!text || saving) return;

    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, scope, noteDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the note");

      // Clear the text but keep scope and date, so a run of notes about the
      // same day and destination can be typed one after another.
      setNotes((prev) => [data, ...prev]);
      setContent("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the note");
    } finally {
      setSaving(false);
      textareaRef.current?.focus();
    }
  }

  async function handleUpdate(id: string) {
    const text = editingText.trim();
    if (!text) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update the note");
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...data } : n)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the note");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/notes/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete the note");
      }
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the note");
    } finally {
      setBusyId(null);
    }
  }

  // Unused notes per scope — the signal for whether there is enough material
  // to generate a batch for that destination.
  const waiting = useMemo(() => {
    const counts: Record<NoteScope, number> = { personal: 0, company: 0 };
    for (const note of notes) {
      if (!note.consumed && (note.scope === "personal" || note.scope === "company")) {
        counts[note.scope as NoteScope] += 1;
      }
    }
    return counts;
  }, [notes]);

  const visible = useMemo(() => {
    return notes.filter((note) => {
      if (filter === "unused") return !note.consumed;
      if (filter === "used") return !!note.consumed;
      return true;
    });
  }, [notes, filter]);

  // Already newest-first from the API; this only groups runs of equal dates.
  const grouped = useMemo(() => {
    const groups: Array<{ date: string; notes: Note[] }> = [];
    for (const note of visible) {
      const last = groups[groups.length - 1];
      if (last && last.date === note.note_date) last.notes.push(note);
      else groups.push({ date: note.note_date, notes: [note] });
    }
    return groups;
  }, [visible]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <NotebookPen className="h-6 w-6 text-blue-600" />
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Notes</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Real life as it happens — what you built, what a customer said,
            what you noticed. Raw material for a later batch.
          </p>
        </div>
      </div>

      {/* Capture form */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              // Cmd+Enter (or Ctrl+Enter) saves without reaching for the mouse.
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
            rows={4}
            placeholder="What happened?"
            className="text-sm"
          />

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Scope</Label>
              <div className="flex gap-1">
                {SCOPES.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant={scope === s ? "default" : "outline"}
                    size="sm"
                    className={`text-xs ${
                      scope === s
                        ? s === "personal"
                          ? "bg-blue-600 hover:bg-blue-700"
                          : "bg-green-600 hover:bg-green-700"
                        : ""
                    }`}
                    onClick={() => setScope(s)}
                  >
                    {NOTE_SCOPE_LABELS[s]}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="noteDate" className="text-xs text-gray-500">
                Date
              </Label>
              <Input
                id="noteDate"
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                className="h-9 w-[160px] text-sm"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || content.trim().length === 0}
              className="ml-auto bg-blue-600 hover:bg-blue-700"
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Save note
            </Button>
          </div>
          <p className="text-xs text-gray-400">⌘↵ to save</p>
        </CardContent>
      </Card>

      {error && (
        <p className="text-sm text-red-600" role="status">
          {error}
        </p>
      )}

      {/* Count + filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">
            {waiting.personal} personal
          </span>{" "}
          ·{" "}
          <span className="font-medium text-gray-900">
            {waiting.company} company
          </span>{" "}
          waiting
        </p>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value="unused" className="text-xs">
              Unused
            </TabsTrigger>
            <TabsTrigger value="used" className="text-xs">
              Used
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* List */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </CardContent>
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <NotebookPen className="mb-3 h-10 w-10 text-gray-300" />
            <p className="mb-1 text-gray-500">
              {filter === "used"
                ? "No notes have been used yet"
                : filter === "unused"
                ? "Nothing waiting"
                : "No notes yet"}
            </p>
            <p className="text-sm text-gray-400">
              Anything worth a post later starts here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.date} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {dateHeading(group.date)}
              </h3>
              <div className="space-y-2">
                {group.notes.map((note: Note) => (
                  <Card
                    key={note.id}
                    className={note.consumed ? "opacity-60" : ""}
                  >
                    <CardContent className="p-3">
                      {editingId === note.id ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                e.preventDefault();
                                handleUpdate(note.id);
                              }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            rows={3}
                            className="text-sm"
                          />
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              className="h-7 bg-blue-600 text-xs hover:bg-blue-700"
                              onClick={() => handleUpdate(note.id)}
                              disabled={
                                busyId === note.id ||
                                editingText.trim().length === 0
                              }
                            >
                              {busyId === note.id ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Check className="mr-1 h-3 w-3" />
                              )}
                              Save
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="mr-1 h-3 w-3" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-gray-700">
                            {note.content}
                          </p>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <Badge
                              className={`text-xs ${
                                NOTE_SCOPE_STYLES[note.scope as NoteScope] || ""
                              }`}
                            >
                              {NOTE_SCOPE_LABELS[note.scope as NoteScope] ||
                                note.scope}
                            </Badge>

                            {note.consumed ? (
                              <Badge
                                variant="outline"
                                className="border-gray-300 text-xs text-gray-500"
                              >
                                Used
                                {note.batches?.batch_number
                                  ? ` · Batch ${note.batches.batch_number}`
                                  : ""}
                              </Badge>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-gray-400 hover:text-gray-900"
                                  onClick={() => {
                                    setEditingId(note.id);
                                    setEditingText(note.content);
                                  }}
                                  aria-label="Edit note"
                                  title="Edit"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-600"
                                      disabled={busyId === note.id}
                                      aria-label="Delete note"
                                      title="Delete"
                                    >
                                      {busyId === note.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Delete this note?
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        It is removed for good. Nothing else
                                        references it.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        Cancel
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleDelete(note.id)}
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
