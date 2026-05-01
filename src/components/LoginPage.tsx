import React, { useState, useEffect } from 'react';
import { Search, Lock, User as UserIcon, AlertCircle, Loader2, Aperture } from 'lucide-react';
import { UserSession, UserAccount } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';

interface LoginPageProps {
  onLogin: (session: UserSession) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserAccount)));
      setLoadingUsers(false);
    }, (err) => {
      console.warn("Failed to fetch users, might be using empty DB", err);
      setLoadingUsers(false);
    });
    return unsub;
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const user = users.find(u => u.id === username);
    
    if (user && user.password === password) {
      // Fire and forget auth attempt - Firestore rules are now relaxed
      signInAnonymously(auth).catch(err => console.error('Silent Auth Error:', err));
      
      const session: UserSession = {
        username: user.id,
        email: user.email || '',
        role: user.role,
        displayName: user.displayName
      };
      localStorage.setItem('neotrace_session', JSON.stringify(session));
      setIsLoading(false);
      onLogin(session);
    } else if (users.length === 0 && username === password && (username === 'Admin' || username === 'Prod' || username === 'QC')) {
      // Fallback for initial seeding
      signInAnonymously(auth).catch(err => console.error('Silent Auth Error:', err));
      const session: UserSession = {
        username,
        email: `${username.toLowerCase()}@local.dev`,
        role: username as any,
        displayName: `${username} fallback`
      };
      localStorage.setItem('neotrace_session', JSON.stringify(session));
      setIsLoading(false);
      onLogin(session);
    } else {
      setError('Invalid username or password');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-zinc-900 text-white shadow-xl mb-6 transform -rotate-6 overflow-hidden">
            <Aperture className="w-10 h-10 animate-pulse text-white" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 mb-2">Tracello-R</h1>
          <p className="text-zinc-500 font-medium">Inspection & Traceability Platform</p>
        </div>

        <div className="bg-white p-10 rounded-3xl border border-zinc-200 shadow-xl shadow-zinc-200/50">
          <div className="mb-8">
            <h2 className="text-xl font-bold text-zinc-900 mb-1">Station Login</h2>
            <p className="text-zinc-500 text-sm">Select role and enter station credentials</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="label">Department / Role</label>
              <div className="relative">
                {loadingUsers ? (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 animate-spin" size={16} />
                ) : (
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                )}
                <select 
                  className="input pl-10"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loadingUsers}
                  required
                >
                  <option value="">{loadingUsers ? 'Loading Users...' : 'Select Dept...'}</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.displayName} ({u.id})</option>
                  ))}
                  {users.length === 0 && !loadingUsers && (
                    <>
                      <option value="Admin">System Admin (Default)</option>
                      <option value="Prod">Production (Default)</option>
                      <option value="QC">QC (Default)</option>
                    </>
                  )}
                </select>
              </div>
              {users.length === 0 && !loadingUsers && (
                <p className="mt-2 text-[10px] text-zinc-400 italic">No cloud users found. Use "Admin/Admin" to setup the database.</p>
              )}
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <input 
                  type="password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-10"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-bold">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <button 
              type="submit"
              className="w-full h-12 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 mt-4 shadow-lg shadow-zinc-900/10"
            >
              Access Station
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-zinc-100 italic text-center">
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
              Authorized personnel only
            </p>
          </div>
        </div>

        <p className="text-center mt-10 text-zinc-400 text-xs font-medium tracking-widest uppercase">
          Traceability Engine v4.2
        </p>
      </div>
    </div>
  );
}
