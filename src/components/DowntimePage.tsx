import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { DowntimeRecord, UserSession } from '../types';
import { Clock, AlertTriangle, Users, Calendar, Trash2, CheckCircle2, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

interface DowntimePageProps {
  user: UserSession;
}

export default function DowntimePage({ user }: DowntimePageProps) {
  const [records, setRecords] = useState<DowntimeRecord[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState({
    hourInterval: '',
    duration: '',
    category: 'Mechanical',
    reason: '',
    maintenancePersonnel: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'downtime'), orderBy('timestamp', 'desc'), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as DowntimeRecord)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'downtime');
    });
    return unsub;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'downtime'), {
        ...form,
        duration: Number(form.duration),
        operator: user.displayName,
        timestamp: Date.now()
      });
      setIsFormOpen(false);
      setForm({ hourInterval: '', duration: '', category: 'Mechanical', reason: '', maintenancePersonnel: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'downtime');
    }
  };

  const deleteRecord = async (id: string) => {
    if (!confirm('Delete this downtime entry?')) return;
    try {
      await deleteDoc(doc(db, 'downtime', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'downtime');
    }
  };

  const categories = ['Mechanical', 'Electrical', 'Tooling', 'Material', 'Utility', 'Other'];

  const hourIntervals = [
    "00:00 - 01:00", "01:00 - 02:00", "02:00 - 03:00", "03:00 - 04:00",
    "04:00 - 05:00", "05:00 - 06:00", "06:00 - 07:00", "07:00 - 08:00",
    "08:00 - 09:00", "09:00 - 10:00", "10:00 - 11:00", "11:00 - 12:00",
    "12:00 - 13:00", "13:00 - 14:00", "14:00 - 15:00", "15:00 - 16:00",
    "16:00 - 17:00", "17:00 - 18:00", "18:00 - 19:00", "19:00 - 20:00",
    "20:00 - 21:00", "21:00 - 22:00", "22:00 - 23:00", "23:00 - 00:00"
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Downtime Tracker</h1>
          <p className="text-zinc-500 text-sm">Monitor and record production interruptions</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="btn btn-primary px-6"
        >
          <Plus size={18} />
          Log Downtime
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/50">
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Time / Operator</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Interval</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Duration</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Reason</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Support</th>
                    <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {records.map(record => (
                    <tr key={record.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-[10px] font-black text-zinc-400 mb-1">{format(record.timestamp, 'MMM dd, HH:mm')}</div>
                        <div className="text-xs font-bold text-zinc-900">{record.operator}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-mono text-zinc-600 bg-zinc-100 px-2 py-1 rounded-md w-fit">
                          <Clock size={12} />
                          {record.hourInterval}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                          record.category === 'Mechanical' ? "bg-blue-50 text-blue-600 border border-blue-100" :
                          record.category === 'Electrical' ? "bg-amber-50 text-amber-600 border border-amber-100" :
                          record.category === 'Material' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
                          "bg-zinc-100 text-zinc-600 border border-zinc-200"
                        )}>
                          {record.category}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-black text-red-600 bg-red-50 border border-red-100 px-2 py-1 rounded-md w-fit">
                          {record.duration} min
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-900">
                          <AlertTriangle size={14} className="text-amber-500" />
                          {record.reason}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <Users size={14} />
                          {record.maintenancePersonnel || 'None'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {user.role === 'Admin' && (
                          <button 
                            onClick={() => deleteRecord(record.id)}
                            className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-zinc-400">
                        <Calendar size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-sm italic">No downtime records found for this period.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-6 bg-zinc-900 text-white">
            <h3 className="text-sm font-black uppercase tracking-widest opacity-50 mb-4">Tracking Protocol</h3>
            <ul className="text-xs space-y-3 font-medium">
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] shrink-0">1</span>
                <span>Record downtime at the end of every operational hour.</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] shrink-0">2</span>
                <span>Specify the exact reason (Mechanical, Electrical, Raw Material, etc).</span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] shrink-0">3</span>
                <span>Tag any maintenance personnel that supported the recovery.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setIsFormOpen(false)} />
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="p-6 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-xl font-black text-zinc-900">Record Hourly Downtime</h3>
              <button onClick={() => setIsFormOpen(false)} className="text-zinc-400 hover:text-zinc-900">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div>
                <label className="label">Hour Interval</label>
                <div className="relative">
                  <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <select 
                    className="input pl-10"
                    value={form.hourInterval}
                    onChange={(e) => setForm({...form, hourInterval: e.target.value})}
                    required
                  >
                    <option value="">Select Interval...</option>
                    {hourIntervals.map(interval => (
                      <option key={interval} value={interval}>{interval}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Category</label>
                <div className="relative">
                  <AlertTriangle size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <select 
                    className="input pl-10"
                    value={form.category}
                    onChange={(e) => setForm({...form, category: e.target.value as any})}
                    required
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Duration (Minutes)</label>
                <div className="relative">
                  <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input 
                    type="number"
                    className="input pl-10"
                    value={form.duration}
                    onChange={(e) => setForm({...form, duration: e.target.value})}
                    placeholder="e.g. 15"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Downtime Reason</label>
                <div className="relative">
                  <AlertTriangle size={16} className="absolute left-3 top-3 text-zinc-400" />
                  <textarea 
                    className="input pl-10 min-h-[100px] py-2"
                    value={form.reason}
                    onChange={(e) => setForm({...form, reason: e.target.value})}
                    placeholder="Describe the issue..."
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Maintenance Personnel (Optional)</label>
                <div className="relative">
                  <Users size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input 
                    type="text"
                    className="input pl-10"
                    value={form.maintenancePersonnel}
                    onChange={(e) => setForm({...form, maintenancePersonnel: e.target.value})}
                    placeholder="Name of technician"
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsFormOpen(false)} className="btn btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn btn-primary flex-1">
                  <CheckCircle2 size={18} />
                  Submit Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
