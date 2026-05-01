import React, { useState, useEffect } from 'react';
import { Settings, ShieldAlert, Database, Trash2, Key, Info, LayoutTemplate, Link as LinkIcon, Save, CheckCircle2, Search, FileEdit, Users, UserPlus, Shield, Mail, Lock, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, deleteDoc, doc, getDocs, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Product, InspectionRecord, UserAccount } from '../types';
import { cn, generateId } from '../lib/utils';
import { format } from 'date-fns';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'settings' | 'records' | 'products' | 'users'>('settings');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // States
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [userAccounts, setUserAccounts] = useState<UserAccount[]>([]);
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  const [userForm, setUserForm] = useState({
    id: '',
    password: '',
    role: 'Production' as UserAccount['role'],
    displayName: '',
    email: ''
  });

  useEffect(() => {
    const unsubR = onSnapshot(collection(db, 'inspections'), (snap) => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as InspectionRecord)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inspections');
    });
    const unsubP = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });
    const unsubU = onSnapshot(collection(db, 'users'), (snap) => {
      setUserAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserAccount)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    
    // Load existing webhook
    const loadSettings = async () => {
      try {
        const snap = await getDocs(collection(db, 'settings'));
        const config = snap.docs.find(d => d.id === 'config');
        if (config) setWebhookUrl(config.data().sheetWebhookUrl || '');
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'settings');
      }
    };
    loadSettings();

    return () => {
      unsubR();
      unsubP();
    };
  }, []);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'config'), { sheetWebhookUrl: webhookUrl }, { merge: true });
      alert('Settings persistent.');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/config');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRecord = async (id: string, coll: string) => {
    if (!confirm('Permanently delete this record?')) return;
    try {
      await deleteDoc(doc(db, coll, id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, coll);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userData: any = {
        password: userForm.password,
        role: userForm.role,
        displayName: userForm.displayName,
      };

      if (userForm.email) {
        userData.email = userForm.email;
      }

      if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.id), userData);
      } else {
        await setDoc(doc(db, 'users', userForm.id), userData);
      }
      
      setIsUserFormOpen(false);
      setEditingUser(null);
      setUserForm({ id: '', password: '', role: 'Production', displayName: '', email: '' });
    } catch (error) {
      handleFirestoreError(error, editingUser ? OperationType.UPDATE : OperationType.CREATE, `users/${editingUser ? editingUser.id : userForm.id}`);
    }
  };

  const editUserAccount = (user: UserAccount) => {
    setEditingUser(user);
    setUserForm({
      id: user.id,
      password: user.password,
      role: user.role,
      displayName: user.displayName,
      email: user.email
    });
    setIsUserFormOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-zinc-900 flex items-center gap-3">
            <Settings className="text-zinc-400" size={32} />
            Control Center
          </h1>
          <p className="text-zinc-500 font-medium">Enterprise administration & sync management</p>
        </div>
        
        <div className="flex bg-zinc-100 p-1.5 rounded-2xl">
          <button 
            onClick={() => setActiveTab('settings')}
            className={cn(
              "px-6 py-2.5 rounded-xl font-black text-sm transition-all",
              activeTab === 'settings' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            Config
          </button>
          <button 
            onClick={() => setActiveTab('records')}
            className={cn(
              "px-6 py-2.5 rounded-xl font-black text-sm transition-all",
              activeTab === 'records' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            Records
          </button>
          <button 
            onClick={() => setActiveTab('products')}
            className={cn(
              "px-6 py-2.5 rounded-xl font-black text-sm transition-all",
              activeTab === 'products' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            Products
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={cn(
              "px-6 py-2.5 rounded-xl font-black text-sm transition-all",
              activeTab === 'users' ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-400 hover:text-zinc-600"
            )}
          >
            Users
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {activeTab === 'settings' && (
            <div className="card p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-zinc-100 text-zinc-900 rounded-xl flex items-center justify-center">
                  <LinkIcon size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-zinc-900">Google Sheets Integration</h3>
                  <p className="text-sm text-zinc-500">Live sync records to remote spreadsheets</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="label">Apps Script Webhook URL</label>
                  <div className="relative group">
                    <input 
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      className="input font-mono text-sm pr-20"
                      placeholder="https://script.google.com/macros/s/.../exec"
                    />
                    <button 
                      onClick={saveSettings}
                      disabled={isSaving}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-1.5 bg-zinc-900 text-white text-[10px] font-black uppercase rounded-lg hover:bg-zinc-800 transition-all"
                    >
                      {isSaving ? 'Saving...' : 'Link'}
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-zinc-400 flex items-center gap-2">
                    <Info size={14} />
                    Incoming entries will be POSTed to this endpoint automatically.
                  </p>
                </div>

                <div className="pt-8 border-t border-zinc-100 space-y-4">
                  <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Advanced Actions</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-zinc-900">Name Sync</p>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">NB/NF/NEO → FG-A/B/C</p>
                      </div>
                      <button 
                        className="px-4 py-2 bg-zinc-900 text-white text-xs font-black uppercase rounded-lg transition-all hover:scale-105"
                        onClick={async () => {
                          if (!confirm('Rename existing report templates (NB, NF, NEOSTAND) and matching products to FG-A/B/C?')) return;
                          try {
                            const templateMap: Record<string, string> = { 
                              'NF': 'FG_Product-A', 
                              'NB': 'FG_Product-B', 
                              'NEOSTAND': 'FG_Product-C' 
                            };
                            const productMap: Record<string, string> = {
                              'NeoFly': 'FG_Product-A',
                              'NeoBolt': 'FG_Product-B',
                              'NeoStand': 'FG_Product-C'
                            };

                            const tSnap = await getDocs(collection(db, 'qc_templates'));
                            for (const [oldId, newId] of Object.entries(templateMap)) {
                              const target = tSnap.docs.find(d => d.id === oldId);
                              if (target) {
                                await setDoc(doc(db, 'qc_templates', newId), { ...target.data(), name: newId });
                                await deleteDoc(doc(db, 'qc_templates', oldId));
                              }
                            }

                            const pSnap = await getDocs(collection(db, 'products'));
                            for (const pDoc of pSnap.docs) {
                              const data = pDoc.data();
                              const updates: any = {};
                              if (data.qcTemplate && templateMap[data.qcTemplate]) updates.qcTemplate = templateMap[data.qcTemplate];
                              if (productMap[data.name]) updates.name = productMap[data.name];
                              if (Object.keys(updates).length > 0) await updateDoc(doc(db, 'products', pDoc.id), updates);
                            }

                            // 3. Update Existing Inspection Records
                            const iSnap = await getDocs(collection(db, 'inspections'));
                            for (const iDoc of iSnap.docs) {
                              const data = iDoc.data();
                              if (productMap[data.productName]) {
                                await updateDoc(doc(db, 'inspections', iDoc.id), { productName: productMap[data.productName] });
                              }
                            }

                            // 4. Update Existing QC Reports
                            const qSnap = await getDocs(collection(db, 'qc_reports'));
                            for (const qDoc of qSnap.docs) {
                              const data = qDoc.data();
                              if (templateMap[data.template]) {
                                await updateDoc(doc(db, 'qc_reports', qDoc.id), { template: templateMap[data.template] });
                              }
                            }

                            alert('Naming fully synchronized across all database collections.');
                          } catch (e) {
                            handleFirestoreError(e, OperationType.UPDATE, 'migration');
                          }
                        }}
                      >
                        Sync Names
                      </button>
                    </div>
                    <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-between">
                      <div>
                        <p className="text-sm font-black text-red-900">Purge Logs</p>
                        <p className="text-[10px] text-red-700 font-bold uppercase tracking-wider">Wipe All Records</p>
                      </div>
                      <button 
                        className="btn btn-danger px-4 py-2 text-xs"
                        onClick={async () => {
                          if (confirm('Delete ALL inspections?')) {
                            const snap = await getDocs(collection(db, 'inspections'));
                            await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'inspections', d.id))));
                            alert('Database wiped.');
                          }
                        }}
                      >
                        Purge
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'records' && (
            <div className="card overflow-hidden">
              <div className="p-6 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between">
                <h3 className="text-sm font-black text-zinc-900 uppercase tracking-widest">Active Inspection Records</h3>
                <span className="text-[10px] font-black px-3 py-1 bg-zinc-900 text-white rounded-full uppercase tracking-wider">{records.length} Total</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Record</th>
                      <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Serial</th>
                      <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Inspector</th>
                      <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-mono">
                    {records.sort((a, b) => b.timestamp - a.timestamp).map(r => (
                      <tr key={r.id} className="hover:bg-zinc-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-xs font-black text-zinc-900 uppercase">{r.productName}</div>
                          <div className="text-[10px] text-zinc-400">Order: {r.orderNo}</div>
                        </td>
                        <td className="px-6 py-4 text-xs font-black text-zinc-600">{r.frameNo}</td>
                        <td className="px-6 py-4 text-xs font-medium text-zinc-400">{r.inspector}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                             <button onClick={() => deleteRecord(r.id, 'inspections')} className="p-2 hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-lg transition-all">
                               <Trash2 size={16} />
                             </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'products' && (
            <div className="card p-8 text-center text-zinc-400 italic">
               <LayoutTemplate size={48} className="mx-auto mb-4 opacity-20" />
               <p>Master Data Management is currently integrated within the <br /> <strong>Components Tab</strong> in the sidebar.</p>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-zinc-900 uppercase tracking-widest">System Access Control</h3>
                <button 
                  onClick={() => {
                    setEditingUser(null);
                    setUserForm({ id: '', password: '', role: 'Production', displayName: '', email: '' });
                    setIsUserFormOpen(true);
                  }}
                  className="btn btn-primary px-4 py-2 text-xs"
                >
                  <UserPlus size={14} />
                  Add New User
                </button>
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-zinc-100">
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">User / Access</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Role</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Email</th>
                        <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {userAccounts.map(u => (
                        <tr key={u.id} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-black text-xs">
                                {u.role.charAt(0)}
                              </div>
                              <div>
                                <div className="text-xs font-black text-zinc-900 uppercase">{u.displayName}</div>
                                <div className="text-[10px] text-zinc-400 font-mono">ID: {u.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                              u.role === 'Admin' ? "bg-red-50 text-red-600" :
                              u.role === 'QC' ? "bg-amber-50 text-amber-600" :
                              "bg-emerald-50 text-emerald-600"
                            )}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-zinc-500">{u.email}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                               <button 
                                 onClick={() => editUserAccount(u)}
                                 className="p-2 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 rounded-lg transition-all"
                               >
                                 <FileEdit size={16} />
                               </button>
                               <button 
                                 onClick={() => deleteRecord(u.id, 'users')} 
                                 className="p-2 hover:bg-red-50 text-zinc-300 hover:text-red-500 rounded-lg transition-all"
                               >
                                 <Trash2 size={16} />
                               </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {userAccounts.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-20 text-center text-zinc-400 italic">
                            <Users size={48} className="mx-auto mb-4 opacity-20" />
                            <p>No user accounts defined in Firestore.</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Seed Helper */}
              {userAccounts.length === 0 && (
                <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Database className="text-zinc-400" size={20} />
                    <div>
                      <p className="text-xs font-black text-zinc-900">Database Synchronization</p>
                      <p className="text-[10px] text-zinc-500">Migrate hardcoded credentials to Firestore</p>
                    </div>
                  </div>
                  <button 
                    onClick={async () => {
                      const defaults = [
                        { id: 'Prod', password: 'Prod', role: 'Production' as const, displayName: 'Production Team' },
                        { id: 'QC', password: 'QC', role: 'QC' as const, displayName: 'Quality Department' },
                        { id: 'Admin', password: 'Admin', role: 'Admin' as const, displayName: 'System Admin' },
                      ];
                      for (const u of defaults) {
                        const { id, ...data } = u;
                        await setDoc(doc(db, 'users', id), data);
                      }
                      alert('Users migrated.');
                    }}
                    className="px-4 py-2 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-lg"
                  >
                    Seed Cloud Users
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Form Modal */}
        {isUserFormOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setIsUserFormOpen(false)} />
            <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-xl font-black text-zinc-900">{editingUser ? 'Update Account' : 'Provision New Account'}</h3>
                <button onClick={() => setIsUserFormOpen(false)} className="text-zinc-400 hover:text-zinc-900">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleSaveUser} className="p-8 space-y-4">
                <div>
                  <label className="label">Login ID (Username)</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                    <input 
                      type="text"
                      disabled={!!editingUser}
                      value={userForm.id}
                      onChange={(e) => setUserForm({...userForm, id: e.target.value})}
                      className="input pl-10 disabled:bg-zinc-50 disabled:text-zinc-400"
                      placeholder="e.g. InspectorA"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                    <input 
                      type="text"
                      value={userForm.password}
                      onChange={(e) => setUserForm({...userForm, password: e.target.value})}
                      className="input pl-10"
                      placeholder="Security code"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Display Name</label>
                  <input 
                    type="text"
                    value={userForm.displayName}
                    onChange={(e) => setUserForm({...userForm, displayName: e.target.value})}
                    className="input"
                    placeholder="Full Name"
                    required
                  />
                </div>
                <div>
                  <label className="label">Functional Role</label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                    <select 
                      className="input pl-10"
                      value={userForm.role}
                      onChange={(e) => setUserForm({...userForm, role: e.target.value as any})}
                      required
                    >
                      <option value="Production">Production</option>
                      <option value="QC">Quality Control (QC)</option>
                      <option value="Admin">Administrator</option>
                      <option value="Other">External Partner</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">System Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                    <input 
                      type="email"
                      value={userForm.email}
                      onChange={(e) => setUserForm({...userForm, email: e.target.value})}
                      className="input pl-10"
                      placeholder="name@company.com (Optional)"
                    />
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setIsUserFormOpen(false)} className="btn btn-secondary flex-1">Abort</button>
                  <button type="submit" className="btn btn-primary flex-1">
                    <CheckCircle2 size={18} />
                    {editingUser ? 'Save Changes' : 'Provision User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="card p-6 bg-zinc-900 text-white group overflow-hidden relative">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-zinc-800 rounded-full blur-3xl group-hover:scale-125 transition-transform duration-700" />
            <h3 className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em] mb-6">Engine Health</h3>
            <div className="space-y-6 relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-black">Connected</p>
                  <p className="text-xs font-bold text-zinc-500 uppercase mt-1">Firebase Persistence Layer</p>
                </div>
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center animate-pulse">
                  <CheckCircle2 size={24} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-white/5 rounded-2xl">
                  <p className="text-[10px] font-bold opacity-40 uppercase tracking-wider mb-1">Latency</p>
                  <p className="text-lg font-black italic">±14ms</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl">
                  <p className="text-[10px] font-bold opacity-40 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-lg font-black text-emerald-400 italic">LIVE</p>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-8">
            <h3 className="text-sm font-black text-zinc-900 mb-6 flex items-center gap-2">
              <ShieldAlert size={18} className="text-zinc-400" />
              Environment Specs
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Version</span>
                <span className="text-xs font-mono font-black text-zinc-900">v4.3.2-LTS</span>
              </div>
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Region</span>
                <span className="text-xs font-mono font-black text-zinc-900">SG-1</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Build ID</span>
                <span className="text-xs font-mono font-black text-zinc-900 truncate ml-4">XT3WS7AHCV...</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
