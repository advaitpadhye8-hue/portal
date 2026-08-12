import React, { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Copy, ChartBar, Save, Share2, MessageSquare, Mail, Link as LinkIcon, QrCode, FolderPlus } from "lucide-react";
import ExamFolderDialog from "@/components/ExamFolderDialog";

const blank = () => ({
  name: "", description: "", type: "mock", exam_type: "mock", duration_minutes: 60,
  exam_tag: "",
  class_level: "",
  batch_ids: [],
  start_at: "", end_at: "",
  passing_marks: 0, total_marks: 0,
  marking_mode: "custom",  // positive | custom | none
  default_marks: 4, default_negative: 1,
  instructions: "Read each question carefully. Marks: +4 correct, -1 wrong (numerical: no negative).",
  randomize: false, negative_marking: true, question_ids: [],
  assigned_student_ids: [],
  allowed_tab_switches: 3, enable_webcam: true, is_published: false, price: 0,
});

const TAG_PRESETS = ["JEE Mains", "JEE Advanced", "MHT-CET", "NEET"];
const EXAM_TYPES = [
  { v: "weekly", l: "Weekly Test" },
  { v: "unit", l: "Unit Test" },
  { v: "chapter", l: "Chapter Test" },
  { v: "mock", l: "Mock Test" },
  { v: "final", l: "Final Test" },
];

// Convert ISO string ↔ datetime-local input value (no timezone offset)
const isoToLocal = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const localToIso = (v) => (v ? new Date(v).toISOString() : null);

export default function Exams() {
  const [rows, setRows] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blank());
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [filterSubject, setFilterSubject] = useState("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [share, setShare] = useState(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  const load = async () => {
    const [{ data: e }, { data: q }, { data: s }, { data: b }] = await Promise.all([
      api.get("/exams"),
      api.get("/questions"),
      api.get("/admin/students"),
      api.get("/batches"),
    ]);
    setRows(e);
    setQuestions(q);
    setStudents(s);
    setBatches(b);
  };

  const openShare = async (e) => {
    try {
      const { data } = await api.post(`/exams/${e.id}/share`);
      // Always rebuild URL from the admin's current browser origin so the share link
      // matches what they see in the address bar (matters when backend is behind ingress).
      const url = `${window.location.origin}/exam/${e.id}`;
      const msg = `You're invited to attempt "${e.name}" on Gyansai. Click to join: ${url}`;
      const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;
      const mail = `mailto:?subject=${encodeURIComponent('Exam Invite: ' + e.name)}&body=${encodeURIComponent(msg)}`;
      setShare({ ...data, url, whatsapp: wa, email: mail, message: msg, exam_name: e.name });
      setShareOpen(true);
    } catch (err) { toast.error("Could not generate share link"); }
  };

  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const payload = { ...form, start_at: localToIso(form.start_at), end_at: localToIso(form.end_at) };
      if (editingId) await api.put(`/exams/${editingId}`, payload);
      else await api.post("/exams", payload);
      toast.success(editingId ? "Exam updated" : "Exam created");
      setOpen(false); setEditingId(null); setForm(blank()); load();
    } catch (e) {
      console.error("Exam submit error", e);
      toast.error(e?.response?.data?.detail || e?.message || "Failed to save exam");
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete exam?")) return;
    await api.delete(`/exams/${id}`); toast.success("Deleted"); load();
  };

  const clone = async (id) => {
    await api.post(`/exams/${id}/clone`); toast.success("Cloned"); load();
  };

  const showAnalytics = async (e) => {
    const { data } = await api.get(`/exams/${e.id}/analytics`);
    setAnalytics({ ...data, exam: e });
    setAnalyticsOpen(true);
  };

  const togglePub = async (e) => {
    await api.put(`/exams/${e.id}`, { ...e, is_published: !e.is_published });
    toast.success(`${!e.is_published ? "Published" : "Unpublished"}`);
    load();
  };

  const uploadQuestionImage = async (file) => {
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/questions/upload-image", fd);
      toast.success("Image uploaded");
      return data.image_url;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Image upload failed");
      return null;
    }
  };

  const filteredQs = filterSubject === "all" ? questions : questions.filter((q) => q.subject === filterSubject);
  const subjects = Array.from(new Set(questions.map((q) => q.subject).filter(Boolean)));

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="overline">// Assessments</div>
          <h1 className="heading text-3xl font-bold mt-1">Exam Management</h1>
          <p className="text-sm text-muted-foreground mt-1">{rows.length} exams · {rows.filter((r) => r.is_published).length} live</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" onClick={() => setFolderDialogOpen(true)} data-testid="exams-create-folder-btn">
          <FolderPlus className="w-4 h-4 mr-1" /> Create Exam Folder
        </Button>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(blank()); } }}>
          <DialogTrigger asChild><Button data-testid="add-exam-btn"><Plus className="w-4 h-4 mr-1" /> Create Exam</Button></DialogTrigger>
          <DialogContent className="rounded-sm max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Edit exam" : "New exam"}</DialogTitle></DialogHeader>
            <Tabs defaultValue="basics">
              <TabsList>
                <TabsTrigger value="basics">Basics</TabsTrigger>
                <TabsTrigger value="questions">Questions ({form.question_ids.length})</TabsTrigger>
                <TabsTrigger value="students" data-testid="tab-students">Students ({form.assigned_student_ids.length})</TabsTrigger>
                <TabsTrigger value="rules">Rules & Proctoring</TabsTrigger>
              </TabsList>
              <TabsContent value="basics" className="space-y-3">
                <div><Label>Exam name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="exam-name" /></div>
                <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div><Label>Exam Type</Label>
                    <Select value={form.exam_type || form.type || "mock"} onValueChange={(v) => setForm({ ...form, exam_type: v, type: v })}>
                      <SelectTrigger className="rounded-sm" data-testid="exam-type-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXAM_TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Class / Section</Label>
                    <Select value={form.class_level || "any"} onValueChange={(v) => setForm({ ...form, class_level: v === "any" ? "" : v, batch_ids: [] })}>
                      <SelectTrigger className="rounded-sm" data-testid="exam-class"><SelectValue placeholder="Any" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any (Both 11th & 12th)</SelectItem>
                        <SelectItem value="11th">11th Standard</SelectItem>
                        <SelectItem value="12th">12th Standard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Duration (min)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} data-testid="exam-duration" /></div>
                  <div><Label>Price (₹)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
                </div>

                <div>
                  <Label>Marking Pattern</Label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {[
                      { v: "positive", l: "Positive only (+marks)" },
                      { v: "custom", l: "Custom (+/-)" },
                      { v: "none", l: "No negative" },
                    ].map((m) => (
                      <button type="button" key={m.v}
                        onClick={() => setForm({ ...form, marking_mode: m.v, negative_marking: m.v === "custom" })}
                        className={`px-2.5 py-1 text-xs rounded-sm border mono transition-colors ${(form.marking_mode || "custom") === m.v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                        data-testid={`mark-mode-${m.v}`}>
                        {m.l}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div><Label className="text-xs">Default +marks</Label><Input type="number" value={form.default_marks} onChange={(e) => setForm({ ...form, default_marks: Number(e.target.value) })} className="rounded-sm mono" data-testid="default-marks" /></div>
                    <div><Label className="text-xs">Default -marks</Label><Input type="number" disabled={form.marking_mode !== "custom"} value={form.default_negative} onChange={(e) => setForm({ ...form, default_negative: Number(e.target.value) })} className="rounded-sm mono" data-testid="default-negative" /></div>
                  </div>
                </div>

                {form.class_level && (
                  <div>
                    <Label>Target Batches (optional)</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {batches.filter((b) => b.class_level === form.class_level).map((b) => (
                        <label key={b.id} className="flex items-center gap-1.5 text-xs px-2 py-1 border border-border rounded-sm cursor-pointer hover:bg-muted">
                          <Checkbox
                            checked={(form.batch_ids || []).includes(b.id)}
                            onCheckedChange={(c) => setForm({ ...form, batch_ids: c ? [...(form.batch_ids || []), b.id] : (form.batch_ids || []).filter((i) => i !== b.id) })}
                            data-testid={`bpick-${b.id}`}
                          />
                          {b.name}
                        </label>
                      ))}
                      {batches.filter((b) => b.class_level === form.class_level).length === 0 && <span className="text-[11px] text-muted-foreground mono">No batches yet for {form.class_level}. Create one in Batches.</span>}
                    </div>
                  </div>
                )}
                <div>
                  <Label>Exam folder / tag</Label>
                  <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
                    {TAG_PRESETS.map((t) => (
                      <button type="button" key={t}
                        onClick={() => setForm({ ...form, exam_tag: t })}
                        className={`px-2.5 py-1 text-xs rounded-sm border mono transition-colors ${form.exam_tag === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                        data-testid={`tag-preset-${t.replace(/\s+/g, "-")}`}>
                        {t}
                      </button>
                    ))}
                    {form.exam_tag && !TAG_PRESETS.includes(form.exam_tag) && (
                      <span className="px-2.5 py-1 text-xs rounded-sm bg-primary text-primary-foreground mono">{form.exam_tag}</span>
                    )}
                  </div>
                  <Input value={form.exam_tag} onChange={(e) => setForm({ ...form, exam_tag: e.target.value })} placeholder="Custom tag e.g. CBSE Practice" className="rounded-sm" data-testid="exam-tag" list="exam-tag-options" />
                  <datalist id="exam-tag-options">
                    {Array.from(new Set([...TAG_PRESETS, ...rows.map((r) => r.exam_tag).filter(Boolean)])).map((t) => <option key={t} value={t} />)}
                  </datalist>
                </div>
                <div><Label>Pass marks</Label><Input type="number" value={form.passing_marks} onChange={(e) => setForm({ ...form, passing_marks: Number(e.target.value) })} className="rounded-sm" /></div>
                <div><Label>Instructions</Label><Textarea rows={4} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                  <div>
                    <Label>Start at (optional — schedule)</Label>
                    <Input type="datetime-local" value={isoToLocal(form.start_at)} onChange={(e) => setForm({ ...form, start_at: e.target.value })} className="rounded-sm mono" data-testid="exam-start-at" />
                  </div>
                  <div>
                    <Label>End at (optional — window closes)</Label>
                    <Input type="datetime-local" value={isoToLocal(form.end_at)} onChange={(e) => setForm({ ...form, end_at: e.target.value })} className="rounded-sm mono" data-testid="exam-end-at" />
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground mono">Leave blank for always-available. Times are stored in UTC.</div>
                </div>
              </TabsContent>

              <TabsContent value="questions" className="space-y-3">
                <div className="rounded-sm border border-border bg-muted/70 p-4">
                  <div className="font-medium">Question attachment</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add questions one-by-one in the Question Bank, then attach them to exams from the Question Bank page.
                    This exam currently has <strong>{form.question_ids.length}</strong> attached question{form.question_ids.length === 1 ? "" : "s"}.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="students" className="space-y-3">
                <div className="grid-card p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    <strong>Assign specific students</strong> — only the selected students will see this exam in their portal.
                    Leave empty + publish to make it visible to all students (optionally filtered by Class).
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input placeholder="Search name / username / enrollment…" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} className="rounded-sm flex-1 min-w-[200px]" data-testid="student-search" />
                  <Button size="sm" variant="outline" type="button" onClick={() => {
                    const visible = students.filter((s) => {
                      const m = studentSearch.toLowerCase();
                      const classMatch = !form.class_level || (s.class_level || "") === form.class_level;
                      return classMatch && (!m || s.name?.toLowerCase().includes(m) || s.username?.toLowerCase().includes(m) || s.enrollment_no?.toLowerCase().includes(m));
                    });
                    setForm({ ...form, assigned_student_ids: visible.map((s) => s.id) });
                  }} data-testid="student-select-all">Select all visible</Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setForm({ ...form, assigned_student_ids: [] })}>Clear</Button>
                  <div className="text-xs text-muted-foreground mono ml-auto">Selected: {form.assigned_student_ids.length}</div>
                </div>
                <div className="max-h-[400px] overflow-y-auto border border-border rounded-sm">
                  {students.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No students yet. Add students from the Students page.</div>}
                  {students
                    .filter((s) => {
                      const m = studentSearch.toLowerCase();
                      const classMatch = !form.class_level || (s.class_level || "") === form.class_level;
                      return classMatch && (!m || s.name?.toLowerCase().includes(m) || s.username?.toLowerCase().includes(m) || s.enrollment_no?.toLowerCase().includes(m));
                    })
                    .map((s) => (
                      <label key={s.id} className="flex gap-3 items-center text-sm cursor-pointer hover:bg-muted/40 p-2.5 border-b border-border last:border-0">
                        <Checkbox
                          checked={form.assigned_student_ids.includes(s.id)}
                          onCheckedChange={(c) => setForm({ ...form, assigned_student_ids: c ? [...form.assigned_student_ids, s.id] : form.assigned_student_ids.filter((i) => i !== s.id) })}
                          data-testid={`spick-${s.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{s.name} <span className="text-xs text-muted-foreground mono">@{s.username}</span></div>
                          <div className="text-xs text-muted-foreground mono">
                            {s.class_level ? <Badge variant="outline" className="rounded-sm mr-1 text-[10px]">{s.class_level}</Badge> : null}
                            {s.enrollment_no || "—"} · {s.email || "no email"}
                          </div>
                        </div>
                        {s.status === "suspended" && <Badge variant="destructive" className="rounded-sm text-[10px]">SUSPENDED</Badge>}
                      </label>
                    ))}
                </div>
              </TabsContent>

              <TabsContent value="rules" className="space-y-4">
                <div className="flex items-center justify-between border border-border p-3 rounded-sm">
                  <div><div className="font-medium text-sm">Randomize questions</div><div className="text-xs text-muted-foreground">Shuffle order for each student</div></div>
                  <Switch checked={form.randomize} onCheckedChange={(v) => setForm({ ...form, randomize: v })} />
                </div>
                <div className="flex items-center justify-between border border-border p-3 rounded-sm">
                  <div><div className="font-medium text-sm">Negative marking</div><div className="text-xs text-muted-foreground">Deduct on wrong answers</div></div>
                  <Switch checked={form.negative_marking} onCheckedChange={(v) => setForm({ ...form, negative_marking: v })} />
                </div>
                <div className="flex items-center justify-between border border-border p-3 rounded-sm">
                  <div><div className="font-medium text-sm">Webcam proctoring</div><div className="text-xs text-muted-foreground">Capture snapshots during exam</div></div>
                  <Switch checked={form.enable_webcam} onCheckedChange={(v) => setForm({ ...form, enable_webcam: v })} />
                </div>
                <div className="border border-border p-3 rounded-sm">
                  <Label>Allowed tab switches (auto-submit after)</Label>
                  <Select value={String(form.allowed_tab_switches)} onValueChange={(v) => setForm({ ...form, allowed_tab_switches: Number(v) })}>
                    <SelectTrigger className="rounded-sm mt-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[3, 5, 8, 10].map((n) => <SelectItem key={n} value={String(n)}>{n} switches</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between border border-border p-3 rounded-sm">
                  <div><div className="font-medium text-sm">Publish exam</div><div className="text-xs text-muted-foreground">Visible to students</div></div>
                  <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter><Button onClick={submit} data-testid="exam-save"><Save className="w-4 h-4 mr-1" /> {editingId ? "Update" : "Create"} Exam</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </header>

      <ExamFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onSaved={() => { load(); }}
      />

      <div className="space-y-6">
        {rows.length === 0 && <div className="grid-card p-12 text-center text-muted-foreground">No exams yet.</div>}
        {(() => {
          const groups = {};
          rows.forEach((e) => {
            const k = (e.exam_tag || "Uncategorized").trim() || "Uncategorized";
            (groups[k] = groups[k] || []).push(e);
          });
          const orderedKeys = Object.keys(groups).sort((a, b) => (a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b)));
          return orderedKeys.map((tag) => (
            <section key={tag} data-testid={`folder-${tag}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="overline">📁 {tag}</div>
                <Badge variant="outline" className="rounded-sm">{groups[tag].length} exam{groups[tag].length === 1 ? "" : "s"}</Badge>
                <div className="flex-1 border-t border-border" />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups[tag].map((e) => (
                  <div key={e.id} className="grid-card p-5 brutalist-hover" data-testid={`exam-card-${e.id}`}>
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant={e.is_published ? "default" : "secondary"} className="rounded-sm">{e.is_published ? "LIVE" : "DRAFT"}</Badge>
                          {e.class_level && <Badge variant="outline" className="rounded-sm mono text-[10px]">{e.class_level}</Badge>}
                          {(e.assigned_student_ids || []).length > 0 && <Badge variant="outline" className="rounded-sm mono text-[10px]">👥 {e.assigned_student_ids.length}</Badge>}
                        </div>
                        <h3 className="heading text-lg font-semibold mt-2">{e.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{e.description}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                      <div><div className="overline">Type</div><div className="mono mt-1">{e.type}</div></div>
                      <div><div className="overline">Duration</div><div className="mono mt-1">{e.duration_minutes} min</div></div>
                      <div><div className="overline">Questions</div><div className="mono mt-1">{(e.question_ids || []).length}</div></div>
                    </div>
                    {(e.start_at || e.end_at) && (
                      <div className="mt-3 text-[11px] mono text-muted-foreground border-t border-border pt-2 space-y-0.5">
                        {e.start_at && <div>↗ Opens: {new Date(e.start_at).toLocaleString()}</div>}
                        {e.end_at && <div>↘ Closes: {new Date(e.end_at).toLocaleString()}</div>}
                      </div>
                    )}
                    <div className="flex gap-1 mt-4 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => { setEditingId(e.id); setForm({ ...blank(), ...e }); setOpen(true); }} data-testid={`exam-edit-${e.id}`}><Pencil className="w-3 h-3 mr-1" />Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => togglePub(e)} data-testid={`exam-publish-${e.id}`}>{e.is_published ? "Unpublish" : "Publish"}</Button>
                      <Button size="sm" variant="outline" onClick={() => openShare(e)} data-testid={`exam-share-${e.id}`}><Share2 className="w-3 h-3 mr-1" />Share</Button>
                      <Button size="sm" variant="outline" onClick={() => clone(e.id)}><Copy className="w-3 h-3 mr-1" />Clone</Button>
                      <Button size="sm" variant="outline" onClick={() => showAnalytics(e)} data-testid={`exam-analytics-${e.id}`}><ChartBar className="w-3 h-3 mr-1" />Analytics</Button>
                      <Button size="sm" variant="ghost" onClick={() => del(e.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ));
        })()}
      </div>

      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle>Analytics — {analytics?.exam?.name}</DialogTitle></DialogHeader>
          {analytics && (
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Total attempts", analytics.count],
                ["Highest", analytics.highest],
                ["Lowest", analytics.lowest],
                ["Average", analytics.avg],
                ["Pass %", `${analytics.pass_pct}%`],
              ].map(([k, v]) => (
                <div key={k} className="grid-card p-3"><div className="overline">{k}</div><div className="mono text-xl font-bold mt-1">{v}</div></div>
              ))}
              <div className="col-span-2 grid-card p-3">
                <div className="overline mb-2">Subject avg score</div>
                {Object.entries(analytics.subject_avg || {}).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm border-b border-border last:border-0 py-1.5"><span>{k}</span><span className="mono">{v}</span></div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {/* Share Exam Link Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="rounded-sm max-w-md" data-testid="share-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Share2 className="w-4 h-4 text-primary" /> Share Exam</DialogTitle>
          </DialogHeader>
          {share && (
            <div className="space-y-3">
              <div className="text-sm font-medium">{share.exam_name}</div>
              <div className="border border-border rounded-sm p-2.5 mono text-xs break-all bg-muted/30" data-testid="share-url">{share.url}</div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(share.url); toast.success("Link copied"); }} data-testid="share-copy"><LinkIcon className="w-4 h-4 mr-1" /> Copy</Button>
                <a href={share.whatsapp} target="_blank" rel="noreferrer"><Button variant="outline" className="w-full" data-testid="share-whatsapp"><MessageSquare className="w-4 h-4 mr-1" /> WhatsApp</Button></a>
                <a href={share.email}><Button variant="outline" className="w-full" data-testid="share-email"><Mail className="w-4 h-4 mr-1" /> Email</Button></a>
                <Button variant="outline" onClick={() => window.open(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(share.url)}`, "_blank")} data-testid="share-qr"><QrCode className="w-4 h-4 mr-1" /> QR Code</Button>
              </div>
              <div className="border border-border rounded-sm p-2 bg-muted/30">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(share.url)}`} alt="QR code" className="mx-auto block" />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* OCR review and import dialog to be added here if needed */}
    </div>
  );
}
