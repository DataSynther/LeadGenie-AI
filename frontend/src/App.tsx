import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { PrivateLayout } from "./components/PrivateLayout";
import { PipelineToast } from "./components/PipelineToast";
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
import { WhatsAppInboxPage } from "./pages/WhatsAppInboxPage";
import { FinOpsDashboardPage } from "./pages/FinOpsDashboardPage";
import { ArchitecturePage } from "./pages/ArchitecturePage";
import { KbFactsPage } from "./pages/KbFactsPage";
import { QuidditchPage } from "./pages/QuidditchPage";
import { GovernanceDashboardPage } from "./pages/GovernanceDashboardPage";

function App() {
  return (
    <>
    <PipelineToast />
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
        <Route path="/audit/:leadId" element={<AuditTrailPage />} />
        <Route path="/dev" element={<DevDashboardPage />} />
        <Route path="/command-center" element={<CommandCenterPage />} />
        <Route path="/lineage" element={<PipelineLineagePage />} />
        <Route path="/prompt-versions" element={<PromptVersionsPage />} />
        <Route path="/whatsapp" element={<WhatsAppInboxPage />} />
        <Route path="/finops" element={<FinOpsDashboardPage />} />
        <Route path="/architecture" element={<ArchitecturePage />} />
        <Route path="/kb-facts" element={<KbFactsPage />} />
        <Route path="/quidditch" element={<QuidditchPage />} />
        <Route path="/governance" element={<GovernanceDashboardPage />} />
      </Route>
    </Routes>
    </>
  );
}

export default App;
