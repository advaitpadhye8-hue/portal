import React, { useEffect, useMemo, useState, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Loader2, Save, Wand2, Folder, FolderPlus, Search, Upload } from "lucide-react";
import ExamFolderDialog from "@/components/ExamFolderDialog";

const TYPES = [
  { v: "mcq_single", l: "MCQ — Single" },
  { v: "mcq_multi", l: "MCQ — Multiple" },
  { v: "true_false", l: "True / False" },
  { v: "fill_blank", l: "Fill in the Blank" },
  { v: "numerical", l: "Numerical" },
  { v: "short", l: "Short Answer" },
  { v: "long", l: "Long Answer" },
];

const TAG_PRESETS = ["JEE Mains", "JEE Advanced", "MHT-CET", "NEET"];

const blankQ = () => ({
  title: "", description: "", subject: "Mathematics", chapter: "", topic: "",
  test_folder: "",
  difficulty: "medium", tags: [], type: "mcq_single",
  options: [{ key: "A", text: "" }, { key: "B", text: "" }, { key: "C", text: "" }, { key: "D", text: "" }],
  correct_answer: "", explanation: "", marks: 4, negative_marks: 1,
  image_url: "",
});

export default function Questions() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ subject: "all", difficulty: "all", test_folder: "all", q: "" });
  const [meta, setMeta] = useState({ subjects: [], chapters: [], topics: [], test_folders: [], total: 0 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blankQ());
  const [editingId, setEditingId] = useState(null);
  const [imageUploadLoading, setImageUploadLoading] = useState(false);
  const [qaOpen, setQaOpen] = useState(false);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaForm, setQaForm] = useState({
    test_folder: "",
    exam_name: "",
    exam_tag: "JEE Mains",
    class_level: "11th",
    duration_minutes: 60,
    allowed_tab_switches: 3,
    auto_assign_class_students: true,
    is_published: true,
  });
  const [folders, setFolders] = useState([]);
  const [efOpen, setEfOpen] = useState(false);
  const [efInitial, setEfInitial] = useState(null);
  const [folderSearch, setFolderSearch] = useState("");

  const loadFolders = async () => {
    try { const { data } = await api.get("/questions/folders"); setFolders(data); }
    catch (e) { /* non-fatal */ }
  };

  const load = async () => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") params[k] = v; });
    const { data } = await api.get("/questions", { params });
    setRows(data);
    const m = await api.get("/questions/meta");
    setMeta(m.data);
    loadFolders();
  };

  const filteredFolders = useMemo(() => {
    const term = folderSearch.trim().toLowerCase();
    if (!term) return folders;
    return folders.filter((f) => {
      const candidates = [f.folder_name, f.exam_name, f.exam_tag, f.class_level].filter(Boolean);
      return candidates.some((value) => value.toLowerCase().includes(term));
    });
  }, [folders, folderSearch]);

  useEffect(() => { load(); }, []);

  const openFolderEdit = async (f) => {
    // Need to fetch the exam to pre-fill assigned_student_ids + question_ids
    if (!f.exam_id) {
      setEfInitial({ folder_name: f.folder_name });
      setEfOpen(true);
      return;
    }
    try {
      const { data: exam } = await api.get(`/exams/${f.exam_id}`);
      setEfInitial({
        folder_name: f.folder_name,
        exam_id: exam.id,
        exam_name: exam.name,
        exam_tag: exam.exam_tag || "JEE Mains",
        class_level: exam.class_level || "",
        duration_minutes: exam.duration_minutes,
        passing_marks: exam.passing_marks || 0,
        allowed_tab_switches: exam.allowed_tab_switches ?? 3,
        enable_webcam: exam.enable_webcam !== false,
        negative_marking: exam.negative_marking !== false,
        randomize: !!exam.randomize,
        is_published: !!exam.is_published,
        instructions: exam.instructions || "",
        question_ids: exam.question_ids || [],
        assigned_student_ids: exam.assigned_student_ids || [],
        auto_assign_class_students: false,
        tag_questions_to_folder: true,
      });
      setEfOpen(true);
    } catch (e) {
      toast.error("Couldn't load exam folder");
    }
  };

  const delFolder = async (fname) => {
    if (!window.confirm(`Delete folder "${fname}"? This removes the folder tag from its questions and deletes the linked exam (questions themselves are preserved).`)) return;
    try {
      const { data } = await api.delete(`/questions/folders/${encodeURIComponent(fname)}`);
      toast.success(`Folder removed${data.exams_deleted ? ` · ${data.exams_deleted} exam(s) deleted` : ""}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const submit = async () => {
    try {
      if (editingId) {
        await api.put(`/questions/${editingId}`, form);
        toast.success("Question updated");
      } else {
        await api.post("/questions", form);
        toast.success("Question saved");
      }
      setOpen(false); setEditingId(null); setForm(blankQ()); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const uploadQuestionImage = async (file) => {
    if (!file) return;
    setImageUploadLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/questions/upload-image", fd);
      setForm({ ...form, image_url: data.image_url });
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Image upload failed");
    } finally {
      setImageUploadLoading(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Delete?")) return;
    await api.delete(`/questions/${id}`);
    toast.success("Deleted");
    load();
  };


  const runQuickAssign = async () => {
    if (!qaForm.test_folder.trim() || !qaForm.exam_name.trim()) {
      toast.error("Pick a test folder and enter an exam name");
      return;
    }
    setQaLoading(true);
    try {
      const { data } = await api.post("/questions/quick-assign-exam", qaForm);
      toast.success(`Exam "${data.exam.name}" created with ${data.questions_count} questions → ${data.assigned_count} student(s) assigned`);
      setQaOpen(false);
      setQaForm({ ...qaForm, exam_name: "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Quick assign failed");
    } finally { setQaLoading(false); }
  };

  return (
    <div className="p-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="overline">// Repository</div>
          <h1 className="heading text-3xl font-bold mt-1">Question Bank</h1>
          <p className="text-sm text-muted-foreground mt-1 mono">{meta.total} questions stored permanently</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="default" onClick={() => { setEfInitial(null); setEfOpen(true); }} data-testid="create-folder-btn">
            <FolderPlus className="w-4 h-4 mr-1" /> Create Exam Folder
          </Button>
          <Dialog open={qaOpen} onOpenChange={setQaOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="quick-assign-btn"><Wand2 className="w-4 h-4 mr-1" /> Quick Assign</Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm max-w-xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Wand2 className="w-4 h-4 text-primary" /> Folder → Class → Exam Wizard</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">Pick a question folder, target class &amp; exam name. We&apos;ll create the exam with all questions in that folder and auto-assign it to every active student of that class.</p>
              <div className="space-y-3">
                <div>
                  <Label>Test Folder (source questions) *</Label>
                  <Select value={qaForm.test_folder || ""} onValueChange={(v) => setQaForm({ ...qaForm, test_folder: v })}>
                    <SelectTrigger className="rounded-sm" data-testid="qa-folder"><SelectValue placeholder="Choose folder…" /></SelectTrigger>
                    <SelectContent>
                      {(meta.test_folders || []).length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No folders yet — tag questions with a Test Folder first.</div>}
                      {(meta.test_folders || []).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Exam name *</Label>
                  <Input value={qaForm.exam_name} onChange={(e) => setQaForm({ ...qaForm, exam_name: e.target.value })} placeholder="e.g. JEE Mains Mock — 12th Std" className="rounded-sm" data-testid="qa-exam-name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Target Class</Label>
                    <Select value={qaForm.class_level} onValueChange={(v) => setQaForm({ ...qaForm, class_level: v })}>
                      <SelectTrigger className="rounded-sm" data-testid="qa-class"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="11th">11th Standard</SelectItem>
                        <SelectItem value="12th">12th Standard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Exam Tag (folder)</Label>
                    <Select value={qaForm.exam_tag} onValueChange={(v) => setQaForm({ ...qaForm, exam_tag: v })}>
                      <SelectTrigger className="rounded-sm" data-testid="qa-tag"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TAG_PRESETS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Duration (min)</Label>
                    <Input type="number" value={qaForm.duration_minutes} onChange={(e) => setQaForm({ ...qaForm, duration_minutes: Number(e.target.value) })} className="rounded-sm mono" data-testid="qa-duration" />
                  </div>
                  <div>
                    <Label>Tab switches allowed</Label>
                    <Input type="number" value={qaForm.allowed_tab_switches} onChange={(e) => setQaForm({ ...qaForm, allowed_tab_switches: Number(e.target.value) })} className="rounded-sm mono" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={qaForm.auto_assign_class_students} onChange={(e) => setQaForm({ ...qaForm, auto_assign_class_students: e.target.checked })} data-testid="qa-auto-assign" />
                  Auto-assign to all active students of <span className="mono font-bold">{qaForm.class_level}</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={qaForm.is_published} onChange={(e) => setQaForm({ ...qaForm, is_published: e.target.checked })} />
                  Publish immediately
                </label>
              </div>
              <DialogFooter>
                <Button onClick={runQuickAssign} disabled={qaLoading} data-testid="qa-submit">
                  {qaLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Wand2 className="w-4 h-4 mr-1" />}
                  Create Exam & Assign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(blankQ()); } }}>
            <DialogTrigger asChild>
              <Button data-testid="add-question-btn"><Plus className="w-4 h-4 mr-1" /> Add Question</Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Edit question" : "New question"}</DialogTitle></DialogHeader>
              <Tabs defaultValue="basic">
                <TabsList><TabsTrigger value="basic">Basic</TabsTrigger><TabsTrigger value="options">Options</TabsTrigger><TabsTrigger value="meta">Metadata</TabsTrigger></TabsList>
                <TabsContent value="basic" className="space-y-3">
                  <div><Label>Title / Question text</Label><Textarea rows={3} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="q-title" /></div>
                  <div><Label>Description (optional)</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                  <div>
                    <Label>Image (optional)</Label>
                    <div
                      className="border border-dashed border-border rounded-sm p-5 text-center cursor-pointer bg-muted/50"
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (e.dataTransfer?.files?.[0]) {
                          uploadQuestionImage(e.dataTransfer.files[0]);
                        }
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnter={(e) => e.preventDefault()}
                      onDragLeave={(e) => e.preventDefault()}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        id="question-image-upload"
                        onChange={(e) => e.target.files?.[0] && uploadQuestionImage(e.target.files[0])}
                        data-testid="q-image-input"
                      />
                      <label htmlFor="question-image-upload" className="block">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Upload className="w-5 h-5 text-primary" />
                          <div className="text-sm text-muted-foreground">Drag and drop an image here, or click to select one</div>
                          <div className="text-xs text-muted-foreground">Supported: JPG, PNG. Max 10MB.</div>
                        </div>
                      </label>
                    </div>
                    {form.image_url ? (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs text-muted-foreground">Uploaded image preview:</div>
                        <div className="border border-border rounded-sm overflow-hidden max-h-56">
                          <img src={form.image_url} alt="Uploaded question" className="w-full object-contain" />
                        </div>
                        <div className="flex items-center gap-2">
                          <a href={form.image_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Open full image</a>
                          <Button size="sm" variant="ghost" type="button" onClick={() => setForm({ ...form, image_url: "" })}>
                            Remove image
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {imageUploadLoading ? (
                      <div className="text-xs text-muted-foreground mt-2">Uploading image…</div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Type</Label>
                      <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                        <SelectTrigger className="rounded-sm" data-testid="q-type"><SelectValue /></SelectTrigger>
                        <SelectContent>{TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Difficulty</Label>
                      <Select value={form.difficulty} onValueChange={(v) => setForm({ ...form, difficulty: v })}>
                        <SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="options" className="space-y-3">
                  {form.type.startsWith("mcq") && form.options.map((o, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input className="w-12 mono" value={o.key} onChange={(e) => { const c = [...form.options]; c[i].key = e.target.value; setForm({ ...form, options: c }); }} />
                      <Input value={o.text} onChange={(e) => { const c = [...form.options]; c[i].text = e.target.value; setForm({ ...form, options: c }); }} data-testid={`opt-${i}`} />
                    </div>
                  ))}
                  <div>
                    <Label>Correct answer {form.type === "mcq_multi" && <span className="text-xs text-muted-foreground">(comma-separated, e.g. A,C)</span>}</Label>
                    <Input
                      value={Array.isArray(form.correct_answer) ? form.correct_answer.join(",") : (form.correct_answer ?? "")}
                      onChange={(e) => setForm({ ...form, correct_answer: form.type === "mcq_multi" ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : e.target.value })}
                      data-testid="q-correct"
                    />
                  </div>
                  <div><Label>Explanation</Label><Textarea rows={2} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} /></div>
                </TabsContent>
                <TabsContent value="meta" className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
                    <div><Label>Chapter</Label><Input value={form.chapter} onChange={(e) => setForm({ ...form, chapter: e.target.value })} /></div>
                    <div><Label>Topic</Label><Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} /></div>
                    <div><Label>Marks</Label><Input type="number" value={form.marks} onChange={(e) => setForm({ ...form, marks: Number(e.target.value) })} /></div>
                    <div><Label>Negative</Label><Input type="number" value={form.negative_marks} onChange={(e) => setForm({ ...form, negative_marks: Number(e.target.value) })} /></div>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5"><Folder className="w-3 h-3" /> Test Folder <span className="text-xs text-muted-foreground">(group by test name — used for Quick Assign)</span></Label>
                    <Input value={form.test_folder || ""} onChange={(e) => setForm({ ...form, test_folder: e.target.value })} placeholder="e.g. JEE Mains 2024 Paper 1" className="rounded-sm" list="folder-options" data-testid="q-test-folder" />
                    <datalist id="folder-options">
                      {(meta.test_folders || []).map((f) => <option key={f} value={f} />)}
                    </datalist>
                  </div>
                  <div>
                    <Label>Tags (comma-separated)</Label>
                    <Input value={(form.tags || []).join(",")} onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
                  </div>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button onClick={submit} data-testid="q-save"><Save className="w-4 h-4 mr-1" /> {editingId ? "Update" : "Save question"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {/* Exam Folders Grid */}
      {folders.length > 0 && (
        <section data-testid="exam-folders-section">
          <div className="flex items-center gap-3 mb-3">
            <div className="overline flex items-center gap-1.5"><Folder className="w-3 h-3" /> Exam Folders</div>
              <Badge variant="outline" className="rounded-sm mono">{filteredFolders.length} / {folders.length}</Badge>
            <div className="flex-1 border-t border-border" />
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3 h-3 absolute left-2.5 top-3 text-muted-foreground" />
              <Input
                placeholder="Search exam folders..."
                value={folderSearch}
                onChange={(e) => setFolderSearch(e.target.value)}
                className="pl-7 rounded-sm"
                data-testid="folder-search"
              />
            </div>
            <Button variant="outline" onClick={() => setFolderSearch("")} data-testid="folder-search-clear">Clear</Button>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredFolders.map((f) => (
              <div key={f.folder_name} className="grid-card p-4 brutalist-hover" data-testid={`folder-card-${f.folder_name}`}>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {f.exam_id ? (
                    <Badge variant={f.is_published ? "default" : "secondary"} className="rounded-sm text-[10px]">{f.is_published ? "LIVE" : "DRAFT"}</Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-sm text-[10px]">QUESTIONS ONLY</Badge>
                  )}
                  {f.class_level && <Badge variant="outline" className="rounded-sm mono text-[10px]">{f.class_level}</Badge>}
                  {f.exam_tag && <Badge variant="outline" className="rounded-sm mono text-[10px]">{f.exam_tag}</Badge>}
                </div>
                <h3 className="heading text-base font-semibold mt-2 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-primary" /> {f.folder_name}
                </h3>
                {f.exam_name && <p className="text-xs text-muted-foreground mt-0.5 mono truncate">{f.exam_name}</p>}
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div><div className="overline text-[9px]">Questions</div><div className="mono mt-0.5 font-bold">{f.question_count}</div></div>
                  <div><div className="overline text-[9px]">Students</div><div className="mono mt-0.5 font-bold">{f.assigned_count ?? "—"}</div></div>
                  <div><div className="overline text-[9px]">Duration</div><div className="mono mt-0.5 font-bold">{f.duration_minutes ? `${f.duration_minutes}m` : "—"}</div></div>
                </div>
                <div className="flex gap-1 mt-3">
                  <Button size="sm" variant="outline" className="flex-1 rounded-sm" onClick={() => openFolderEdit(f)} data-testid={`folder-edit-${f.folder_name}`}>
                    <Pencil className="w-3 h-3 mr-1" /> {f.exam_id ? "Edit" : "Make Exam"}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => delFolder(f.folder_name)} data-testid={`folder-del-${f.folder_name}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div><Label className="text-xs">Subject</Label>
          <Select value={filters.subject} onValueChange={(v) => setFilters({ ...filters, subject: v })}>
            <SelectTrigger className="w-44 rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {meta.subjects.filter(Boolean).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Difficulty</Label>
          <Select value={filters.difficulty} onValueChange={(v) => setFilters({ ...filters, difficulty: v })}>
            <SelectTrigger className="w-36 rounded-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs flex items-center gap-1"><Folder className="w-3 h-3" />Test Folder</Label>
          <Select value={filters.test_folder} onValueChange={(v) => setFilters({ ...filters, test_folder: v })}>
            <SelectTrigger className="w-52 rounded-sm" data-testid="filter-folder"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All folders</SelectItem>
              {(meta.test_folders || []).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 max-w-md">
          <Label className="text-xs">Search</Label>
          <Input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search text…" className="rounded-sm" data-testid="q-search" />
        </div>
        <Button variant="outline" onClick={load}>Apply</Button>
      </div>

      <div className="grid gap-3">
        {rows.length === 0 && <div className="grid-card p-12 text-center text-muted-foreground">No questions match these filters.</div>}
        {rows.map((q) => (
          <div key={q.id} className="grid-card p-5" data-testid={`q-row-${q.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex gap-2 mb-2 flex-wrap">
                  <Badge variant="outline" className="rounded-sm">{q.subject}</Badge>
                  {q.test_folder && <Badge className="rounded-sm mono" data-testid={`q-folder-${q.id}`}>📁 {q.test_folder}</Badge>}
                  {q.chapter && <Badge variant="outline" className="rounded-sm">{q.chapter}</Badge>}
                  <Badge variant="outline" className="rounded-sm">{q.difficulty}</Badge>
                  <Badge className="rounded-sm">{q.type}</Badge>
                  <Badge variant="secondary" className="rounded-sm mono">+{q.marks} / -{q.negative_marks}</Badge>
                </div>
                <div className="font-medium">{q.title}</div>
                {q.type?.startsWith("mcq") && (
                  <div className="grid sm:grid-cols-2 gap-1 mt-2 text-sm text-muted-foreground">
                    {(q.options || []).map((o) => (
                      <div key={o.key} className={`mono ${(Array.isArray(q.correct_answer) ? q.correct_answer.includes(o.key) : q.correct_answer === o.key) ? "text-[hsl(145_50%_41%)] font-semibold" : ""}`}>
                        {o.key}. {o.text}
                      </div>
                    ))}
                  </div>
                )}
                {q.image_url && (
                  <div className="mt-2">
                    <img src={q.image_url} alt="Uploaded question" className="w-full max-w-xs object-contain rounded-sm border" />
                  </div>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" onClick={() => { setEditingId(q.id); setForm({ ...blankQ(), ...q }); setOpen(true); }} data-testid={`q-edit-${q.id}`}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(q.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <ExamFolderDialog
        open={efOpen}
        onOpenChange={setEfOpen}
        initial={efInitial}
        onSaved={() => load()}
      />
    </div>
  );
}
