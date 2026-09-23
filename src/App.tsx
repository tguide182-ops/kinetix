import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { QueueDrawer } from './components/layout/QueueDrawer';
import { CreateWorkspace } from './components/create/CreateWorkspace';
import { FlowCanvas } from './components/flow/FlowCanvas';
import { SequenceBuilder } from './components/sequence/SequenceBuilder';
import { MediaLibrary } from './components/assets/MediaLibrary';
import { MediaViewerModal } from './components/assets/MediaViewerModal';
import { BatchMatrixView } from './components/batch/BatchMatrixView';
import { ProjectsView } from './components/projects/ProjectsView';
import { SettingsView } from './components/settings/SettingsView';
import { HomeView } from './components/home/HomeView';

const AppShell: React.FC = () => {
  const { activeNav, toastMessage } = useApp();

  const renderActiveView = () => {
    switch (activeNav) {
      case 'home':
        return <HomeView />;
      case 'create':
      case 'generations':
        return <CreateWorkspace />;
      case 'flow':
        return <FlowCanvas />;
      case 'sequences':
        return <SequenceBuilder />;
      case 'assets':
        return <MediaLibrary favoritesOnly={false} />;
      case 'favorites':
        return <MediaLibrary favoritesOnly={true} />;
      case 'batch':
        return <BatchMatrixView />;
      case 'projects':
        return <ProjectsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <CreateWorkspace />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Primary Left Navigation Sidebar */}
      <Sidebar />

      {/* Main Studio Viewport */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-zinc-950">
        <Header />
        <main className="flex-1 flex overflow-hidden relative">
          {renderActiveView()}
        </main>
      </div>

      {/* Slide-out Background Generation Queue Drawer */}
      <QueueDrawer />

      {/* Fullscreen Master Media Inspector & Player Modal */}
      <MediaViewerModal />

      {/* Studio Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-100 text-xs font-medium shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
