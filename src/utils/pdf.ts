import { jsPDF } from 'jspdf';
import { WeeklyLog, Status, Preferences } from '../types';
import { format, parseISO, isToday } from 'date-fns';

export const generatePDF = (log: WeeklyLog, preferences: Preferences, isInspection = false) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const margin = 10;
  const pageWidth = 210;
  const contentWidth = pageWidth - margin * 2;
  const exportTime = new Date();

  // Header Title
  doc.setFillColor(0, 0, 0);
  doc.rect(margin, margin, contentWidth, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('SynOdos - Log', margin + 2, margin + 5.5);
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('Hours of Service Record — Ontario', margin + 30, margin + 4);
  doc.text('Motor Vehicle Transport Act, R.S.O. 1990, c. M.5', margin + 30, margin + 7);

  doc.setFontSize(8);
  doc.text('24-HOUR PERIOD', margin + contentWidth - 2, margin + 4, { align: 'right' });
  doc.setFontSize(6);
  doc.text('Midnight to Midnight', margin + contentWidth - 2, margin + 7, { align: 'right' });

  // Metadata Block
  let y = margin + 8;
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);

  const md = log.metadata;

  // Helper to draw a bordered field
  const drawField = (x: number, y: number, w: number, h: number, label: string, value: string) => {
    doc.setLineWidth(0.1);
    doc.rect(x, y, w, h);
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.text(label, x + 1, y + 2.5);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value || ''), x + 1, y + 6);
  };

  // Carrier block omitted – operator details moved to remarks section.

  // Group 2: Driver & Log
  doc.setFontSize(5);
  doc.setFont('helvetica', 'bold');
  doc.text('DRIVER & LOG INFORMATION', margin, y - 1);
  drawField(margin, y, contentWidth * 0.4, 8, 'DRIVER\'S NAME', md.driverName);
  if (preferences.showCoDrivers) {
    drawField(margin + contentWidth * 0.4, y, contentWidth * 0.3, 8, 'CO-DRIVER(S)', md.coDrivers);
    drawField(margin + contentWidth * 0.7, y, contentWidth * 0.1, 8, 'WEEK #', md.weekNumber);
    drawField(margin + contentWidth * 0.8, y, contentWidth * 0.1, 8, 'MONTH', md.month);
    drawField(margin + contentWidth * 0.9, y, contentWidth * 0.1, 8, 'YEAR', md.year);
  } else {
    drawField(margin + contentWidth * 0.4, y, contentWidth * 0.3, 8, 'WEEK #', md.weekNumber);
    drawField(margin + contentWidth * 0.7, y, contentWidth * 0.15, 8, 'MONTH', md.month);
    drawField(margin + contentWidth * 0.85, y, contentWidth * 0.15, 8, 'YEAR', md.year);
  }
  y += 12;

  // Group 3: Vehicle
  const hasTrailer = preferences.showTrailerPlate;
  const hasExempt = preferences.showExempt;
  
  if (hasTrailer || hasExempt) {
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.text('VEHICLE INFORMATION', margin, y - 1);
    
    if (hasTrailer && hasExempt) {
      drawField(margin, y, contentWidth * 0.5, 8, 'TRAILER PLATE', md.trailerPlate);
      drawField(margin + contentWidth * 0.5, y, contentWidth * 0.5, 8, 'EXEMPT HRS (14-DAY)', md.exemptHrs14Day);
    } else if (hasTrailer) {
      drawField(margin, y, contentWidth, 8, 'TRAILER PLATE', md.trailerPlate);
    } else if (hasExempt) {
      drawField(margin, y, contentWidth, 8, 'EXEMPT HRS (14-DAY)', md.exemptHrs14Day);
    }
    y += 11;
  }

  // Render all days (supports multi-page)
  const statusLabels = preferences.showSleeper
    ? ['Off-Duty', 'Sleeper', 'Driving', 'On-Duty']
    : ['Off-Duty', 'Driving', 'On-Duty'];

  const labelWidth = 18;
  const hoursWidth = contentWidth - labelWidth;
  const hourWidth = hoursWidth / 24;
  const quarterWidth = hourWidth / 4;
  const rowHeight = 3.5;
  const gridHeight = rowHeight * statusLabels.length;
  const pageHeight = 297; // A4 height in mm
  const bottomMargin = 12;
  const dayBlockHeight = 5 + 3 + gridHeight + 10; // header + hours bar + grid + remarks

  log.days.forEach((day) => {
    // Check if we need a new page
    if (y + dayBlockHeight > pageHeight - bottomMargin) {
      doc.addPage();
      y = margin;
    }

    // Calculate totals first to show in header
    const counts = day.grid.reduce((acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; }, {} as Record<Status, number>);
    const formatH = (q: number) => `${Math.floor(q / 4)}:${String((q % 4) * 15).padStart(2, '0')}`;

    let totalsStr = `OFF-DUTY: ${formatH(counts['off-duty'] || 0)}`;
    if (preferences.showSleeper) totalsStr += ` | SLEEPER BERTH: ${formatH(counts['sleeper'] || 0)}`;
    totalsStr += ` | DRIVING: ${formatH(counts['driving'] || 0)} | ON-DUTY: ${formatH(counts['on-duty'] || 0)}`;

    // Day Header
    doc.setFillColor(30, 30, 30);
    doc.rect(margin, y, contentWidth, 5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const dateObj = parseISO(day.date);
    const dayStr = `${format(dateObj, 'EEEE').toUpperCase()} ${format(dateObj, 'dd-MMM-yyyy')}`;
    doc.text(dayStr, margin + 2, y + 3.5);

    // Total times in header right side
    doc.setFontSize(6);
    doc.text(totalsStr, margin + contentWidth - 2, y + 3.5, { align: 'right' });

    y += 5;
    // Grid Header (Hours)
    doc.setFillColor(60, 60, 60);
    doc.rect(margin, y, contentWidth, 3, 'F');
    doc.setFontSize(5);
    doc.text('DUTY', margin + labelWidth / 2, y + 2.5, { align: 'center' });

    for (let i = 0; i < 24; i++) {
      doc.text(i.toString(), margin + labelWidth + i * hourWidth + 1, y + 2.5);
    }
    y += 3;

    // Grid
    const gridY = y;
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(margin, gridY, contentWidth, gridHeight);

    // Draw rows
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    statusLabels.forEach((label, i) => {
      const rowY = gridY + i * rowHeight;
      doc.setLineWidth(0.1);
      doc.setDrawColor(0);
      if (i > 0) doc.line(margin, rowY, margin + contentWidth, rowY);
      doc.text(label, margin + 1, rowY + 3);
      doc.line(margin + labelWidth, rowY, margin + labelWidth, rowY + rowHeight);

      // Light grid lines
      for (let h = 0; h <= 24; h++) {
        const x = margin + labelWidth + h * hourWidth;
        doc.setDrawColor(0);
        doc.setLineWidth(h % 1 === 0 ? 0.2 : 0.1);
        doc.line(x, gridY, x, gridY + gridHeight);

        if (h < 24) {
          for (let q = 1; q < 4; q++) {
            const qx = x + q * quarterWidth;
            doc.setDrawColor(150);
            doc.setLineWidth(0.05);
            if (q === 2) {
              doc.setLineDashPattern([], 0);
            } else {
              doc.setLineDashPattern([0.5, 0.5], 0);
            }
            doc.line(qx, gridY, qx, gridY + gridHeight);
            doc.setLineDashPattern([], 0); // Reset dash
          }
        }
      }
    });

    // Draw continuous graph
    doc.setLineWidth(0.8);
    doc.setDrawColor(0);

    const getRowY = (status: Status) => {
      let idx = statusLabels.findIndex(l => l.toLowerCase() === status);
      if (idx === -1) idx = 0; // fallback to off-duty if status is hidden
      return gridY + idx * rowHeight + rowHeight / 2;
    };

    if (day.grid && day.grid.length > 0) {
      let prevX = margin + labelWidth;
      let currentStatus = day.grid[0];
      let prevY = getRowY(currentStatus);

      const isDayToday = isToday(dateObj);
      const nowHour = exportTime.getHours();
      const nowMin = exportTime.getMinutes();
      const nowQuarterLimit = nowHour * 4 + Math.floor(nowMin / 15);

      for (let i = 0; i < 96; i++) {
        if (isInspection && isDayToday && i > nowQuarterLimit) break;

        const status = day.grid[i] || 'off-duty';
        const nextX = margin + labelWidth + (i + 1) * quarterWidth;
        const targetY = getRowY(status);

        if (status !== currentStatus) {
          doc.line(prevX, prevY, prevX, targetY); // Vertical
          currentStatus = status;
          prevY = targetY;
        }

        doc.line(prevX, prevY, nextX, prevY); // Horizontal
        prevX = nextX;
      }
    }

    y += gridHeight;

    // Draw vertical marker on today's grid (Inspection only)
    if (isInspection && isToday(dateObj)) {
      const nowHour = exportTime.getHours();
      const nowMin = exportTime.getMinutes();
      const nowFraction = (nowHour * 4 + Math.floor(nowMin / 15)) + (nowMin % 15) / 15;
      const nowX = margin + labelWidth + nowFraction * quarterWidth;

      // Red solid vertical line
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.4);
      doc.line(nowX, gridY, nowX, gridY + gridHeight);
      doc.setDrawColor(0);
    }

    // Combined Remarks / Cycle / Odometer / Operator
    // Determine if the day is fully off‑duty
    const is24hOffDuty = day.grid.every(s => s === 'off-duty');

    doc.setLineWidth(0.2);
    doc.setDrawColor(0);
    doc.rect(margin, y, contentWidth, 8);
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.text('REMARKS', margin + 1, y + 2.5);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');

    if (is24hOffDuty) {
      const dayMeta = day.metadata || md;
      const cycleNum = dayMeta.cycle === '7-Day' ? '1' : '2';
      const cycleInfo = `Cycle: ${cycleNum}`;
      const operatorInfo = [dayMeta.operatorName, dayMeta.operatorBusinessAddress, dayMeta.homeTerminalAddress]
        .filter(Boolean)
        .join(', ');
      const operatorText = operatorInfo ? ` | Operator: ${operatorInfo}` : '';
      const userRemarks = day.remarks ? ` | ${day.remarks}` : '';
      const cmvPlate = day.cmvPlate || dayMeta.cmvPlate;
      const cmvText = cmvPlate ? ` | CMV: ${cmvPlate}` : '';
      doc.text(`${cycleInfo}${cmvText}${operatorText}${userRemarks}`, margin + 1, y + 6);
    } else {
      const startOdo = parseFloat(day.startOdometer || '0');
      const endOdo = parseFloat(day.endOdometer || '0');
      const totalKm = (!isNaN(startOdo) && !isNaN(endOdo) && endOdo > startOdo)
        ? (endOdo - startOdo).toFixed(1).replace(/\.0$/, '')
        : '0';
      const dayMeta = day.metadata || md;
      const cycleNum = dayMeta.cycle === '7-Day' ? '1' : '2';
      const cycleInfo = `Cycle: ${cycleNum}`;
      const odoInfo = `Odometer: Start ${day.startOdometer || '0'}, End ${day.endOdometer || '0'}, Total: ${totalKm} km`;
      const operatorInfo = [dayMeta.operatorName, dayMeta.operatorBusinessAddress, dayMeta.homeTerminalAddress]
        .filter(Boolean)
        .join(', ');
      const operatorText = operatorInfo ? ` | Operator: ${operatorInfo}` : '';
      const userRemarks = day.remarks ? ` | ${day.remarks}` : '';
      const cmvPlate = day.cmvPlate || dayMeta.cmvPlate;
      const cmvText = cmvPlate ? ` | CMV: ${cmvPlate}` : '';
      doc.text(`${cycleInfo} | ${odoInfo}${cmvText}${operatorText}${userRemarks}`, margin + 1, y + 6);
    }

    // Last edited timestamp (Inspection only)
    if (isInspection && day.lastEdited) {
      const editDate = new Date(day.lastEdited);
      const pad = (n: number) => String(n).padStart(2, '0');
      const tz = editDate.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop() || '';
      const editStr = `${editDate.getFullYear()} - ${pad(editDate.getMonth() + 1)} - ${pad(editDate.getDate())} / ${pad(editDate.getHours())}:${pad(editDate.getMinutes())}:${pad(editDate.getSeconds())} ${tz}`;
      doc.setFontSize(5);
      doc.setFont('helvetica', 'italic');
      doc.text(`Last edited: ${editStr}`, margin + contentWidth - 1, y + 6, { align: 'right' });
    }

    y += 9;
  });

  // Footer Signature — check if we need a new page
  if (y + 20 > pageHeight - bottomMargin) {
    doc.addPage();
    y = margin;
  }
  y += 5;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.text('I certify that this information is true and correct to the best of my knowledge.', margin, y);

  y += 6;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  doc.text('Name: ' + (md.signature || md.driverName || ''), margin, y);

  doc.text('Signature:', margin + 60, y);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin + 72, y + 1, margin + 120, y + 1);

  doc.text('Date: ' + format(exportTime, 'dd-MMM-yyyy'), margin + 130, y);
  doc.line(margin + 138, y + 1, margin + contentWidth, y + 1);
  doc.setLineDashPattern([], 0);


  const safeDriverName = (md.driverName || 'driver').replace(/\s+/g, '_');
  const safeWeekNum = md.weekNumber || 'week';
  doc.save(`synodos_${safeDriverName}_${safeWeekNum}.pdf`);
};
