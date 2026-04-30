import { useMemo, useState } from "react";
import TemplateDesigner from "../components/TemplateDesigner";
import StudentManager from "../components/StudentManager";
import CardGenerator from "../components/CardGenerator";
import { useAuth } from "../context/AuthContext";

const tabs = [
  { id: "templates", label: "Template Designer" },
  { id: "students", label: "Students & CSV" },
  { id: "generator", label: "Generate Cards" },
];

const DashboardPage = () => {
  const { admin, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("templates");
  const [refreshKey, setRefreshKey] = useState(0);

  const activeContent = useMemo(() => {
    if (activeTab === "templates") {
      return (
        <TemplateDesigner
          onTemplateSaved={() => {
            setRefreshKey((prev) => prev + 1);
            setActiveTab("generator");
          }}
        />
      );
    }

    if (activeTab === "students") {
      return <StudentManager onStudentsChanged={() => setRefreshKey((prev) => prev + 1)} />;
    }

    return <CardGenerator refreshKey={refreshKey} />;
  }, [activeTab, refreshKey]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1450px] flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">College Admin Dashboard</p>
            <h1 className="text-2xl font-semibold text-slate-900">ID Card Generator</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
              {admin?.name || "Admin"}
            </span>
            <button
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              type="button"
              onClick={logout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1450px] p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-ink text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeContent}
      </main>
    </div>
  );
};

export default DashboardPage;
