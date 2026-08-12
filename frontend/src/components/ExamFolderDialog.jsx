import React, { useEffect, useState, useMemo, useRef } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Loader2, FolderPlus, Search, Users, FileQuestion, Plus, Upload } from "lucide-react";

const TAG_PRESETS = ["JEE Mains", "JEE Advanced", "MHT-CET", "NEET"];

// Marking scheme by exam tag: [positive, negative]
const TAG_MARKS = {
  "JEE Mains": [4, 1],
  "JEE Advanced": [4, 1],
  "MHT-CET": [2, 0],
  "NEET": [4, 1],
};
const marksForTag = (tag) => TAG_MARKS[tag] || [4, 1];
const instructionsForTag = (tag) => {
  const [p, n] = marksForTag(tag);
  return n > 0
    ? `Read each question carefully. Marks: +${p} correct, -${n} wrong.`
    : `Read each question carefully. Marks: +${p} correct, 0 wrong (no negative).`;
};

const blank = () => ({
  folder_name: "",
  exam_id: null,
  exam_name: "",
  exam_tag: "JEE Mains",
  class_level: "11th",
  duration_minutes: 60,
  passing_marks: 0,
  allowed_tab_switches: 3,
  enable_webcam: true,
  negative_marking: true,
  randomize: false,
  is_published: true,
  instructions: "Read each question carefully. Marks: +4 correct, -1 wrong.",
  question_ids: [],
  assigned_student_ids: [],
  auto_assign_class_students: true,
  tag_questions_to_folder: true,
});

export default function ExamFolderDialog({ open, onOpenChange, initial, onSaved }) {
  const [form, setForm] = useState(blank());
  const [questions, setQuestions] = useState([]);
  const [students, setStudents] = useState([]);
  const [qFilter, setQFilter] = useState({ subject: "all", q: "" });
  const [studentSearch, setStudentSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [newQuestionOpen, setNewQuestionOpen] = useState(false);
  const [newQuestionForm, setNewQuestionForm] = useState({
    title: "",
    description: "",
    image_url: "",
    subject: "Mathematics",
    chapter: "",
    topic: "",
    test_folder: "",
    difficulty: "medium",
    tags: [],
    type: "mcq_single",
    options: [
      { key: "A", text: "" },
      { key: "B", text: "" },
      { key: "C", text: "" },
      { key: "D", text: "" },
    ],
    correct_answer: "",
    explanation: "",
    marks: 4,
    negative_marks: 1,
  });
  const [newQuestionLoading, setNewQuestionLoading] = useState(false);
  const [newQuestionImageLoading, setNewQuestionImageLoading] = useState(false);
  const newQuestionFileRef = useRef(null);
  // Once the folder is saved, this holds the created exam id so subsequent
  // "Save & Add Another" questions are attached live to that exam.
  const [liveExamId, setLiveExamId] = useState(null);

  useEffect(() => {
    setNewQuestionForm((prev) => ({ ...prev, test_folder: form.folder_name || "" }));
  }, [form.folder_name]);

  useEffect(() => {
    if (!open) return;
    setForm({ ...blank(), ...(initial || {}) });
    setLiveExamId(initial?.exam_id || null);
    Promise.all([
      api.get("/questions"),
      api.get("/admin/students"),
    ]).then(([qr, sr]) => { setQuestions(qr.data); setStudents(sr.data); });
  }, [open, initial]);

  const subjects = useMemo(() => Array.from(new Set(questions.map((q) => q.subject).filter(Boolean))), [questions]);

  const filteredQs = useMemo(() => {
    return questions.filter((q) => {
      const subjOk = qFilter.subject === "all" || q.subject === qFilter.subject;
      const term = qFilter.q.toLowerCase();
      const textOk = !term || (q.title || "").toLowerCase().includes(term) || (q.tags || []).join(" ").toLowerCase().includes(term);
      return subjOk && textOk;
    });
  }, [questions, qFilter]);

  const filteredStudents = useMemo(() => {
    const m = studentSearch.toLowerCase();
    return students.filter((s) => {
      // If a class is selected on the form, only show same class to avoid mis-assignment
      const classOk = !form.class_level || (s.class_level || "") === form.class_level;
      const textOk = !m || s.name?.toLowerCase().includes(m) || s.username?.toLowerCase().includes(m) || s.enrollment_no?.toLowerCase().includes(m);
      return classOk && textOk;
    });
  }, [students, studentSearch, form.class_level]);

  const uploadNewQuestionImage = async (file) => {
    if (!file) return;
    setNewQuestionImageLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/questions/upload-image", fd);
      setNewQuestionForm({ ...newQuestionForm, image_url: data.image_url });
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Image upload failed");
    } finally {
      setNewQuestionImageLoading(false);
    }
  };

  const resetNewQuestionForm = (nextNum) => {
    const [pos, neg] = marksForTag(form.exam_tag);
    setNewQuestionForm({
      title: nextNum ? `Q${nextNum}. ` : "",
      description: "",
      image_url: "",
      subject: "Mathematics",
      chapter: "",
      topic: "",
      test_folder: form.folder_name || "",
      difficulty: "medium",
      tags: [],
      type: "mcq_single",
      options: [
        { key: "A", text: "" },
        { key: "B", text: "" },
        { key: "C", text: "" },
        { key: "D", text: "" },
      ],
      correct_answer: "",
      explanation: "",
      marks: pos,
      negative_marks: neg,
    });
  };

  const saveNewQuestion = async (keepOpen = false) => {
    if (!newQuestionForm.title.trim()) return toast.error("Question title is required");
    setNewQuestionLoading(true);
    try {
      const payload = {
        ...newQuestionForm,
        test_folder: newQuestionForm.test_folder || form.folder_name || "",
        tags: newQuestionForm.tags?.map((t) => t.trim()).filter(Boolean) || [],
      };
      const { data } = await api.post("/questions", payload);
      setQuestions((prev) => [data, ...prev]);
      setForm((prevForm) => ({
        ...prevForm,
        question_ids: prevForm.question_ids.includes(data.id) ? prevForm.question_ids : [...prevForm.question_ids, data.id],
      }));
      // If the folder was already saved, attach the new question to the exam immediately
      if (liveExamId) {
        try {
          await api.post(`/exams/${liveExamId}/import-from-bank`, { question_ids: [data.id] });
        } catch (attachErr) { /* non-fatal, will be picked up on next Save */ }
      }
      toast.success(keepOpen ? "Question saved · add the next one" : "Question saved and attached");
      // Compute the next question number (form.question_ids was just updated with the new id)
      const nextNumber = ((form.question_ids?.length) || 0) + 2;
      resetNewQuestionForm(keepOpen ? nextNumber : null);
      if (!keepOpen) setNewQuestionOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save question");
    } finally {
      setNewQuestionLoading(false);
    }
  };

  const submit = async () => {
    if (!form.folder_name.trim()) return toast.error("Folder name is required");
    if (!form.exam_name.trim()) return toast.error("Exam name is required");
    setSaving(true);
    try {
      const { data } = await api.post("/questions/folder-exam", form);
      toast.success(`Exam ${data.action} — ${data.questions_count} Qs · ${data.assigned_count} students`);
      // Remember the saved exam so subsequent question adds attach live
      const savedExamId = data?.exam?.id;
      if (savedExamId) {
        setLiveExamId(savedExamId);
        setForm((prev) => ({ ...prev, exam_id: savedExamId }));
      }
      onSaved?.(data);
      // If the folder was created with no questions, open the Create Question wizard
      // so the admin can start adding them one-by-one right away.
      if ((form.question_ids || []).length === 0) {
        resetNewQuestionForm(1);
        setNewQuestionOpen(true);
      } else {
        onOpenChange(false);
      }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save folder");
    } finally { setSaving(false); }
  };

  const isEdit = !!form.exam_id;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-sm max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-primary" />
            {isEdit ? `Edit Exam Folder: ${form.folder_name}` : "Create Exam Folder"}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info" data-testid="ef-tab-info">Folder Info</TabsTrigger>
            <TabsTrigger value="questions" data-testid="ef-tab-questions">
              <FileQuestion className="w-3 h-3 mr-1" /> Questions ({form.question_ids.length})
            </TabsTrigger>
            <TabsTrigger value="students" data-testid="ef-tab-students">
              <Users className="w-3 h-3 mr-1" /> Students ({form.assigned_student_ids.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Folder Name *</Label>
                <Input
                  value={form.folder_name}
                  disabled={isEdit}
                  onChange={(e) => setForm({ ...form, folder_name: e.target.value })}
                  placeholder="e.g. JEE Mains 2024 Paper 1"
                  className="rounded-sm"
                  data-testid="ef-folder-name"
                />
                {isEdit && <p className="text-[10px] text-muted-foreground mt-1">Folder name is locked once created.</p>}
              </div>
              <div>
                <Label>Exam Name *</Label>
                <Input
                  value={form.exam_name}
                  onChange={(e) => setForm({ ...form, exam_name: e.target.value })}
                  placeholder="e.g. JEE Mains Mock — 12th"
                  className="rounded-sm"
                  data-testid="ef-exam-name"
                />
              </div>
              <div>
                <Label>Class / Section</Label>
                <Select value={form.class_level || "any"} onValueChange={(v) => setForm({ ...form, class_level: v === "any" ? "" : v })}>
                  <SelectTrigger className="rounded-sm" data-testid="ef-class"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any (both 11th & 12th)</SelectItem>
                    <SelectItem value="11th">11th Standard</SelectItem>
                    <SelectItem value="12th">12th Standard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Exam Tag</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {TAG_PRESETS.map((t) => (
                    <button type="button" key={t}
                      onClick={() => {
                        const [p, n] = marksForTag(t);
                        setForm({
                          ...form,
                          exam_tag: t,
                          instructions: instructionsForTag(t),
                          negative_marking: n > 0,
                        });
                      }}
                      className={`px-2.5 py-1 text-xs rounded-sm border mono transition-colors ${form.exam_tag === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      data-testid={`ef-tag-${t.replace(/\s+/g, "-")}`}>
                      {t} <span className="opacity-70">(+{marksForTag(t)[0]}/-{marksForTag(t)[1]})</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Duration (min)</Label>
                <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} className="rounded-sm mono" data-testid="ef-duration" />
              </div>
              <div>
                <Label>Passing marks</Label>
                <Input type="number" value={form.passing_marks} onChange={(e) => setForm({ ...form, passing_marks: Number(e.target.value) })} className="rounded-sm mono" />
              </div>
              <div>
                <Label>Allowed tab switches</Label>
                <Input type="number" value={form.allowed_tab_switches} onChange={(e) => setForm({ ...form, allowed_tab_switches: Number(e.target.value) })} className="rounded-sm mono" />
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} data-testid="ef-publish" />
                  Publish
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.enable_webcam} onCheckedChange={(v) => setForm({ ...form, enable_webcam: v })} />
                  Webcam
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.randomize} onCheckedChange={(v) => setForm({ ...form, randomize: v })} />
                  Randomize
                </label>
              </div>
            </div>
            <div>
              <Label>Instructions</Label>
              <Textarea rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </div>
          </TabsContent>

          <TabsContent value="questions" className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3 h-3 absolute left-2.5 top-3 text-muted-foreground" />
                <Input placeholder="Search question text / tags" value={qFilter.q} onChange={(e) => setQFilter({ ...qFilter, q: e.target.value })} className="pl-7 rounded-sm" data-testid="ef-q-search" />
              </div>
              <Select value={qFilter.subject} onValueChange={(v) => setQFilter({ ...qFilter, subject: v })}>
                <SelectTrigger className="w-40 rounded-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subjects</SelectItem>
                  {subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" type="button"
                onClick={() => setForm({ ...form, question_ids: filteredQs.map((q) => q.id) })}
                data-testid="ef-q-select-all">Select all visible</Button>
              <Button size="sm" variant="outline" type="button" onClick={() => setNewQuestionOpen(true)} data-testid="ef-new-question">
                <Plus className="w-3.5 h-3.5 mr-1" /> Create question
              </Button>
              <Button size="sm" variant="ghost" type="button"
                onClick={() => setForm({ ...form, question_ids: [] })}>Clear</Button>
            </div>
            <div className="max-h-[420px] overflow-y-auto border border-border rounded-sm">
              {filteredQs.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No questions match the filter. Add questions to the Question Bank first.</div>}
              {filteredQs.map((q) => (
                <label key={q.id} className="flex gap-3 items-start text-sm cursor-pointer hover:bg-muted/40 p-2.5 border-b border-border last:border-0">
                  <Checkbox
                    checked={form.question_ids.includes(q.id)}
                    onCheckedChange={(c) => setForm({ ...form, question_ids: c ? [...form.question_ids, q.id] : form.question_ids.filter((i) => i !== q.id) })}
                    data-testid={`ef-qpick-${q.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{q.title}</div>
                    <div className="text-xs text-muted-foreground mono flex gap-1.5 flex-wrap mt-0.5">
                      <Badge variant="outline" className="rounded-sm text-[10px]">{q.subject}</Badge>
                      {q.test_folder && <Badge className="rounded-sm text-[10px]">📁 {q.test_folder}</Badge>}
                      <span>{q.difficulty} · +{q.marks}/-{q.negative_marks}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={form.tag_questions_to_folder} onCheckedChange={(c) => setForm({ ...form, tag_questions_to_folder: !!c })} data-testid="ef-tag-questions" />
              Also tag selected questions with this folder name (📁 badge will appear on each)
            </label>
          </TabsContent>

          <TabsContent value="students" className="space-y-3">
            <div className="grid-card p-3 bg-muted/30">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.auto_assign_class_students}
                  onCheckedChange={(v) => setForm({ ...form, auto_assign_class_students: v })}
                  data-testid="ef-auto-assign"
                />
                Auto-assign to all active <strong className="mono">{form.class_level || "—"}</strong> students
              </label>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {form.auto_assign_class_students && form.class_level
                  ? `Every active ${form.class_level} student will get this exam in their portal on save. You can also tick additional students below.`
                  : "Tick the switch and pick a Class on the Info tab to auto-fan-out, OR pick individual students below."}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3 h-3 absolute left-2.5 top-3 text-muted-foreground" />
                <Input placeholder="Search name / username / enrollment" value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} className="pl-7 rounded-sm" data-testid="ef-student-search" />
              </div>
              <Button size="sm" variant="outline" type="button"
                onClick={() => setForm({ ...form, assigned_student_ids: filteredStudents.map((s) => s.id) })}
                data-testid="ef-student-select-all">Select all visible</Button>
              <Button size="sm" variant="ghost" type="button"
                onClick={() => setForm({ ...form, assigned_student_ids: [] })}>Clear</Button>
            </div>
            <div className="max-h-[360px] overflow-y-auto border border-border rounded-sm">
              {filteredStudents.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No students match the filter for class <strong>{form.class_level || "—"}</strong>.</div>}
              {filteredStudents.map((s) => (
                <label key={s.id} className="flex gap-3 items-center text-sm cursor-pointer hover:bg-muted/40 p-2.5 border-b border-border last:border-0">
                  <Checkbox
                    checked={form.assigned_student_ids.includes(s.id)}
                    onCheckedChange={(c) => setForm({ ...form, assigned_student_ids: c ? [...form.assigned_student_ids, s.id] : form.assigned_student_ids.filter((i) => i !== s.id) })}
                    data-testid={`ef-spick-${s.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.name} <span className="text-xs text-muted-foreground mono">@{s.username}</span></div>
                    <div className="text-xs text-muted-foreground mono">
                      {s.class_level ? <Badge variant="outline" className="rounded-sm mr-1 text-[10px]">{s.class_level}</Badge> : null}
                      {s.enrollment_no || "—"}
                    </div>
                  </div>
                  {s.status === "suspended" && <Badge variant="destructive" className="rounded-sm text-[10px]">SUSPENDED</Badge>}
                </label>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button onClick={submit} disabled={saving} data-testid="ef-save">
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            {isEdit
              ? "Save Changes"
              : (form.question_ids.length === 0 ? "Create Folder → Add Questions" : "Create Exam Folder")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={newQuestionOpen} onOpenChange={(o) => {
      setNewQuestionOpen(o);
      if (!o) {
        resetNewQuestionForm();
        // If this add-question dialog was opened after a live folder save,
        // close the parent folder dialog and refresh the folder list.
        if (liveExamId) {
          onOpenChange(false);
          onSaved?.({ exam: { id: liveExamId }, action: "questions_added" });
        }
      }
    }}>
      <DialogContent className="rounded-sm max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="ef-question-header">Create Question — Q{(form.question_ids?.length || 0) + 1}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Question text</Label>
            <Textarea rows={4} value={newQuestionForm.title} onChange={(e) => setNewQuestionForm({ ...newQuestionForm, title: e.target.value })} data-testid="new-question-title" placeholder="Type the question (include options A/B/C/D inside if you want, or upload an image)" />
          </div>
          <div>
            <Label>Image (optional)</Label>
            <div
              className="border border-dashed border-border rounded-sm p-4 text-center cursor-pointer bg-muted/50"
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer?.files?.[0]) uploadNewQuestionImage(e.dataTransfer.files[0]); }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={(e) => e.preventDefault()}
              onDragLeave={(e) => e.preventDefault()}
            >
              <input
                type="file"
                accept="image/*"
                hidden
                ref={newQuestionFileRef}
                onChange={(e) => e.target.files?.[0] && uploadNewQuestionImage(e.target.files[0])}
                data-testid="new-question-image"
              />
              <div className="flex flex-col items-center justify-center gap-1.5">
                {newQuestionImageLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5 text-primary" />}
                <div className="text-sm text-muted-foreground">Drag & drop or <button type="button" className="text-primary underline" onClick={() => newQuestionFileRef.current?.click()}>browse</button></div>
              </div>
            </div>
            {newQuestionForm.image_url ? (
              <div className="mt-3 space-y-2">
                <div className="border border-border rounded-sm overflow-hidden max-h-56">
                  <img src={newQuestionForm.image_url} alt="Uploaded question" className="w-full object-contain" />
                </div>
                <Button size="sm" variant="ghost" type="button" onClick={() => setNewQuestionForm({ ...newQuestionForm, image_url: "" })}>Remove image</Button>
              </div>
            ) : null}
          </div>
          <div>
            <Label>Correct Answer</Label>
            <div className="grid grid-cols-4 gap-2 mt-1.5">
              {["A", "B", "C", "D"].map((k) => {
                const selected = (Array.isArray(newQuestionForm.correct_answer)
                  ? newQuestionForm.correct_answer
                  : [newQuestionForm.correct_answer]).includes(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setNewQuestionForm({ ...newQuestionForm, correct_answer: k })}
                    data-testid={`ef-ans-${k}`}
                    className={`h-14 rounded-sm border-2 font-bold mono text-lg transition ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/60"}`}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Marks (+)</Label><Input type="number" value={newQuestionForm.marks} onChange={(e) => setNewQuestionForm({ ...newQuestionForm, marks: Number(e.target.value) })} data-testid="ef-marks" /></div>
            <div><Label>Negative (-)</Label><Input type="number" value={newQuestionForm.negative_marks} onChange={(e) => setNewQuestionForm({ ...newQuestionForm, negative_marks: Number(e.target.value) })} data-testid="ef-negative" /></div>
          </div>
        </div>
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={() => saveNewQuestion(true)} disabled={newQuestionLoading} data-testid="ef-save-add-next">
            {newQuestionLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Save & Next
          </Button>
          <Button onClick={() => saveNewQuestion(false)} disabled={newQuestionLoading} data-testid="ef-save-new-question">
            {newQuestionLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Finish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
