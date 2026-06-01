import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { LeadDiscoveryPage } from "./pages/LeadDiscoveryPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { PipelinePage } from "./pages/PipelinePage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { ApprovalQueuePage } from "./pages/ApprovalQueuePage";
import { AuditTrailPage } from "./pages/AuditTrailPage";

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/discover" element={<LeadDiscoveryPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/conversations" element={<ConversationsPage />} />
        <Route path="/approval" element={<ApprovalQueuePage />} />
        <Route path="/audit" element={<AuditTrailPage />} />
      </Route>
    </Routes>
  );
}

export default App;
