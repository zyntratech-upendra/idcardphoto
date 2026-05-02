import { useEffect, useState } from "react";
import api from "../api/apiClient";

const initialForm = {
  fullName: "",
  rollNumber: "",
  department: "",
  course: "",
  year: "",
  email: "",
  phone: "",
  photoUrl: "",
};

const StudentManager = ({ onStudentsChanged }) => {
  const [form, setForm] = useState(initialForm);
  const [editingStudentId, setEditingStudentId] = useState("");
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [csvFile, setCsvFile] = useState(null);
  const [importSummary, setImportSummary] = useState("");

  const loadStudents = async (q = "") => {
    setLoading(true);
    try {
      const res = await api.get("/students", { params: q ? { q } : {} });
      setStudents(res.data.students || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const saveStudent = async (event) => {
    event.preventDefault();
    setError("");
    try {
      if (editingStudentId) {
        await api.put(`/students/${editingStudentId}`, form);
      } else {
        await api.post("/students", form);
      }
      setForm(initialForm);
      setEditingStudentId("");
      await loadStudents(search);
      onStudentsChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${editingStudentId ? "update" : "add"} student`);
    }
  };

  const startEditing = (student) => {
    setError("");
    setEditingStudentId(student._id);
    setForm(
      Object.keys(initialForm).reduce(
        (nextForm, key) => ({
          ...nextForm,
          [key]: student[key] || "",
        }),
        {}
      )
    );
  };

  const cancelEditing = () => {
    setEditingStudentId("");
    setForm(initialForm);
    setError("");
  };

  const deleteStudent = async (id) => {
    try {
      await api.delete(`/students/${id}`);
      if (editingStudentId === id) {
        cancelEditing();
      }
      await loadStudents(search);
      onStudentsChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to delete student");
    }
  };

  const importCsv = async () => {
    if (!csvFile) return;
    setError("");
    setImportSummary("");
    try {
      const data = new FormData();
      data.append("file", csvFile);
      const res = await api.post("/students/bulk-csv", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportSummary(
        `Imported: ${res.data.created} | Skipped: ${res.data.skipped} | Errors: ${res.data.errors?.length || 0}`
      );
      setCsvFile(null);
      await loadStudents(search);
      onStudentsChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || "CSV import failed");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            {editingStudentId ? "Edit Student Record" : "Manual Student Entry"}
          </h2>
          {editingStudentId && (
            <button
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
              type="button"
              onClick={cancelEditing}
            >
              Cancel
            </button>
          )}
        </div>
        <form className="mt-4 grid gap-2" onSubmit={saveStudent}>
          {Object.keys(initialForm).map((key) => (
            <input
              key={key}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder={key}
              value={form[key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              required={key === "fullName" || key === "rollNumber"}
            />
          ))}
          <button className="mt-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
            {editingStudentId ? "Update Student" : "Add Student"}
          </button>
        </form>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-800">CSV Bulk Upload</h3>
          <p className="mt-1 text-xs text-slate-600">
            Supported columns: fullName, rollNumber, department, course, year, email, phone, photoUrl.
          </p>
          <input
            className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
            type="file"
            accept=".csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
          />
          <button
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-60"
            type="button"
            onClick={importCsv}
            disabled={!csvFile}
          >
            Upload CSV
          </button>
          {importSummary && <p className="mt-2 text-xs text-emerald-700">{importSummary}</p>}
        </div>

        {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Student Records</h2>
          <input
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Search by name, roll number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                loadStudents(e.currentTarget.value);
              }
            }}
          />
        </div>
        <div className="mt-4 overflow-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Roll No</th>
                <th className="px-3 py-2">Department</th>
                <th className="px-3 py-2">Course</th>
                <th className="px-3 py-2">Year</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={7}>
                    Loading students...
                  </td>
                </tr>
              )}
              {!loading && !students.length && (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={7}>
                    No students found.
                  </td>
                </tr>
              )}
              {students.map((student) => (
                <tr key={student._id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{student.fullName}</td>
                  <td className="px-3 py-2">{student.rollNumber}</td>
                  <td className="px-3 py-2">{student.department}</td>
                  <td className="px-3 py-2">{student.course}</td>
                  <td className="px-3 py-2">{student.year}</td>
                  <td className="px-3 py-2">{student.email}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        type="button"
                        onClick={() => startEditing(student)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                        type="button"
                        onClick={() => deleteStudent(student._id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default StudentManager;
