import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, syncToGoogleSheet } from '../lib/firebase';
import { collection, onSnapshot, addDoc, doc, setDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { QCReport, QCSection, UserSession, QCItem, QCTemplate, InspectionRecord, Product } from '../types';
import { ShieldCheck, FileCheck2, ClipboardList, CheckCircle2, AlertCircle, XCircle, Search, Plus, Trash2, Save, Kanban, Layout, ListChecks, History } from 'lucide-react';
import { cn, generateId } from '../lib/utils';
import { format } from 'date-fns';

const FALLBACK_TEMPLATES: Record<string, QCSection[]> = {};

interface QCReportsPageProps {
  user: UserSession;
}

export default function QCReportsPage({ user }: QCReportsPageProps) {
  const [activeTab, setActiveTab] = useState<'kanban' | 'form' | 'history'>('kanban');
  const [templateKey, setTemplateKey] = useState<string>('');
  const [masterTemplates, setMasterTemplates] = useState<Record<string, QCTemplate>>({});
  const [currentTime, setCurrentTime] = useState(new Date());
  const [productionRecords, setProductionRecords] = useState<InspectionRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({
    orderNo: '',
    frameNo: '',
    customerName: '',
    date: new Date().toISOString().split('T')[0],
  });
  const [sections, setSections] = useState<QCSection[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const canManageCriteria = user.role === 'Admin' || user.role === 'QC';

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    // Fetch production records for Kanban
    const qInspections = query(collection(db, 'inspections'), orderBy('timestamp', 'desc'));
    const unsubInspections = onSnapshot(qInspections, (snap) => {
      setProductionRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as InspectionRecord)));
    });

    // Fetch QC templates
    const unsubTemplates = onSnapshot(collection(db, 'qc_templates'), (snap) => {
      const temps: Record<string, QCTemplate> = {};
      snap.docs.forEach(doc => {
        temps[doc.id] = { id: doc.id, ...doc.data() } as QCTemplate;
      });
      setMasterTemplates(temps);
      setLoadingTemplates(false);
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    return () => {
      clearInterval(timer);
      unsubInspections();
      unsubTemplates();
      unsubProducts();
    };
  }, []);

  useEffect(() => {
    if (!templateKey) {
      setSections([]);
      return;
    }

    if (masterTemplates[templateKey]) {
      setSections(JSON.parse(JSON.stringify(masterTemplates[templateKey].sections)));
    } else {
      setSections([]);
    }
  }, [templateKey, masterTemplates, loadingTemplates]);

  const syncTemplate = async (newSections: QCSection[]) => {
    if (!canManageCriteria || !templateKey) return;
    try {
      await setDoc(doc(db, 'qc_templates', templateKey), {
        name: templateKey,
        sections: newSections
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `qc_templates/${templateKey}`);
    }
  };

  const addCheckpoint = (sectionIdx: number) => {
    const newSections = [...sections];
    newSections[sectionIdx].items.push({
      id: generateId(),
      text: '',
      status: 'OK'
    });
    setSections(newSections);
    syncTemplate(newSections);
  };

  const removeCheckpoint = (sectionIdx: number, itemIdx: number) => {
    const newSections = [...sections];
    newSections[sectionIdx].items.splice(itemIdx, 1);
    setSections(newSections);
    syncTemplate(newSections);
  };

  const updateItemText = (sectionIdx: number, itemIdx: number, text: string) => {
    const newSections = [...sections];
    newSections[sectionIdx].items[itemIdx].text = text;
    setSections(newSections);
  };

  const handleTextBlur = () => {
    syncTemplate(sections);
  };

  const updateItemStatus = (sectionIdx: number, itemIdx: number, status: 'OK' | 'NOK' | 'NA') => {
    const newSections = [...sections];
    newSections[sectionIdx].items[itemIdx].status = status;
    setSections(newSections);
  };

  const onDragStart = (e: React.DragEvent, record: InspectionRecord) => {
    e.dataTransfer.setData('recordId', record.id);
    e.dataTransfer.setData('currentStatus', record.qcStatus || 'Pending');
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const recordId = e.dataTransfer.getData('recordId');
    const record = productionRecords.find(r => r.id === recordId);
    
    if (record) {
      await moveKanban(record, newStatus);
    }
  };

  const moveKanban = async (record: InspectionRecord, newStatus: string) => {
    // Role checks
    if (record.qcStatus === 'Completed' && user.role === 'Production') {
      alert("Only QC team can move completed items back to workflow.");
      return;
    }

    try {
      await updateDoc(doc(db, 'inspections', record.id), { qcStatus: newStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `inspections/${record.id}`);
    }
  };

  const startQCFromKanban = async (record: InspectionRecord) => {
    const product = products.find(p => p.name === record.productName);
    const matchingTemplateKey = product?.qcTemplate || '';
    
    setForm({
      orderNo: record.orderNo,
      frameNo: record.frameNo,
      customerName: '',
      date: new Date().toISOString().split('T')[0],
    });
    setTemplateKey(matchingTemplateKey);
    setActiveTab('form');

    // Move to In Progress if it was pending
    if (!record.qcStatus || record.qcStatus === 'Pending') {
      try {
        await updateDoc(doc(db, 'inspections', record.id), { qcStatus: 'In Progress' });
      } catch (err) {
        console.warn("Failed to update status to In Progress", err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateKey) return;
    setSubmitting(true);

    try {
      const record = {
        template: templateKey,
        docId: `QC-${Date.now().toString().slice(-6)}`,
        orderNo: form.orderNo,
        frameNo: form.frameNo,
        customerName: form.customerName,
        inspector: user.displayName,
        date: form.date,
        sections,
        timestamp: Date.now()
      };

      await addDoc(collection(db, 'qc_reports'), record);
      
      // Update production record status to Completed
      const matchingRecord = productionRecords.find(r => r.frameNo === form.frameNo);
      if (matchingRecord) {
        await updateDoc(doc(db, 'inspections', matchingRecord.id), { qcStatus: 'Completed' });
      }

      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
      setTemplateKey('');
      setForm({ orderNo: '', frameNo: '', customerName: '', date: new Date().toISOString().split('T')[0] });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'qc_reports');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-zinc-900 text-white rounded-xl flex items-center justify-center shadow-lg">
            <ShieldCheck size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-zinc-900 leading-none">QC Control Board</h1>
            <p className="text-zinc-500 font-medium text-sm mt-1">Manage inspections and track verification flow</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-zinc-100 p-1 rounded-xl">
            {[
              { id: 'kanban', label: 'Kanban', icon: Layout },
              { id: 'form', label: 'QC Form', icon: ListChecks },
              { id: 'history', label: 'History', icon: History }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-xs font-black rounded-lg transition-all", 
                  activeTab === tab.id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                <tab.icon size={14} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[calc(100vh-280px)] overflow-hidden">
          {/* Pending Column */}
          <div 
            className="flex flex-col h-full"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, 'Pending')}
          >
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">QC Pending</h3>
              </div>
              <span className="bg-red-50 text-red-500 px-2 py-0.5 rounded text-[10px] font-black tracking-tighter">
                {productionRecords.filter(r => !r.qcStatus || r.qcStatus === 'Pending').length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
              {productionRecords.filter(r => !r.qcStatus || r.qcStatus === 'Pending').map(record => (
                <div 
                  key={record.id} 
                  draggable
                  onDragStart={(e) => onDragStart(e, record)}
                  onClick={() => startQCFromKanban(record)}
                  className="card p-4 hover:border-red-200 cursor-grab active:cursor-grabbing transition-all hover:bg-zinc-50/50 group"
                >
                  <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2">ORDER: {record.orderNo}</p>
                  <p className="text-sm font-black text-zinc-900 mb-1">{record.productName}</p>
                  <p className="text-[10px] font-mono font-bold text-zinc-500">{record.frameNo}</p>
                </div>
              ))}
            </div>
          </div>

          {/* In Progress Column */}
          <div 
            className="flex flex-col h-full bg-zinc-50/50 rounded-3xl p-4"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, 'In Progress')}
          >
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest text-amber-600">Work in Progress</h3>
              </div>
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-black tracking-tighter">
                {productionRecords.filter(r => r.qcStatus === 'In Progress').length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide">
              {productionRecords.filter(r => r.qcStatus === 'In Progress').map(record => (
                <div 
                  key={record.id} 
                  draggable
                  onDragStart={(e) => onDragStart(e, record)}
                  className="bg-white p-4 rounded-2xl border border-amber-100 shadow-sm hover:border-amber-300 cursor-grab active:cursor-grabbing transition-all relative group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">SCANNING ACTIVE</p>
                    <button 
                      onClick={(e) => { e.stopPropagation(); moveKanban(record, 'Pending'); }}
                      className="text-[9px] font-black text-zinc-400 hover:text-zinc-900 border border-zinc-100 px-2 py-0.5 rounded uppercase"
                      title="Shift End: Move back to Pending"
                    >
                      Reset
                    </button>
                  </div>
                  <div className="cursor-pointer" onClick={() => startQCFromKanban(record)}>
                    <p className="text-sm font-black text-zinc-900 mb-1">{record.productName}</p>
                    <p className="text-[10px] font-mono font-bold text-zinc-500">{record.frameNo}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Completed Column */}
          <div 
            className="flex flex-col h-full"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, 'Completed')}
          >
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest text-emerald-600">Passed / Completed</h3>
              </div>
              <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded text-[10px] font-black tracking-tighter">
                {productionRecords.filter(r => r.qcStatus === 'Completed').length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
              {productionRecords.filter(r => r.qcStatus === 'Completed').map(record => (
                <div 
                  key={record.id} 
                  draggable={user.role !== 'Production'}
                  onDragStart={(e) => onDragStart(e, record)}
                  className="card p-4 relative cursor-grab active:cursor-grabbing"
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">VERIFIED</p>
                    {user.role !== 'Production' && (
                      <button 
                        onClick={() => moveKanban(record, 'In Progress')}
                        className="text-[9px] font-black text-zinc-400 hover:text-amber-600 border border-zinc-100 px-2 py-0.5 rounded uppercase"
                        title="QC: Re-open for modification"
                      >
                        Re-open
                      </button>
                    )}
                  </div>
                  <p className="text-sm font-black text-zinc-900 mb-1">{record.productName}</p>
                  <p className="text-[10px] font-mono font-bold text-zinc-500">{record.frameNo}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'form' && (
        submitted ? (
          <div className="card p-20 text-center animate-in zoom-in duration-300">
            <CheckCircle2 className="mx-auto text-emerald-500 mb-6" size={64} />
            <h3 className="text-2xl font-black text-zinc-900 mb-2">Audit Report Certified</h3>
            <p className="text-zinc-500 font-medium max-w-md mx-auto">The report has been locked and unit status has been updated to COMPLETED.</p>
            <button onClick={() => setActiveTab('kanban')} className="mt-8 px-6 py-3 bg-zinc-900 text-white font-black rounded-xl text-xs uppercase tracking-widest">Back to Board</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="card p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <label className="label">Audit Template</label>
                <select 
                  className="input font-bold"
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  required
                >
                  <option value="">Choose Registry...</option>
                  {(Object.values(masterTemplates) as QCTemplate[]).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Batch Tracking No.</label>
                <input 
                  type="text" 
                  value={form.orderNo}
                  onChange={(e) => setForm({...form, orderNo: e.target.value})}
                  className="input font-mono font-bold" 
                  placeholder="Enter Batch No."
                  required 
                />
              </div>
              <div>
                <label className="label">Unit Serial No.</label>
                <input 
                  type="text" 
                  value={form.frameNo}
                  onChange={(e) => setForm({...form, frameNo: e.target.value})}
                  className="input font-mono font-bold" 
                  placeholder="Enter Serial No."
                  required 
                />
              </div>
            </div>

            {templateKey && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300 pb-20">
                {sections.map((section, sIdx) => (
                  <div key={sIdx} className="card overflow-visible">
                    <div className="bg-zinc-900 px-6 py-3 flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">{section.title}</h4>
                      {canManageCriteria && (
                        <button 
                          type="button" 
                          onClick={() => addCheckpoint(sIdx)}
                          className="text-[10px] font-black bg-white/10 text-white hover:bg-white/20 px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <Plus size={12} /> Add Point
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {section.items.map((item, iIdx) => (
                        <div key={item.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-zinc-50/50 transition-colors">
                          <div className="flex-1 flex items-center gap-3">
                            <span className="w-6 h-6 bg-zinc-100 text-zinc-400 text-[10px] font-black flex items-center justify-center rounded-lg">{iIdx + 1}</span>
                            {canManageCriteria ? (
                              <div className="flex-1 flex items-center gap-2">
                                <input 
                                  type="text" 
                                  value={item.text}
                                  onChange={(e) => updateItemText(sIdx, iIdx, e.target.value)}
                                  onBlur={handleTextBlur}
                                  className="bg-transparent border-none focus:ring-0 font-bold text-zinc-900 flex-1 p-0"
                                />
                                <button type="button" onClick={() => removeCheckpoint(sIdx, iIdx)} className="text-zinc-300 hover:text-red-500">
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ) : (
                              <p className="font-bold text-zinc-900 flex-1">{item.text || 'Untitled Audit Point'}</p>
                            )}
                          </div>
                          <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl shrink-0">
                            {[
                              { val: 'OK', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
                              { val: 'NOK', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-100 text-red-700' },
                              { val: 'NA', icon: AlertCircle, color: 'text-zinc-400', bg: 'bg-white border-zinc-200 text-zinc-500' },
                            ].map((s) => (
                              <button
                                key={s.val}
                                type="button"
                                onClick={() => updateItemStatus(sIdx, iIdx, s.val as any)}
                                className={cn(
                                  "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-black transition-all border",
                                  item.status === s.val 
                                    ? s.bg + " shadow-sm border-zinc-300" 
                                    : "bg-transparent border-transparent grayscale opacity-40 hover:opacity-100"
                                )}
                              >
                                {<s.icon size={14} className={s.color} />}
                                {s.val}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                
                <div className="flex justify-end gap-3 pt-6">
                  <button type="button" onClick={() => setTemplateKey('')} className="h-12 px-6 font-black text-zinc-400 hover:text-zinc-900 uppercase text-xs tracking-widest">Abort</button>
                  <button type="submit" disabled={submitting} className="h-12 px-8 bg-zinc-900 text-white font-black rounded-2xl shadow-xl shadow-zinc-900/10">
                    {submitting ? 'COMMITTING...' : 'FINAL CERTIFICATION'}
                  </button>
                </div>
              </div>
            )}
          </form>
        )
      )}

      {activeTab === 'history' && <QCList />}
    </div>
  );
}

function QCList() {
  const [reports, setReports] = useState<QCReport[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'qc_reports'), (snap) => {
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() } as QCReport)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'qc_reports');
    });
    return unsub;
  }, []);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-100">
              <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Date</th>
              <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Batch Tracking</th>
              <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Unit Serial</th>
              <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Inspector</th>
              <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 font-mono">
            {reports.sort((a, b) => b.timestamp - a.timestamp).map((r) => {
              const hasNoK = r.sections.some(s => s.items.some(i => i.status === 'NOK'));
              return (
                <tr key={r.id} className="hover:bg-zinc-50 transition-colors text-xs font-bold">
                  <td className="px-6 py-4 text-zinc-400">{format(r.timestamp, 'dd/MM/yy')}</td>
                  <td className="px-6 py-4 text-zinc-900">{r.orderNo}</td>
                  <td className="px-6 py-4 text-zinc-900">{r.frameNo}</td>
                  <td className="px-6 py-4 text-zinc-500 text-[10px] uppercase font-black tracking-tight">{r.inspector}</td>
                  <td className="px-6 py-4">
                    <div className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
                      hasNoK ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                    )}>
                      {hasNoK ? 'FLAGGED (FAIL)' : 'STANDARD (PASS)'}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
