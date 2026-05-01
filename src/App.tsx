import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  ClipboardCheck, 
  LayoutDashboard, 
  Package, 
  Printer, 
  FileSearch, 
  Settings, 
  History, 
  ShieldCheck, 
  Clock,
  LogOut,
  Menu,
  X,
  User,
  Search,
  Aperture
} from 'lucide-react';
import { db, auth } from './lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { cn } from './lib/utils';
import { UserSession } from './types';

// Pages
import DashboardPage from './components/DashboardPage';
import ProductsPage from './components/ProductsPage';
import EntryPage from './components/EntryPage';
import PrintsPage from './components/PrintsPage';
import RecordsPage from './components/RecordsPage';
import QCReportsPage from './components/QCReportsPage';
import ReportsPage from './components/ReportsPage';
import AdminPage from './components/AdminPage';
import LoginPage from './components/LoginPage';
import DowntimePage from './components/DowntimePage';

type Page = 'dashboard' | 'products' | 'entry' | 'reports' | 'records' | 'prints' | 'qc' | 'admin' | 'downtime';

export default function App() {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const initSession = async () => {
      const savedUser = localStorage.getItem('neotrace_session');
      if (savedUser) {
        // Attempt silent re-auth
        signInAnonymously(auth).catch(err => console.error("Silent restoration failed:", err));
        setUser(JSON.parse(savedUser));
      }
      setLoading(false);
    };

    initSession();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('neotrace_session');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-zinc-900 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-zinc-600 font-medium">Initializing Tracello-R...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={(session) => setUser(session)} />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'entry', label: 'Entry', icon: ClipboardCheck },
    { id: 'downtime', label: 'Downtime', icon: Clock },
    { id: 'records', label: 'Records', icon: History },
    { id: 'reports', label: 'Reports', icon: FileSearch },
    { id: 'qc', label: 'QC Reports', icon: ShieldCheck },
    { id: 'prints', label: 'Prints', icon: Printer },
    { id: 'admin', label: 'Admin', icon: Settings },
  ].filter(item => {
    if (user.role === 'Production' && ['admin', 'products', 'reports'].includes(item.id)) return false;
    if (user.role === 'QC' && ['admin', 'products', 'downtime'].includes(item.id)) return false;
    return true;
  });

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <DashboardPage />;
      case 'products': return <ProductsPage user={user} />;
      case 'entry': return <EntryPage user={user} />;
      case 'records': return <RecordsPage user={user} />;
      case 'reports': return <ReportsPage />;
      case 'qc': return <QCReportsPage user={user} />;
      case 'prints': return <PrintsPage user={user} />;
      case 'admin': return <AdminPage />;
      case 'downtime': return <DowntimePage user={user} />;
      default: return <DashboardPage />;
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-50">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-zinc-200 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          {/* Logo */}
          <div className="p-6 border-b border-zinc-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center overflow-hidden shadow-lg shadow-zinc-900/20">
                <Aperture className="text-white w-6 h-6 animate-pulse" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">Tracello-R</h1>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActivePage(item.id as Page);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    activePage === item.id 
                      ? "bg-zinc-900 text-white" 
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* User Profile / Logout */}
          <div className="p-4 border-t border-zinc-100">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center overflow-hidden font-bold">
                {user.role.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 truncate">{user.displayName}</p>
                <button 
                  onClick={handleLogout}
                  className="text-xs text-zinc-500 hover:text-red-500 flex items-center gap-1 mt-0.5"
                >
                  <LogOut size={12} />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-zinc-200 flex items-center px-4 lg:px-8">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 text-zinc-600"
          >
            <Menu size={24} />
          </button>
          
          <div className="flex-1 px-4 lg:px-0">
            <h2 className="text-lg font-semibold text-zinc-900 capitalize">
              {activePage.replace('-', ' ')}
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <p className="text-xs font-medium text-zinc-500">System Status</p>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <p className="text-xs font-bold text-emerald-600">ONLINE</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {renderPage()}
          </div>
        </main>
      </div>
    </div>
  );
}
