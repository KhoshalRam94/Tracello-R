import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { InspectionRecord, UserSession } from '../types';
import { format } from 'date-fns';
import { Search, Filter, QrCode, Download, Eye, ChevronRight, X, Printer, ArrowUpDown, Fingerprint, Pencil, Trash2, Save } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '../lib/utils';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function RecordsPage({ user }: { user: UserSession }) {
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<InspectionRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<InspectionRecord | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  
  // Column-level filters
  const [filters, setFilters] = useState({
    orderNo: '',
    productName: '',
    frameNo: '',
    inspector: ''
  });

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'inspections'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as InspectionRecord)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'inspections'));
    return unsub;
  }, []);

  const filteredRecords = records.filter(r => {
    const globalSearch = searchTerm.toLowerCase();
    const globalMatch = !searchTerm || 
      r.orderNo.toLowerCase().includes(globalSearch) ||
      (r.frameNo || '').toLowerCase().includes(globalSearch) ||
      r.inspector.toLowerCase().includes(globalSearch);

    const columnMatch = 
      r.orderNo.toLowerCase().includes(filters.orderNo.toLowerCase()) &&
      r.productName.toLowerCase().includes(filters.productName.toLowerCase()) &&
      (r.frameNo || '').toLowerCase().includes(filters.frameNo.toLowerCase()) &&
      r.inspector.toLowerCase().includes(filters.inspector.toLowerCase());

    return globalMatch && columnMatch;
  });

  const downloadPDF = async () => {
    if (!modalRef.current || !selectedRecord) return;
    
    // Hide buttons during capture
    const noPrintElements = modalRef.current.querySelectorAll('.noprint');
    noPrintElements.forEach(el => (el as HTMLElement).style.display = 'none');

    try {
      // Small delay to ensure all elements are visible
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(modalRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: modalRef.current.scrollWidth,
        windowHeight: modalRef.current.scrollHeight,
        onclone: (clonedDoc) => {
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            * { color-scheme: light !important; -webkit-print-color-adjust: exact !important; }
            .bg-zinc-900 { background-color: #18181b !important; color: white !important; }
            .bg-zinc-100 { background-color: #f4f4f5 !important; }
            .bg-zinc-50 { background-color: #fafafa !important; }
            .text-zinc-900 { color: #18181b !important; }
            .bg-emerald-50 { background-color: #ecfdf5 !important; }
            .text-emerald-600 { color: #059669 !important; }
            .tracking-tighter { letter-spacing: -0.05em !important; }
          `;
          clonedDoc.head.appendChild(style);
        }
      });
      
      noPrintElements.forEach(el => (el as HTMLElement).style.display = '');

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`Tracello_Certificate_${selectedRecord.orderNo}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
    } finally {
      noPrintElements.forEach(el => (el as HTMLElement).style.display = '');
    }
  };

  const handlePrintQR = (record: InspectionRecord) => {
    const win = window.open('', 'Print QR', 'width=400,height=600');
    if (win) {
      win.document.write(`
        <html>
          <head>
            <title>Print QR - ${record.frameNo}</title>
            <style>
              @page { margin: 10mm; }
              body { 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0; 
                font-family: sans-serif;
                text-align: center;
              }
              #qr { padding: 20px; background: white; }
              h1 { margin: 20px 0 5px 0; font-size: 24px; font-weight: 900; }
              p { margin: 0; font-family: monospace; font-size: 16px; color: #666; font-weight: bold; }
              .order { font-size: 12px; color: #999; margin-top: 10px; text-transform: uppercase; letter-spacing: 2px; }
            </style>
          </head>
          <body>
            <div id="qr"></div>
            <h1>${record.productName}</h1>
            <p>${record.frameNo}</p>
            <div class="order">Order: ${record.orderNo}</div>
            <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
            <script>
              const qr = qrcode(0, 'M');
              qr.addData('${record.frameNo}');
              qr.make();
              document.getElementById('qr').innerHTML = qr.createImgTag(10);
              window.onload = () => {
                window.print();
              };
            </script>
          </body>
        </html>
      `);
      win.document.close();
    }
  };

  const handleDelete = async (record: InspectionRecord) => {
    if (!confirm(`Are you sure you want to delete inspection record for Frame No: ${record.frameNo}? This action cannot be undone.`)) return;
    
    try {
      await deleteDoc(doc(db, 'inspections', record.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `inspections/${record.id}`);
    }
  };

  const startEdit = (record: InspectionRecord) => {
    setEditingRecord(record);
    setEditValues({
      productName: record.productName,
      orderNo: record.orderNo,
      frameNo: record.frameNo,
      ...record.dynamicFields
    });
  };

  const handleUpdate = async () => {
    if (!editingRecord) return;
    
    try {
      const { productName, orderNo, frameNo, ...dynamicFields } = editValues;
      const docRef = doc(db, 'inspections', editingRecord.id);
      
      await updateDoc(docRef, {
        productName: (user.role === 'Admin' || user.role === 'QC') ? productName : editingRecord.productName,
        orderNo,
        frameNo,
        dynamicFields,
      });
      
      setEditingRecord(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inspections/${editingRecord.id}`);
    }
  };

  return (
    <div className="space-y-6 text-zinc-900">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tighter uppercase">Master Control Center</h1>
          <p className="text-zinc-500 text-sm font-medium">History of all unit traceability and inspection logs</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input 
              type="text" 
              placeholder="Quick search..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-64 h-10 border-zinc-200"
            />
          </div>
          <button 
            onClick={() => setFilters({ orderNo: '', productName: '', frameNo: '', inspector: '' })}
            className="h-10 px-4 bg-zinc-100 text-zinc-600 font-bold rounded-xl hover:bg-zinc-200 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-zinc-50/80 border-b border-zinc-100">
                <th className="table-header min-w-[140px] py-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                      <Fingerprint size={12} />
                      Batch Tracking
                    </div>
                    <input 
                      type="text" 
                      placeholder="Filter..." 
                      className="w-full h-8 px-3 text-[10px] font-bold bg-white border border-zinc-200 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
                      value={filters.orderNo}
                      onChange={(e) => setFilters(f => ({ ...f, orderNo: e.target.value }))}
                    />
                  </div>
                </th>
                <th className="table-header min-w-[180px] py-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                      <Filter size={12} />
                      Sub-Category
                    </div>
                    <input 
                      type="text" 
                      placeholder="Filter..." 
                      className="w-full h-8 px-3 text-[10px] font-bold bg-white border border-zinc-200 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
                      value={filters.productName}
                      onChange={(e) => setFilters(f => ({ ...f, productName: e.target.value }))}
                    />
                  </div>
                </th>
                <th className="table-header min-w-[180px] py-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                      <QrCode size={12} />
                      Unit ID
                    </div>
                    <input 
                      type="text" 
                      placeholder="Filter..." 
                      className="w-full h-8 px-3 text-[10px] font-bold bg-white border border-zinc-200 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
                      value={filters.frameNo}
                      onChange={(e) => setFilters(f => ({ ...f, frameNo: e.target.value }))}
                    />
                  </div>
                </th>
                <th className="table-header min-w-[160px] py-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                      <ArrowUpDown size={12} />
                      Inspector
                    </div>
                    <input 
                      type="text" 
                      placeholder="Filter..." 
                      className="w-full h-8 px-3 text-[10px] font-bold bg-white border border-zinc-200 rounded-lg outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
                      value={filters.inspector}
                      onChange={(e) => setFilters(f => ({ ...f, inspector: e.target.value }))}
                    />
                  </div>
                </th>
                <th className="table-header py-4">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-11">Timestamp</div>
                </th>
                <th className="table-header py-4">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-11">QC Status</div>
                </th>
                <th className="table-header text-right py-4 pr-6">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-11">Admin. Commands</div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filteredRecords.map((record) => (
                <tr key={record.id} className="hover:bg-zinc-50/50 transition-colors group">
                  <td className="table-cell">
                    <span className="font-mono text-zinc-900 font-black px-2 py-1 bg-zinc-100 rounded text-[10px]">{record.orderNo}</span>
                  </td>
                  <td className="table-cell">
                    <span className="font-bold text-zinc-900 text-sm">{record.productName}</span>
                  </td>
                  <td className="table-cell font-mono text-xs">{record.frameNo}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 bg-zinc-900 text-white rounded-lg flex flex-col items-center justify-center text-[8px] font-black leading-none">
                        <span>{record.inspector.slice(0, 2).toUpperCase()}</span>
                        <div className="w-full h-[1px] bg-white/20 my-1" />
                        <span>LOG</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-black text-zinc-900 text-[11px] uppercase tracking-tighter">{record.inspector}</span>
                        <span className="text-[9px] text-zinc-400 font-bold">{record.authEmail || 'System'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <div className="text-[11px] font-black text-zinc-900">{format(record.timestamp, 'MMM dd, yyyy')}</div>
                    <div className="text-[9px] uppercase font-black text-zinc-400 tracking-tighter">{format(record.timestamp, 'HH:mm:ss')}</div>
                  </td>
                  <td className="table-cell">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                      record.qcStatus === 'Completed' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                      record.qcStatus === 'In Progress' ? "bg-amber-50 text-amber-600 border-amber-100" :
                      "bg-zinc-50 text-zinc-400 border-zinc-100"
                    )}>
                      {record.qcStatus || 'Pending'}
                    </span>
                  </td>
                  <td className="table-cell text-right pr-6">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setSelectedRecord(record)}
                        className="p-2.5 hover:bg-zinc-900 hover:text-white rounded-xl text-zinc-400 transition-all shadow-sm"
                        title="Expand Report"
                      >
                        <Eye size={16} />
                      </button>
                      {user.role === 'Admin' && (
                        <>
                          <button 
                            onClick={() => startEdit(record)}
                            className="p-2.5 hover:bg-zinc-900 hover:text-white rounded-xl text-zinc-400 transition-all shadow-sm"
                            title="Modify Record"
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(record)}
                            className="p-2.5 hover:bg-red-500 hover:text-white rounded-xl text-zinc-400 transition-all shadow-sm"
                            title="Destroy Record"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                      <button 
                        onClick={() => handlePrintQR(record)}
                        className="p-2.5 hover:bg-zinc-900 hover:text-white rounded-xl text-zinc-400 transition-all shadow-sm" 
                        title="Print QR Label"
                      >
                        <QrCode size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredRecords.length === 0 && (
          <div className="py-32 text-center">
            <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Filter className="text-zinc-200" size={32} />
            </div>
            <p className="font-black uppercase text-[10px] tracking-[0.2em] text-zinc-400">Zero matching reports found</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" onClick={() => setEditingRecord(null)} />
          <div className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="bg-zinc-900 p-8 text-white flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.3em]">Edit Inspection Record</h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mt-2">ID: {editingRecord.id}</p>
              </div>
              <button 
                onClick={() => setEditingRecord(null)}
                className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              {(user.role === 'Admin' || user.role === 'QC') && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Category / Product Name</label>
                  <input 
                    type="text" 
                    value={editValues.productName}
                    onChange={(e) => setEditValues({ ...editValues, productName: e.target.value })}
                    className="input h-12 bg-zinc-50 font-bold"
                    placeholder="Enter Product Name"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Order No</label>
                  <input 
                    type="text" 
                    value={editValues.orderNo}
                    onChange={(e) => setEditValues({ ...editValues, orderNo: e.target.value })}
                    className="input h-12 bg-zinc-50 font-mono font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Frame No</label>
                  <input 
                    type="text" 
                    value={editValues.frameNo}
                    onChange={(e) => setEditValues({ ...editValues, frameNo: e.target.value })}
                    className="input h-12 bg-zinc-50 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.2em] border-b border-zinc-100 pb-2">Dynamic Fields</p>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(editingRecord.dynamicFields).map(([label]) => (
                    <div key={label} className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{label}</label>
                      <input 
                        type="text" 
                        value={editValues[label]}
                        onChange={(e) => setEditValues({ ...editValues, [label]: e.target.value })}
                        className="input h-12 bg-zinc-50 font-mono text-sm font-bold"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button 
                  onClick={() => setEditingRecord(null)}
                  className="flex-1 h-12 bg-zinc-100 text-zinc-600 font-black rounded-xl hover:bg-zinc-200 transition-all"
                >
                  CANCEL
                </button>
                <button 
                  onClick={handleUpdate}
                  className="flex-[2] h-12 bg-zinc-900 text-white font-black rounded-xl shadow-lg shadow-zinc-900/20 flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all"
                >
                  <Save size={18} />
                  SAVE CHANGES
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-md" onClick={() => setSelectedRecord(null)} />
          <div 
            ref={modalRef}
            className="relative bg-white w-full max-w-xl rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] overflow-hidden animate-in zoom-in duration-300"
          >
            <div className="bg-zinc-900 p-8 text-white flex items-center justify-between noprint">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.3em]">Technical Certificate</h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mt-2">HASH: {selectedRecord.id.slice(0, 16)}</p>
              </div>
              <button 
                onClick={() => setSelectedRecord(null)}
                className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-xl flex items-center justify-center transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-12">
              <div className="flex flex-col mb-12">
                <div className="flex justify-between items-start mb-10 w-full">
                  <div>
                    <h2 className="text-5xl font-black text-zinc-900 mb-3 tracking-tighter leading-tight">{selectedRecord.productName}</h2>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black uppercase tracking-widest italic">Authenticity Verified</span>
                    </div>
                  </div>
                  
                  <div className="p-5 bg-white border-4 border-zinc-50 rounded-[2.5rem] shadow-2xl">
                    <QRCodeSVG 
                      value={selectedRecord.frameNo} 
                      size={120}
                      level="H"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-12 w-full">
                  <div>
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-3">Unit Identity</p>
                    <p className="text-xl font-mono font-black text-zinc-900">{selectedRecord.frameNo}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-3">Batch Tracking</p>
                    <p className="text-xl font-mono font-black text-zinc-900">{selectedRecord.orderNo}</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-100 pt-10 mt-10">
                <h4 className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.3em] mb-8 text-center underline decoration-zinc-900 underline-offset-[12px]">Component Genealogy</h4>
                <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                  {Object.entries(selectedRecord.dynamicFields).map(([label, value]) => (
                    <div key={label} className="group">
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">{label}</p>
                      <p className="text-sm font-mono font-black text-zinc-900 bg-zinc-50 px-4 py-3 rounded-2xl border border-zinc-100 group-hover:bg-zinc-100 transition-colors">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-zinc-100 pt-10 mt-10 flex justify-between items-end">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-zinc-900 rounded-2xl flex flex-col items-center justify-center text-white font-black text-[10px] shadow-lg leading-none">
                    <span>{selectedRecord.inspector.slice(0, 2).toUpperCase()}</span>
                    <div className="w-8 h-[1px] bg-white/20 my-1"/>
                    <span className="text-[8px]">LOG</span>
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] mb-1">Production Lead</p>
                    <p className="text-lg font-black text-zinc-900 leading-none">{selectedRecord.inspector}</p>
                    <p className="text-[10px] font-black text-zinc-400 mt-2 italic">{format(selectedRecord.timestamp, 'PPpp')}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="w-32 h-1 bg-zinc-900 rounded-full mb-3" />
                  <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.3em]">Biometric Registry Seal</p>
                </div>
              </div>

              <div className="mt-16 flex gap-4 noprint">
                <button 
                  onClick={downloadPDF}
                  className="flex-1 h-16 bg-zinc-900 text-white font-black rounded-2xl shadow-2xl shadow-zinc-900/20 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all uppercase tracking-widest text-xs"
                >
                  <Download size={20} />
                  GENERATE PDF CERTIFICATE
                </button>
                <button 
                  onClick={() => window.print()}
                  className="w-16 h-16 bg-zinc-100 text-zinc-900 font-black rounded-2xl flex items-center justify-center hover:bg-zinc-200 transition-colors"
                  title="Direct Print"
                >
                  <Printer size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .fixed.inset-0, .fixed.inset-0 * { visibility: visible; }
          .noprint { display: none !important; }
          .fixed.inset-0 { position: absolute !important; left: 0; top: 0; width: 100%; border: none !important; padding: 0 !important; }
          .bg-zinc-900\\/60 { display: none !important; }
          .shadow-2xl { shadow: none !important; }
          .rounded-3xl { border: 1px solid #eee; }
        }
      `}</style>
    </div>
  );
}

