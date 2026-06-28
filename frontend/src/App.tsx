import { Routes, Route, Navigate } from "react-router-dom";
import { PrivateLayout } from "./components/PrivateLayout";
import { RoleGuard } from "./components/RoleGuard";
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
import { LeadNetworkPage } from "./pages/LeadNetworkPage";

function G({ children }: { children: React.ReactNode }) {
  return <RoleGuard>{children}</RoleGuard>;
}

function App() {
  return (
    <>
      <PipelineToast />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<PrivateLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"       element={<G><DashboardPage /></G>} />
          <Route path="/discover"        element={<G><LeadDiscoveryPage /></G>} />
          <Route path="/campaigns"       element={<G><CampaignsPage /></G>} />
          <Route path="/pipeline"        element={<G><PipelinePage /></G>} />
          <Route path="/conversations"   element={<G><ConversationsPage /></G>} />
          <Route path="/approval"        element={<G><ApprovalQueuePage /></G>} />
          <Route path="/audit"           element={<G><AuditTrailPage /></G>} />
          <Route path="/audit/:leadId"   element={<G><AuditTrailPage /></G>} />
          <Route path="/dev"             element={<G><DevDashboardPage /></G>} />
          <Route path="/command-center"  element={<G><CommandCenterPage /></G>} />
          <Route path="/lineage"         element={<G><PipelineLineagePage /></G>} />
          <Route path="/prompt-versions" element={<G><PromptVersionsPage /></G>} />
          <Route path="/whatsapp"        element={<G><WhatsAppInboxPage /></G>} />
          <Route path="/finops"          element={<G><FinOpsDashboardPage /></G>} />
          <Route path="/architecture"    element={<G><ArchitecturePage /></G>} />
          <Route path="/kb-facts"        element={<G><KbFactsPage /></G>} />
          <Route path="/quidditch"       element={<G><QuidditchPage /></G>} />
          <Route path="/governance"      element={<G><GovernanceDashboardPage /></G>} />
          <Route path="/network"         element={<G><LeadNetworkPage /></G>} />
        </Route>
      </Routes>
    </>
  );
}

export default App;
