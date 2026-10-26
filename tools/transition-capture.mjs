/** Install a capture-only, bounded plain-data export queue in the test page.
 * Completed reports already came from detached telemetry snapshots; no live game or
 * renderer object is retained. Readbacks never omit/truncate chronology rows. */
export function installTransitionCapture(target=globalThis){
  const pending=new Map(),encoder=new TextEncoder();
  const maximumReports=48,maximumRecords=8192,maximumBytes=32768,maximumRows=64;
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  target.__transitionCapture={
    stage(reports){
      const headers=[];
      for(const report of reports){
        assert(report.endedAtMs!==null&&report.pendingSpans===0,'Only settled completed reports can be staged.');
        assert(report.records.length<=maximumRecords,'Chronology exceeds its original capture cap.');
        assert(!pending.has(report.id),'Report was staged twice before export.');
        assert(pending.size<maximumReports,'Plain capture export queue exceeds 48 reports.');
        const {records,...header}=report;pending.set(report.id,{records,offset:0});
        headers.push({...header,recordCount:records.length});
      }
      return headers;
    },
    read(id){
      const report=pending.get(id);assert(report,'Unknown or already exported report.');
      const offset=report.offset,records=[];let bytes=0;
      while(report.offset<report.records.length&&records.length<maximumRows){
        const row=report.records[report.offset],size=encoder.encode(JSON.stringify(row)).byteLength;
        assert(size+1024<=maximumBytes,'One chronology row exceeds the bounded protocol payload.');
        if(bytes+size+1024>maximumBytes)break;
        records.push(row);bytes+=size+1;report.offset++;
      }
      const done=report.offset===report.records.length;if(done)pending.delete(id);
      const chunk={id,offset,records,done};
      assert(encoder.encode(JSON.stringify(chunk)).byteLength<=maximumBytes,'Serialized chunk exceeds 32 KiB.');
      return chunk;
    },
    status(){return {pendingReports:pending.size,maximumReports,maximumRecords,maximumBytes,maximumRows};},
    clear(){pending.clear();},
  };
}
