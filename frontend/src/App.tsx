import { Routes, Route, Navigate } from "react-router-dom";
import { PrivateLayout } from "./components/PrivateLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LeadDiscoveryPage } from "./pages/LeadDiscoveryPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { PipelinePage } from "./pages/PipelinePage";
import { ConversationsPage } from "./pages/ConversationsPage";
import { ApprovalQueuePage } from "./pages/ApprovalQueuePage";
import { AuditTrailPage } from "./pages/AuditTrailPage";
import { DevDashboardPage } from "./pages/DevDashboardPage";
import { CommandCenterPage } from "./pages/CommandCenterPage";
import { PipelineLineagePage } from "./pages/PipelineLineagePage";
import { PromptVersionsPage } from "./pages/PromptVersionsPage";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<PrivateLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/discover" element={<LeadDiscoveryPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/conversations" element={<ConversationsPage />} />
        <Route path="/approval" element={<ApprovalQueuePage />} />
        <Route path="/audit" element={<AuditTrailPage />} />
        <Route path="/dev" element={<DevDashboardPage />} />
        <Route path="/command-center" element={<CommandCenterPage />} />
        <Route path="/lineage" element={<PipelineLineagePage />} />
        <Route path="/prompt-versions" element={<PromptVersionsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
