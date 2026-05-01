import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { InspectionRecord } from '../types';
import { format } from 'date-fns';
import { FileSearch, Download, Search, Filter, Calendar, Play, Fingerprint } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';

export default function ReportsPage() {
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inspections'), (snap) => {
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() } as InspectionRecord)));
    });
    return unsub;
  }, []);

  const filteredRecords = records.filter(r => {
    const matchesSearch = 
      r.orderNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.frameNo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.inspector.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.productName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const timestamp = r.timestamp;
    const fromTime = dateFrom ? new Date(dateFrom).getTime() : 0;
    const toTime = dateTo ? new Date(dateTo).getTime() + 86400000 : Infinity;
    
    const matchesDate = timestamp >= fromTime && timestamp <= toTime;
    
    return matchesSearch && matchesDate;
  }).sort((a, b) => b.timestamp - a.timestamp);

  // Group by Order No
  const groupedRecords = filteredRecords.reduce((acc, record) => {
    if (!acc[record.orderNo]) {
      acc[record.orderNo] = [];
    }
    acc[record.orderNo].push(record);
    return acc;
  }, {} as Record<string, InspectionRecord[]>);

  const downloadPDF = () => {
    const doc = new jsPDF() as any;
    doc.text('Tracello-R - Unit Traceability Intelligence Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);
    
    const tableData: any[][] = [];
    
    // Group records by Order No for the PDF table
    Object.entries(groupedRecords).forEach(([orderNo, group]) => {
      (group as InspectionRecord[]).forEach((r, idx) => {
        tableData.push([
          idx === 0 ? orderNo : '', // Only show order No on first line of group
          r.productName,
          r.frameNo,
          r.qcStatus || 'Pending',
          r.inspector,
          format(r.timestamp, 'yyyy-MM-dd HH:mm')
        ]);
      });
      // Add a small divider row if needed or just blank lines?
      // For now, grouped rows is clear enough.
    });

    autoTable(doc, {
      head: [['Batch No', 'Category', 'Unit Serial', 'QC Status', 'Staff', 'Timestamp']],
      body: tableData,
      startY: 30,
      theme: 'grid',
      headStyles: { fillColor: [24, 24, 27], fontStyle: 'bold' },
      columnStyles: {
        0: { fontStyle: 'bold' }
      }
    });

    doc.save(`Tracello_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tighter">Operations Intelligence</h1>
          <p className="text-zinc-500 font-medium">Filtered analytics and throughput metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsLoaded(true)}
            className="h-10 px-6 bg-zinc-100 text-zinc-900 font-black rounded-xl shadow-sm transition-all hover:bg-zinc-200 flex items-center gap-2 uppercase text-xs tracking-widest"
          >
            <Play size={16} fill="currentColor" />
            Load
          </button>
          <button 
            onClick={downloadPDF}
            disabled={!isLoaded || filteredRecords.length === 0}
            className="h-10 px-6 bg-zinc-900 text-white font-black rounded-xl shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 uppercase text-xs tracking-widest disabled:opacity-50 disabled:scale-100"
          >
            <Download size={18} />
            Download PDF
          </button>
        </div>
      </div>

      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="label">Intelligent Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input 
                type="text" 
                placeholder="Batch, Unit ID, Personnel..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          <div>
            <label className="label">Timeline (From)</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input 
                type="date" 
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
          <div>
            <label className="label">Timeline (Until)</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input 
                type="date" 
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoaded ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-100">
                  <th className="table-header pl-8">Batch Tracking</th>
                  <th className="table-header">Category / Product Details</th>
                  <th className="table-header">Produced By</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right pr-8">Timeline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {Object.entries(groupedRecords).map(([orderNo, group]) => (
                  <tr key={orderNo} className="hover:bg-zinc-50 transition-colors group">
                    <td className="py-6 pl-8 align-top">
                      <div className="flex items-center gap-2 mb-1">
                        <Fingerprint size={14} className="text-zinc-400" />
                        <span className="text-lg font-black text-zinc-900 tracking-tighter">{orderNo}</span>
                      </div>
                      <span className="inline-block px-2 py-0.5 bg-zinc-100 text-zinc-500 rounded text-[9px] font-black uppercase tracking-widest">
                        {(group as InspectionRecord[]).length} {(group as InspectionRecord[]).length === 1 ? 'Item' : 'Items'}
                      </span>
                    </td>
                    <td className="py-6 align-top">
                      <div className="space-y-4">
                        {(group as InspectionRecord[]).map((r, idx) => (
                          <div key={r.id} className="flex items-center gap-4 h-[52px]">
                            <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white text-[10px] font-black shrink-0 shadow-sm">
                              {r.productName.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-black text-zinc-900 truncate uppercase">{r.productName}</p>
                              <p className="text-[10px] font-mono font-bold text-zinc-400">{r.frameNo}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-6 align-top">
                      <div className="space-y-4">
                        {(group as InspectionRecord[]).map((r) => (
                          <div key={r.id} className="h-[52px] flex flex-col justify-center">
                            <p className="text-[10px] font-black text-zinc-900 uppercase">{r.inspector}</p>
                            <p className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest">Operator</p>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-6 align-top">
                      <div className="space-y-4">
                        {(group as InspectionRecord[]).map((r) => (
                          <div key={r.id} className="h-[52px] flex items-center">
                            <span className={cn(
                              "px-2 py-1 rounded text-[9px] font-black uppercase tracking-tighter border",
                              r.qcStatus === 'Completed' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                              r.qcStatus === 'In Progress' ? "bg-amber-50 text-amber-600 border-amber-100" :
                              "bg-zinc-50 text-zinc-400 border-zinc-100"
                            )}>
                              {r.qcStatus || 'Pending'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="py-6 text-right pr-8 align-top">
                      <div className="text-[11px] font-black text-zinc-900">{format(group[0].timestamp, 'MMM dd, yyyy')}</div>
                      <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter">{format(group[0].timestamp, 'HH:mm:ss')}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRecords.length === 0 && (
              <div className="py-20 text-center text-zinc-400">
                <FileSearch className="mx-auto mb-4 opacity-20" size={48} />
                <p className="font-black uppercase text-[10px] tracking-widest leading-loose">No Records Match Intelligence Query</p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-32 text-center">
            <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Play size={32} className="text-zinc-200" fill="currentColor" />
            </div>
            <h3 className="text-sm font-black text-zinc-900 uppercase tracking-widest">Awaiting Command</h3>
            <p className="text-zinc-400 text-xs mt-2">Adjust filters and click 'LOAD' to synchronize intelligence dashboard</p>
          </div>
        )}
      </div>
    </div>
  );
}
